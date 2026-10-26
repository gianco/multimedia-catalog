import { CreateItemManuallyCommandHandler } from '../../application/commands/create-item-manually.command-handler.js';
import { DeleteItemCommandHandler } from '../../application/commands/delete-item.command-handler.js';
import { EnrichAndCreateItemCommandHandler } from '../../application/commands/enrich-and-create-item.command-handler.js';
import { ScanAndCreateFileCommandHandler } from '../../application/commands/scan-and-create-file.command-handler.js';
import { UpdateItemMetadataCommandHandler } from '../../application/commands/update-item-metadata.command-handler.js';
import { GetAllItemsQueryHandler } from '../../application/queries/get-all-items.query-handler.js';
import { GetItemByIdQueryHandler } from '../../application/queries/get-item-by-id.query-handler.js';
import { GetItemsByTypeQueryHandler } from '../../application/queries/get-items-by-type.query-handler.js';
import type { AiEnrichmentService } from '../../application/services/ai-enrichment.service.js';
import type { LocalMetadataParser } from '../../application/services/local-metadata-parser.service.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { ApiHandlers } from './server.js';

/**
 * Composition root of the CQRS handlers: wires the injected ports to the use cases.
 * Tests call it with in-memory fakes, `main.ts` with SQLite and Claude.
 */
export function createHandlers(
  repository: CatalogItemRepository,
  aiEnrichmentService: AiEnrichmentService,
  localMetadataParser?: LocalMetadataParser,
): ApiHandlers {
  return {
    createItemManually: new CreateItemManuallyCommandHandler(repository),
    enrichAndCreateItem: new EnrichAndCreateItemCommandHandler(repository, aiEnrichmentService),
    scanAndCreateFile: new ScanAndCreateFileCommandHandler(
      repository,
      aiEnrichmentService,
      localMetadataParser,
    ),
    deleteItem: new DeleteItemCommandHandler(repository),
    updateItemMetadata: new UpdateItemMetadataCommandHandler(repository),
    getAllItems: new GetAllItemsQueryHandler(repository),
    getItemsByType: new GetItemsByTypeQueryHandler(repository),
    getItemById: new GetItemByIdQueryHandler(repository),
  };
}
