import { beforeEach, describe, expect, it } from '@jest/globals';
import { Book } from '../../domain/book.entity.js';
import { CD } from '../../domain/cd.entity.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { createRepositoryMock } from '../testing/mocks.js';
import type { MockedCatalogItemRepository } from '../testing/mocks.js';
import { GetAllItemsQueryHandler } from './get-all-items.query-handler.js';
import { GetItemByIdQueryHandler } from './get-item-by-id.query-handler.js';
import { GetItemsByTypeQueryHandler } from './get-items-by-type.query-handler.js';

const book = new Book(new MetadataVo({ title: 'Dune' }), new IsbnVo('9780306406157'));
const cd = new CD(new MetadataVo({ title: 'Nevermind' }), new BarcodeVo('4006381333931'));

describe('Query handlers', () => {
  let repository: MockedCatalogItemRepository;

  beforeEach(() => {
    repository = createRepositoryMock();
  });

  describe('GetAllItemsQueryHandler', () => {
    it('returns every item provided by the repository', async () => {
      repository.findAll.mockResolvedValue([book, cd]);

      const result = await new GetAllItemsQueryHandler(repository).execute();

      expect(result).toEqual([book, cd]);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array for an empty catalog', async () => {
      await expect(new GetAllItemsQueryHandler(repository).execute()).resolves.toEqual([]);
    });

    it('propagates repository failures', async () => {
      repository.findAll.mockRejectedValue(new Error('database locked'));

      await expect(new GetAllItemsQueryHandler(repository).execute()).rejects.toThrow(
        'database locked',
      );
    });

    it('never writes to the repository', async () => {
      await new GetAllItemsQueryHandler(repository).execute();

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('GetItemsByTypeQueryHandler', () => {
    it('routes the requested type to the repository and returns the payload', async () => {
      repository.findByType.mockResolvedValue([cd]);

      const result = await new GetItemsByTypeQueryHandler(repository).execute({ type: 'cd' });

      expect(repository.findByType).toHaveBeenCalledTimes(1);
      expect(repository.findByType).toHaveBeenCalledWith('cd');
      expect(result).toEqual([cd]);
    });

    it('returns an empty array when there are no items of that type', async () => {
      await expect(
        new GetItemsByTypeQueryHandler(repository).execute({ type: 'vinyl' }),
      ).resolves.toEqual([]);
    });

    it('propagates the error for an unsupported type', async () => {
      repository.findByType.mockRejectedValue(new Error('Unknown catalog item type'));

      await expect(
        new GetItemsByTypeQueryHandler(repository).execute({ type: 'magazine' }),
      ).rejects.toThrow(Error);
    });
  });

  describe('GetItemByIdQueryHandler', () => {
    it('routes the id to the repository and returns the item', async () => {
      repository.findById.mockResolvedValue(book);

      const result = await new GetItemByIdQueryHandler(repository).execute({ id: book.id });

      expect(repository.findById).toHaveBeenCalledTimes(1);
      expect(repository.findById).toHaveBeenCalledWith(book.id);
      expect(result).toBe(book);
    });

    it('returns null when the item does not exist', async () => {
      await expect(
        new GetItemByIdQueryHandler(repository).execute({ id: 'missing' }),
      ).resolves.toBeNull();
    });

    it('propagates repository failures', async () => {
      repository.findById.mockRejectedValue(new Error('io error'));

      await expect(
        new GetItemByIdQueryHandler(repository).execute({ id: book.id }),
      ).rejects.toThrow('io error');
    });
  });
});
