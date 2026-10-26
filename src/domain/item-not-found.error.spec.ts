import { ItemNotFoundError } from './item-not-found.error.js';

describe('ItemNotFoundError', () => {
  it('is an Error with the correct name, message and item id', () => {
    const error = new ItemNotFoundError('abc-123');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ItemNotFoundError);
    expect(error.name).toBe('ItemNotFoundError');
    expect(error.message).toBe('Item "abc-123" not found.');
    expect(error.itemId).toBe('abc-123');
  });
});
