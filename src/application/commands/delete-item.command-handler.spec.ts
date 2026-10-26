import { beforeEach, describe, expect, it } from '@jest/globals';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import { createRepositoryMock } from '../testing/mocks.js';
import type { MockedCatalogItemRepository } from '../testing/mocks.js';
import { DeleteItemCommandHandler } from './delete-item.command-handler.js';

describe('DeleteItemCommandHandler', () => {
  let repository: MockedCatalogItemRepository;
  let handler: DeleteItemCommandHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    handler = new DeleteItemCommandHandler(repository);
  });

  it('asks the repository to delete the item with the given id', async () => {
    await handler.execute({ id: 'item-1' });

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(repository.delete).toHaveBeenCalledWith('item-1');
  });

  it('resolves without returning a value', async () => {
    await expect(handler.execute({ id: 'item-1' })).resolves.toBeUndefined();
  });

  it('only deletes: it never reads or writes any other record', async () => {
    await handler.execute({ id: 'item-1' });

    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('propagates ItemNotFoundError when the item does not exist', async () => {
    repository.delete.mockRejectedValue(new ItemNotFoundError('missing'));

    await expect(handler.execute({ id: 'missing' })).rejects.toThrow(ItemNotFoundError);
    await expect(handler.execute({ id: 'missing' })).rejects.toThrow('Item "missing" not found.');
  });

  it('propagates repository failures', async () => {
    repository.delete.mockRejectedValue(new Error('database locked'));

    await expect(handler.execute({ id: 'item-1' })).rejects.toThrow('database locked');
  });
});
