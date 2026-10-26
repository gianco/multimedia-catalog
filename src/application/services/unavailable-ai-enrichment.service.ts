import type { MetadataVo } from '../../domain/metadata.vo.js';
import { AiEnrichmentError } from './ai-enrichment.service.js';
import type { AiEnrichmentService } from './ai-enrichment.service.js';

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI enrichment is not configured. Set the ANTHROPIC_API_KEY environment variable to enable it.';

/**
 * Null-object used when no API key is available: manual ingestion keeps working,
 * while every enrichment request fails with a clear, user-facing error.
 */
export class UnavailableAiEnrichmentService implements AiEnrichmentService {
  constructor(private readonly reason: string = AI_NOT_CONFIGURED_MESSAGE) {}

  async enrich(): Promise<MetadataVo> {
    throw new AiEnrichmentError(this.reason);
  }
}
