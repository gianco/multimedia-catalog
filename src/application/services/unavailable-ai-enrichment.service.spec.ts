import { describe, expect, it } from '@jest/globals';
import { AiEnrichmentError } from './ai-enrichment.service.js';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  UnavailableAiEnrichmentService,
} from './unavailable-ai-enrichment.service.js';

describe('UnavailableAiEnrichmentService', () => {
  it('always fails with an AiEnrichmentError explaining how to enable the AI', async () => {
    const service = new UnavailableAiEnrichmentService();

    await expect(service.enrich()).rejects.toThrow(AiEnrichmentError);
    await expect(service.enrich()).rejects.toThrow(AI_NOT_CONFIGURED_MESSAGE);
    expect(AI_NOT_CONFIGURED_MESSAGE).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('accepts a custom reason', async () => {
    await expect(new UnavailableAiEnrichmentService('Disabled by admin').enrich()).rejects.toThrow(
      'Disabled by admin',
    );
  });
});
