import { beforeEach, describe, expect, it } from '@jest/globals';
import { Book } from '../../domain/book.entity.js';
import { CD } from '../../domain/cd.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import { AiEnrichmentError } from '../services/ai-enrichment.service.js';
import { createAiServiceMock, createRepositoryMock, savedItem } from '../testing/mocks.js';
import type { MockedAiEnrichmentService, MockedCatalogItemRepository } from '../testing/mocks.js';
import { EnrichAndCreateItemCommandHandler } from './enrich-and-create-item.command-handler.js';
import type { EnrichAndCreateItemCommand } from './enrich-and-create-item.command-handler.js';

const enrichedMetadata = new MetadataVo({
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
  aiClassification: 'Science fiction',
  enrichmentCompleted: true,
});

const bookCommand: EnrichAndCreateItemCommand = { kind: 'book', identifier: '978-0-306-40615-7' };

describe('EnrichAndCreateItemCommandHandler', () => {
  let repository: MockedCatalogItemRepository;
  let aiService: MockedAiEnrichmentService;
  let handler: EnrichAndCreateItemCommandHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    aiService = createAiServiceMock(enrichedMetadata);
    handler = new EnrichAndCreateItemCommandHandler(repository, aiService);
  });

  describe('calling the AI service', () => {
    it('sends the kind and the normalized identifier', async () => {
      await handler.execute(bookCommand);

      expect(aiService.enrich).toHaveBeenCalledTimes(1);
      expect(aiService.enrich).toHaveBeenCalledWith({
        kind: 'book',
        identifier: '9780306406157',
      });
    });

    it('forwards the optional hints', async () => {
      await handler.execute({ ...bookCommand, hints: { title: 'Dune' } });

      expect(aiService.enrich).toHaveBeenCalledWith({
        kind: 'book',
        identifier: '9780306406157',
        hints: { title: 'Dune' },
      });
    });
  });

  describe('saving the result', () => {
    it('builds a book from the enriched metadata, saves it and returns its id', async () => {
      const id = await handler.execute(bookCommand);

      expect(repository.save).toHaveBeenCalledTimes(1);
      const item = savedItem(repository);
      expect(item).toBeInstanceOf(Book);
      expect(item.id).toBe(id);
      expect(item.metadata).toBe(enrichedMetadata);
      expect(item.isEnriched).toBe(true);
      expect((item as Book).isbn.value).toBe('9780306406157');
    });

    it.each([
      ['vinyl', '036000291452', Vinyl],
      ['cd', '4006381333931', CD],
    ] as const)('builds a %s from a barcode', async (kind, identifier, type) => {
      await handler.execute({ kind, identifier });

      const item = savedItem(repository);
      expect(item).toBeInstanceOf(type);
      expect(aiService.enrich).toHaveBeenCalledWith({ kind, identifier });
    });

    it('saves only after the AI answered', async () => {
      const order: string[] = [];
      aiService.enrich.mockImplementation(async () => {
        order.push('enrich');
        return enrichedMetadata;
      });
      repository.save.mockImplementation(async () => {
        order.push('save');
      });

      await handler.execute(bookCommand);

      expect(order).toEqual(['enrich', 'save']);
    });
  });

  describe('failures', () => {
    it('propagates an AI failure and saves nothing', async () => {
      aiService.enrich.mockRejectedValue(new AiEnrichmentError('Claude is down'));

      await expect(handler.execute(bookCommand)).rejects.toThrow(AiEnrichmentError);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('propagates corrupted AI output and saves nothing', async () => {
      aiService.enrich.mockRejectedValue(new AiEnrichmentError('The AI answer is not valid JSON.'));

      await expect(handler.execute(bookCommand)).rejects.toThrow(/not valid JSON/);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it.each([
      ['an invalid ISBN', { kind: 'book', identifier: '1234567890' }],
      ['an invalid barcode', { kind: 'cd', identifier: '4006381333932' }],
      ['a kind built from a file', { kind: 'video-file', identifier: '/home/user/a.mkv' }],
    ] as const)('rejects %s without calling the AI', async (_label, command) => {
      await expect(handler.execute(command as EnrichAndCreateItemCommand)).rejects.toThrow(
        DomainError,
      );

      expect(aiService.enrich).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('propagates repository failures', async () => {
      repository.save.mockRejectedValue(new Error('disk full'));

      await expect(handler.execute(bookCommand)).rejects.toThrow('disk full');
    });
  });
});
