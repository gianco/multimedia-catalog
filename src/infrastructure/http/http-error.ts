import { DomainError } from '../../domain/domain.error.js';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import { AiEnrichmentError } from '../../application/services/ai-enrichment.service.js';

/** The request is syntactically or structurally wrong (HTTP 400). */
export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface ErrorResponseBody {
  readonly error: { readonly code: string; readonly message: string };
}

export interface MappedHttpError {
  readonly status: number;
  readonly body: ErrorResponseBody;
  /** `true` for server-side failures that must be logged. */
  readonly shouldLog: boolean;
}

export function errorBody(code: string, message: string): ErrorResponseBody {
  return { error: { code, message } };
}

function mapped(status: number, code: string, message: string, shouldLog = false): MappedHttpError {
  return { status, body: errorBody(code, message), shouldLog };
}

function bodyParserErrorType(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const { type } = error as { type: unknown };
    return typeof type === 'string' ? type : null;
  }
  return null;
}

/**
 * Translates any error into an HTTP response. Details of unexpected failures are never
 * exposed to the client: they are only logged.
 */
export function mapErrorToHttp(error: unknown): MappedHttpError {
  if (error instanceof RequestValidationError) {
    return mapped(400, 'invalid_request', error.message);
  }

  switch (bodyParserErrorType(error)) {
    case 'entity.parse.failed':
      return mapped(400, 'invalid_json', 'The request body is not valid JSON.');
    case 'entity.too.large':
      return mapped(413, 'payload_too_large', 'The request body is too large.');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return mapped(415, 'unsupported_encoding', 'The request encoding is not supported.');
    default:
      break;
  }

  if (error instanceof ItemNotFoundError) {
    return mapped(404, 'not_found', error.message);
  }
  if (error instanceof DomainError) {
    return mapped(422, 'domain_violation', error.message);
  }
  if (error instanceof AiEnrichmentError) {
    return mapped(502, 'ai_enrichment_failed', error.message, true);
  }
  return mapped(500, 'internal_error', 'Internal server error.', true);
}
