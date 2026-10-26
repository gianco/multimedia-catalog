import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, Express, RequestHandler } from 'express';
import type { CreateItemManuallyCommand } from '../../application/commands/create-item-manually.command-handler.js';
import type { DeleteItemCommand } from '../../application/commands/delete-item.command-handler.js';
import type { EnrichAndCreateItemCommand } from '../../application/commands/enrich-and-create-item.command-handler.js';
import type { ScanAndCreateFileCommand } from '../../application/commands/scan-and-create-file.command-handler.js';
import type { UpdateItemMetadataCommand } from '../../application/commands/update-item-metadata.command-handler.js';
import type { CommandHandler, QueryHandler } from '../../application/cqrs.interface.js';
import type { GetItemByIdQuery } from '../../application/queries/get-item-by-id.query-handler.js';
import type { GetItemsByTypeQuery } from '../../application/queries/get-items-by-type.query-handler.js';
import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import { CATALOG_ITEM_KINDS, isCatalogItemKind } from '../database/data-mapper.js';
import { parseCreateItemRequest } from './create-item-request.parser.js';
import { errorBody, mapErrorToHttp, RequestValidationError } from './http-error.js';
import { toItemDto } from './item.dto.js';
import { parseUpdateItemRequest } from './update-item-request.parser.js';

/** The CQRS handlers the HTTP layer depends on. Everything else is hidden behind them. */
export interface ApiHandlers {
  readonly createItemManually: CommandHandler<CreateItemManuallyCommand, string>;
  readonly enrichAndCreateItem: CommandHandler<EnrichAndCreateItemCommand, string>;
  readonly scanAndCreateFile: CommandHandler<ScanAndCreateFileCommand, string>;
  readonly deleteItem: CommandHandler<DeleteItemCommand>;
  readonly updateItemMetadata: CommandHandler<UpdateItemMetadataCommand, CatalogItem>;
  readonly getAllItems: { execute(): Promise<CatalogItem[]> };
  readonly getItemsByType: QueryHandler<GetItemsByTypeQuery, CatalogItem[]>;
  readonly getItemById: QueryHandler<GetItemByIdQuery, CatalogItem | null>;
}

export interface CreateAppOptions {
  /** Directory with the built frontend. When it exists it is served next to the API. */
  readonly staticDirectory?: string;
  /** Receives unexpected (5xx) errors. Defaults to `console.error`. */
  readonly logError?: (error: unknown) => void;
  /** Maximum accepted JSON body size. Defaults to 100 KB. */
  readonly jsonBodyLimit?: string;
}

const API_ROOT = '/api/items';

/** Builds the Express application. It does not listen on any port: see `startServer`. */
export function createApp(handlers: ApiHandlers, options: CreateAppOptions = {}): Express {
  const logError = options.logError ?? ((error: unknown) => console.error(error));
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: options.jsonBodyLimit ?? '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post(API_ROOT, async (request, response) => {
    const { mode, command } = parseCreateItemRequest(request.body);

    let id: string;
    switch (mode) {
      case 'manual':
        id = await handlers.createItemManually.execute(command);
        break;
      case 'enrich':
        id = await handlers.enrichAndCreateItem.execute(command);
        break;
      case 'scan':
        id = await handlers.scanAndCreateFile.execute(command);
        break;
    }

    const created = await handlers.getItemById.execute({ id });
    if (created === null) {
      throw new Error(`Item "${id}" was saved but could not be read back.`);
    }
    response
      .status(201)
      .location(`${API_ROOT}/${encodeURIComponent(id)}`)
      .json(toItemDto(created));
  });

  app.get(API_ROOT, async (_request, response) => {
    const items = await handlers.getAllItems.execute();
    response.json(items.map(toItemDto));
  });

  // Registered before "/:id" so that "type" is never interpreted as an id.
  app.get(`${API_ROOT}/type/:type`, async (request, response) => {
    const { type } = request.params;
    if (!isCatalogItemKind(type)) {
      throw new RequestValidationError(
        `Unknown item type "${type}". Supported types: ${CATALOG_ITEM_KINDS.join(', ')}.`,
      );
    }
    const items = await handlers.getItemsByType.execute({ type });
    response.json(items.map(toItemDto));
  });

  app.get(`${API_ROOT}/:id`, async (request, response) => {
    const item = await handlers.getItemById.execute({ id: request.params.id });
    if (item === null) {
      response.status(404).json(errorBody('not_found', `Item "${request.params.id}" not found.`));
      return;
    }
    response.json(toItemDto(item));
  });

  app.put(`${API_ROOT}/:id`, async (request, response) => {
    const updatedMetadataPayload = parseUpdateItemRequest(request.body);
    const updated = await handlers.updateItemMetadata.execute({
      id: request.params.id,
      updatedMetadataPayload,
    });
    response.json(toItemDto(updated));
  });

  app.delete(`${API_ROOT}/:id`, async (request, response) => {
    await handlers.deleteItem.execute({ id: request.params.id });
    response.status(204).end();
  });

  app.use('/api', (_request, response) => {
    response.status(404).json(errorBody('not_found', 'Endpoint not found.'));
  });

  serveFrontend(app, options.staticDirectory);

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const { status, body, shouldLog } = mapErrorToHttp(error);
    if (shouldLog) {
      logError(error);
    }
    response.status(status).json(body);
  };
  app.use(errorHandler);

  return app;
}

function serveFrontend(app: Express, staticDirectory: string | undefined): void {
  if (staticDirectory === undefined || !existsSync(join(staticDirectory, 'index.html'))) {
    return;
  }
  const indexFile = join(staticDirectory, 'index.html');
  const sendIndex: RequestHandler = (_request, response) => {
    response.sendFile(indexFile);
  };

  app.use(express.static(staticDirectory));
  // Client-side routing fallback; API paths never reach this point.
  app.get(/^\/(?!api\/).*/, sendIndex);
}
