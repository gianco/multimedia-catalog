import { beforeEach, describe, expect, it } from '@jest/globals';
import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { Book } from '../../domain/book.entity.js';
import { CD } from '../../domain/cd.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { DomainError } from '../../domain/domain.error.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { createRepositoryMock } from '../testing/mocks.js';
import type { MockedCatalogItemRepository } from '../testing/mocks.js';
import { UpdateItemMetadataCommandHandler } from './update-item-metadata.command-handler.js';

const buildBook = (): Book =>
  new Book(
    new MetadataVo({
      title: 'Dne',
      author: 'F. Herbert',
      publicationYear: 1956,
      aiClassification: 'Science fiction',
      enrichmentCompleted: true,
    }),
    new IsbnVo('9780306406157'),
  );

describe('UpdateItemMetadataCommandHandler', () => {
  let repository: MockedCatalogItemRepository;
  let handler: UpdateItemMetadataCommandHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    handler = new UpdateItemMetadataCommandHandler(repository);
  });

  describe('applying the corrections', () => {
    it('fetches the item, corrects it and updates it in the repository', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      await handler.execute({
        id: book.id,
        updatedMetadataPayload: { title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 },
      });

      expect(repository.findById).toHaveBeenCalledWith(book.id);
      expect(repository.update).toHaveBeenCalledTimes(1);
      const [updated] = repository.update.mock.calls[0] ?? [];
      expect(updated).toBe(book);
      expect(updated?.metadata.title).toBe('Dune');
      expect(updated?.metadata.author).toBe('Frank Herbert');
      expect(updated?.metadata.publicationYear).toBe(1965);
    });

    it('returns the corrected item', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      const result = await handler.execute({
        id: book.id,
        updatedMetadataPayload: { title: 'Dune' },
      });

      expect(result).toBe(book);
      expect(result.title).toBe('Dune');
    });

    it('keeps the values that are not part of the payload', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      await handler.execute({ id: book.id, updatedMetadataPayload: { title: 'Dune' } });

      expect(book.metadata.author).toBe('F. Herbert');
      expect(book.metadata.publicationYear).toBe(1956);
    });

    it('clears the author and the year when they are set to null', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      await handler.execute({
        id: book.id,
        updatedMetadataPayload: { author: null, publicationYear: null },
      });

      expect(book.metadata.author).toBeNull();
      expect(book.metadata.publicationYear).toBeNull();
    });

    it('preserves the AI classification, the enrichment state and the identity', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);
      const { id } = book;

      await handler.execute({ id, updatedMetadataPayload: { title: 'Dune' } });

      expect(book.metadata.aiClassification).toBe('Science fiction');
      expect(book.isEnriched).toBe(true);
      expect(book.id).toBe(id);
      expect(book.isbn.value).toBe('9780306406157');
    });

    it('replaces the metadata value object instead of mutating the old one', async () => {
      const book = buildBook();
      const before = book.metadata;
      repository.findById.mockResolvedValue(book);

      await handler.execute({ id: book.id, updatedMetadataPayload: { title: 'Dune' } });

      expect(book.metadata).not.toBe(before);
      expect(before.title).toBe('Dne');
    });

    it('works for every kind of item', async () => {
      const cd = new CD(new MetadataVo({ title: 'Nevermnd' }), new BarcodeVo('4006381333931'));
      repository.findById.mockResolvedValue(cd);

      await handler.execute({ id: cd.id, updatedMetadataPayload: { title: 'Nevermind' } });

      expect(cd.title).toBe('Nevermind');
      expect(repository.update).toHaveBeenCalledWith(cd);
    });

    it('does not create records: it never calls save', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      await handler.execute({ id: book.id, updatedMetadataPayload: { title: 'Dune' } });

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('throws ItemNotFoundError for an unknown id and writes nothing', async () => {
      repository.findById.mockResolvedValue(null);

      const promise = handler.execute({ id: 'missing', updatedMetadataPayload: { title: 'x' } });

      await expect(promise).rejects.toThrow(ItemNotFoundError);
      await expect(promise).rejects.toThrow('Item "missing" not found.');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty title', { title: '   ' }, /title/],
      ['an invalid year', { publicationYear: 0 }, /publication year/],
      ['a year in the far future', { publicationYear: 99999 }, /publication year/],
      ['an empty author', { author: ' ' }, /author/],
    ])('rejects %s and does not update the repository', async (_label, payload, message) => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      const promise = handler.execute({ id: book.id, updatedMetadataPayload: payload });

      await expect(promise).rejects.toThrow(DomainError);
      await expect(promise).rejects.toThrow(message);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('leaves the item untouched when the correction is invalid', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);

      await expect(
        handler.execute({
          id: book.id,
          updatedMetadataPayload: { title: 'Valid title', publicationYear: 0 },
        }),
      ).rejects.toThrow(DomainError);

      expect(book.metadata.title).toBe('Dne');
      expect(book.metadata.publicationYear).toBe(1956);
    });

    it('rejects a title that would equal the path of a local file, and keeps the old one', async () => {
      const video = new VideoFile(
        new MetadataVo({ title: 'Matrix' }),
        new AbsolutePathVo('/home/user/matrix.mkv'),
      );
      repository.findById.mockResolvedValue(video);

      const promise = handler.execute({
        id: video.id,
        updatedMetadataPayload: { title: '/home/user/matrix.mkv' },
      });

      await expect(promise).rejects.toThrow(/must not coincide with the title/);
      expect(video.title).toBe('Matrix');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('propagates repository failures while reading', async () => {
      repository.findById.mockRejectedValue(new Error('database locked'));

      await expect(
        handler.execute({ id: 'item-1', updatedMetadataPayload: { title: 'x' } }),
      ).rejects.toThrow('database locked');
    });

    it('propagates repository failures while writing', async () => {
      repository.findById.mockResolvedValue(buildBook());
      repository.update.mockRejectedValue(new Error('disk full'));

      await expect(
        handler.execute({ id: 'item-1', updatedMetadataPayload: { title: 'Dune' } }),
      ).rejects.toThrow('disk full');
    });

    it('propagates ItemNotFoundError raised by the repository when the item vanished meanwhile', async () => {
      const book = buildBook();
      repository.findById.mockResolvedValue(book);
      repository.update.mockRejectedValue(new ItemNotFoundError(book.id));

      await expect(
        handler.execute({ id: book.id, updatedMetadataPayload: { title: 'Dune' } }),
      ).rejects.toThrow(ItemNotFoundError);
    });
  });
});
