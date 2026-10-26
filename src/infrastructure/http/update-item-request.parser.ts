import type { UpdatedMetadataPayload } from '../../application/commands/update-item-metadata.command-handler.js';
import { RequestValidationError } from './http-error.js';

/** The only properties that `PUT /api/items/:id` is allowed to change. */
export const UPDATABLE_FIELDS = ['title', 'author', 'publicationYear'] as const;

function fail(message: string): never {
  throw new RequestValidationError(message);
}

/**
 * Validates the shape of the body of `PUT /api/items/:id`.
 *
 * The body carries the corrected values: a field that is absent is left unchanged, while `null`
 * clears the author or the publication year. Fields that cannot be corrected by hand (`id`, `kind`,
 * `identifier`, `aiClassification`, `enrichmentCompleted`) are rejected instead of being silently
 * ignored, so a client never believes that something was changed when it was not.
 *
 * Only the structure is checked here; the business rules (non-empty title, valid year...) stay in
 * the domain.
 *
 * @throws RequestValidationError when the body does not have the expected structure
 */
export function parseUpdateItemRequest(body: unknown): UpdatedMetadataPayload {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('The request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  const unsupported = Object.keys(record).filter(
    (key) => !(UPDATABLE_FIELDS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0) {
    return fail(
      `The field(s) ${unsupported.map((key) => `"${key}"`).join(', ')} cannot be updated. ` +
        `Updatable fields: ${UPDATABLE_FIELDS.join(', ')}.`,
    );
  }
  if (Object.keys(record).length === 0) {
    return fail(`The request body must contain at least one of: ${UPDATABLE_FIELDS.join(', ')}.`);
  }

  const { title, author, publicationYear } = record;

  if (title !== undefined && typeof title !== 'string') {
    return fail('The field "title" must be a string.');
  }
  if (author !== undefined && author !== null && typeof author !== 'string') {
    return fail('The field "author" must be a string or null.');
  }
  if (
    publicationYear !== undefined &&
    publicationYear !== null &&
    (typeof publicationYear !== 'number' || !Number.isInteger(publicationYear))
  ) {
    return fail('The field "publicationYear" must be an integer or null.');
  }

  return {
    ...(title !== undefined && { title }),
    ...(author !== undefined && { author }),
    ...(publicationYear !== undefined && { publicationYear }),
  };
}
