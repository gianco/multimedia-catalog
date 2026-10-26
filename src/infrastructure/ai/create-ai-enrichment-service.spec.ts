import { describe, expect, it, jest } from '@jest/globals';
import {
  AiEnrichmentError,
  ClaudeAiEnrichmentService,
} from '../../application/services/ai-enrichment.service.js';
import type { ClaudeClient } from '../../application/services/ai-enrichment.service.js';
import { UnavailableAiEnrichmentService } from '../../application/services/unavailable-ai-enrichment.service.js';
import { buildTestConfig } from '../../testing/test-config.js';
import { API_KEY_PLACEHOLDER } from '../config/env.config.js';
import {
  PLACEHOLDER_KEY_MESSAGE,
  createAiEnrichmentService,
} from './create-ai-enrichment-service.js';
import type { ClaudeClientFactory } from './create-ai-enrichment-service.js';

const claudeAnswer = JSON.stringify({ title: 'Dune', classification: 'Science fiction' });

function setup() {
  const create = jest.fn<ClaudeClient['messages']['create']>().mockResolvedValue({
    content: [{ type: 'text', text: claudeAnswer }],
    stop_reason: 'end_turn',
  });
  const createClient = jest.fn<ClaudeClientFactory>().mockReturnValue({ messages: { create } });
  return { create, createClient };
}

describe('createAiEnrichmentService', () => {
  it('builds the Anthropic client with the API key of the configuration', () => {
    const { createClient } = setup();

    createAiEnrichmentService(
      buildTestConfig({ anthropicApiKey: 'sk-ant-from-config' }),
      createClient,
    );

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('sk-ant-from-config');
  });

  it('returns the Claude service of the application layer', () => {
    const { createClient } = setup();

    expect(createAiEnrichmentService(buildTestConfig(), createClient)).toBeInstanceOf(
      ClaudeAiEnrichmentService,
    );
  });

  it('sends every request with the model of the configuration', async () => {
    const { create, createClient } = setup();
    const service = createAiEnrichmentService(
      buildTestConfig({ claudeModel: 'claude-sonnet-5-5' }),
      createClient,
    );

    const metadata = await service.enrich({ kind: 'book', identifier: '9780306406157' });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5-5' }));
    expect(metadata.title).toBe('Dune');
    expect(metadata.enrichmentCompleted).toBe(true);
  });

  it('follows a different model for a different configuration', async () => {
    const { create, createClient } = setup();

    await createAiEnrichmentService(
      buildTestConfig({ claudeModel: 'model-a' }),
      createClient,
    ).enrich({
      kind: 'book',
      identifier: '9780306406157',
    });
    await createAiEnrichmentService(
      buildTestConfig({ claudeModel: 'model-b' }),
      createClient,
    ).enrich({
      kind: 'book',
      identifier: '9780306406157',
    });

    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['model-a', 'model-b']);
  });

  describe('placeholder API key', () => {
    it('disables the AI instead of calling the API with a key that cannot work', async () => {
      const { create, createClient } = setup();
      const service = createAiEnrichmentService(
        buildTestConfig({ anthropicApiKey: API_KEY_PLACEHOLDER }),
        createClient,
      );

      expect(service).toBeInstanceOf(UnavailableAiEnrichmentService);
      await expect(service.enrich({ kind: 'book', identifier: '9780306406157' })).rejects.toThrow(
        AiEnrichmentError,
      );
      expect(createClient).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('tells the user how to enable the AI', async () => {
      const service = createAiEnrichmentService(
        buildTestConfig({ anthropicApiKey: API_KEY_PLACEHOLDER }),
      );

      await expect(service.enrich({ kind: 'cd', identifier: '4006381333931' })).rejects.toThrow(
        PLACEHOLDER_KEY_MESSAGE,
      );
      expect(PLACEHOLDER_KEY_MESSAGE).toMatch(/\.env/);
    });
  });

  it('creates the default client lazily, without any network call', () => {
    const service = createAiEnrichmentService(buildTestConfig({ anthropicApiKey: 'sk-ant-test' }));

    expect(service).toBeInstanceOf(ClaudeAiEnrichmentService);
  });
});
