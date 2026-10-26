import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { AiEnrichmentError } from '../services/ai-enrichment.service.js';
import type { LocalMetadataParser } from '../services/local-metadata-parser.service.js';
import { createAiServiceMock, createRepositoryMock, savedItem } from '../testing/mocks.js';
import type { MockedAiEnrichmentService, MockedCatalogItemRepository } from '../testing/mocks.js';
import { ScanAndCreateFileCommandHandler } from './scan-and-create-file.command-handler.js';
import type { ScanAndCreateFileCommand } from './scan-and-create-file.command-handler.js';

const enrichedMetadata = new MetadataVo({
  title: 'Bohemian Rhapsody',
  author: 'Queen',
  publicationYear: 1975,
  aiClassification: 'Rock',
  enrichmentCompleted: true,
});

const audioCommand: ScanAndCreateFileCommand = {
  kind: 'audio-file',
  absolutePath: '/home/user/Music/Queen - Bohemian_Rhapsody.flac',
};

describe('ScanAndCreateFileCommandHandler', () => {
  let repository: MockedCatalogItemRepository;
  let aiService: MockedAiEnrichmentService;
  let parser: jest.Mocked<LocalMetadataParser>;
  let handler: ScanAndCreateFileCommandHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    aiService = createAiServiceMock(enrichedMetadata);
    parser = { parse: jest.fn<LocalMetadataParser['parse']>() };
    parser.parse.mockResolvedValue({ title: 'Local title', author: 'Local author' });
    handler = new ScanAndCreateFileCommandHandler(repository, aiService, parser);
  });

  describe('parsing local metadata', () => {
    it('parses the file at the given absolute path', async () => {
      await handler.execute(audioCommand);

      expect(parser.parse).toHaveBeenCalledTimes(1);
      expect(parser.parse.mock.calls[0]?.[0].value).toBe(audioCommand.absolutePath);
    });

    it('refines the local metadata through the AI service', async () => {
      await handler.execute(audioCommand);

      expect(aiService.enrich).toHaveBeenCalledWith({
        kind: 'audio-file',
        identifier: audioCommand.absolutePath,
        hints: { title: 'Local title', author: 'Local author' },
      });
    });

    it('omits the author hint when the parser does not find one', async () => {
      parser.parse.mockResolvedValue({ title: 'Only title' });

      await handler.execute(audioCommand);

      expect(aiService.enrich).toHaveBeenCalledWith({
        kind: 'audio-file',
        identifier: audioCommand.absolutePath,
        hints: { title: 'Only title' },
      });
    });
  });

  describe('saving the result', () => {
    it('saves an audio file built from the refined metadata and returns its id', async () => {
      const id = await handler.execute(audioCommand);

      expect(repository.save).toHaveBeenCalledTimes(1);
      const item = savedItem(repository);
      expect(item).toBeInstanceOf(AudioFile);
      expect(item.id).toBe(id);
      expect(item.metadata).toBe(enrichedMetadata);
      expect((item as AudioFile).absolutePath.value).toBe(audioCommand.absolutePath);
    });

    it('saves a video file', async () => {
      await handler.execute({ kind: 'video-file', absolutePath: '/home/user/Videos/matrix.mkv' });

      const item = savedItem(repository);
      expect(item).toBeInstanceOf(VideoFile);
      expect(item.kind).toBe('video-file');
    });

    it('runs the pipeline in order: parse, enrich, save', async () => {
      const order: string[] = [];
      parser.parse.mockImplementation(async () => {
        order.push('parse');
        return { title: 'x' };
      });
      aiService.enrich.mockImplementation(async () => {
        order.push('enrich');
        return enrichedMetadata;
      });
      repository.save.mockImplementation(async () => {
        order.push('save');
      });

      await handler.execute(audioCommand);

      expect(order).toEqual(['parse', 'enrich', 'save']);
    });
  });

  describe('failures', () => {
    it('propagates an AI failure and saves nothing', async () => {
      aiService.enrich.mockRejectedValue(new AiEnrichmentError('Claude is down'));

      await expect(handler.execute(audioCommand)).rejects.toThrow(AiEnrichmentError);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('propagates a parser failure without calling the AI or saving', async () => {
      parser.parse.mockRejectedValue(new Error('unreadable file'));

      await expect(handler.execute(audioCommand)).rejects.toThrow('unreadable file');

      expect(aiService.enrich).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it.each([
      ['a relative path', { kind: 'audio-file', absolutePath: 'music/song.flac' }],
      ['a path with ".." segments', { kind: 'audio-file', absolutePath: '/home/../etc/a.flac' }],
      ['an empty path', { kind: 'video-file', absolutePath: '' }],
      ['a kind identified by a code', { kind: 'book', absolutePath: '/home/user/a.pdf' }],
    ] as const)('rejects %s without parsing, calling the AI or saving', async (_label, command) => {
      await expect(handler.execute(command as ScanAndCreateFileCommand)).rejects.toThrow(
        DomainError,
      );

      expect(parser.parse).not.toHaveBeenCalled();
      expect(aiService.enrich).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('propagates repository failures', async () => {
      repository.save.mockRejectedValue(new Error('disk full'));

      await expect(handler.execute(audioCommand)).rejects.toThrow('disk full');
    });
  });

  describe('default mocked parser', () => {
    it('derives author and title from the file name', async () => {
      handler = new ScanAndCreateFileCommandHandler(repository, aiService);

      await handler.execute(audioCommand);

      expect(aiService.enrich).toHaveBeenCalledWith(
        expect.objectContaining({ hints: { title: 'Bohemian Rhapsody', author: 'Queen' } }),
      );
    });
  });
});
