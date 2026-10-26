import type { CreateItemManuallyCommand } from '../../application/commands/create-item-manually.command-handler.js';
import type { EnrichAndCreateItemCommand } from '../../application/commands/enrich-and-create-item.command-handler.js';
import type { ScanAndCreateFileCommand } from '../../application/commands/scan-and-create-file.command-handler.js';
import {
  isCodeIdentifiedKind,
  isFileKind,
} from '../../application/factories/catalog-item.factory.js';
import { CATALOG_ITEM_KINDS, isCatalogItemKind } from '../database/data-mapper.js';
import { RequestValidationError } from './http-error.js';

/** A validated `POST /api/items` body, ready to be dispatched to the right command handler. */
export type CreateItemRequest =
  | { readonly mode: 'manual'; readonly command: CreateItemManuallyCommand }
  | { readonly mode: 'enrich'; readonly command: EnrichAndCreateItemCommand }
  | { readonly mode: 'scan'; readonly command: ScanAndCreateFileCommand };

const MODES = ['manual', 'enrich', 'scan'] as const;

function fail(message: string): never {
  throw new RequestValidationError(message);
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('The request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') {
    return fail(`The field "${field}" is required and must be a string.`);
  }
  return value;
}

/** `undefined` when the field is absent, `null` when explicitly null. */
function optionalString(record: Record<string, unknown>, field: string): string | null | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'string') {
    return fail(`The field "${field}" must be a string or null.`);
  }
  return value;
}

function optionalInteger(
  record: Record<string, unknown>,
  field: string,
): number | null | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fail(`The field "${field}" must be an integer or null.`);
  }
  return value;
}

function parseMode(record: Record<string, unknown>): CreateItemRequest['mode'] {
  const mode = record['mode'];
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) {
    return fail(`The field "mode" is required and must be one of: ${MODES.join(', ')}.`);
  }
  return mode as CreateItemRequest['mode'];
}

/**
 * Validates the shape of the body of `POST /api/items`.
 *
 * Only the structure is checked here; business rules (valid ISBN, valid path...) stay in the
 * domain and are enforced by the command handlers. Unknown properties are ignored.
 *
 * @throws RequestValidationError when the body does not have the expected structure
 */
export function parseCreateItemRequest(body: unknown): CreateItemRequest {
  const record = asRecord(body);
  const mode = parseMode(record);
  const kind = record['kind'];

  if (mode === 'manual') {
    if (!isCatalogItemKind(kind)) {
      return fail(`The field "kind" must be one of: ${CATALOG_ITEM_KINDS.join(', ')}.`);
    }
    return {
      mode,
      command: {
        kind,
        identifier: requireString(record, 'identifier'),
        title: requireString(record, 'title'),
        author: optionalString(record, 'author'),
        publicationYear: optionalInteger(record, 'publicationYear'),
        aiClassification: optionalString(record, 'aiClassification'),
      },
    };
  }

  if (mode === 'enrich') {
    if (!isCodeIdentifiedKind(kind)) {
      return fail('The mode "enrich" requires a "kind" among: book, vinyl, cd.');
    }
    return { mode, command: { kind, identifier: requireString(record, 'identifier') } };
  }

  if (!isFileKind(kind)) {
    return fail('The mode "scan" requires a "kind" among: video-file, audio-file.');
  }
  return { mode, command: { kind, absolutePath: requireString(record, 'absolutePath') } };
}
