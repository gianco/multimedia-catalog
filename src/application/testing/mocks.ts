import { jest } from '@jest/globals';
import type { MetadataVo } from '../../domain/metadata.vo.js';
import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { AiEnrichmentService } from '../services/ai-enrichment.service.js';
import type {
  ClaudeClient,
  ClaudeMessageRequest,
  ClaudeMessageResponse,
} from '../services/ai-enrichment.service.js';

/** Test helpers shared by the application specs. Not part of the production code. */

export type MockedCatalogItemRepository = {
  [K in keyof CatalogItemRepository]: jest.Mock<CatalogItemRepository[K]>;
};

export function createRepositoryMock(): MockedCatalogItemRepository {
  return {
    save: jest.fn<CatalogItemRepository['save']>().mockResolvedValue(undefined),
    findAll: jest.fn<CatalogItemRepository['findAll']>().mockResolvedValue([]),
    findByType: jest.fn<CatalogItemRepository['findByType']>().mockResolvedValue([]),
    findById: jest.fn<CatalogItemRepository['findById']>().mockResolvedValue(null),
    delete: jest.fn<CatalogItemRepository['delete']>().mockResolvedValue(undefined),
    update: jest.fn<CatalogItemRepository['update']>().mockResolvedValue(undefined),
  };
}

export type MockedAiEnrichmentService = {
  [K in keyof AiEnrichmentService]: jest.Mock<AiEnrichmentService[K]>;
};

export function createAiServiceMock(metadata: MetadataVo): MockedAiEnrichmentService {
  return {
    enrich: jest.fn<AiEnrichmentService['enrich']>().mockResolvedValue(metadata),
  };
}

export type MockedClaudeClient = {
  readonly messages: { readonly create: jest.Mock<ClaudeClient['messages']['create']> };
};

/** Mocked Anthropic client: no network call is ever made. */
export function createClaudeClientMock(): MockedClaudeClient {
  return {
    messages: {
      create: jest.fn<(request: ClaudeMessageRequest) => Promise<ClaudeMessageResponse>>(),
    },
  };
}

export function claudeTextResponse(
  text: string,
  stopReason: string | null = 'end_turn',
): ClaudeMessageResponse {
  return { content: [{ type: 'text', text }], stop_reason: stopReason };
}

export function savedItem(repository: MockedCatalogItemRepository): CatalogItem {
  const [item] = repository.save.mock.calls[0] ?? [];
  if (item === undefined) {
    throw new Error('Expected repository.save to have been called.');
  }
  return item;
}
