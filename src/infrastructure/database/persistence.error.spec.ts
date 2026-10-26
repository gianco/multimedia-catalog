import { PersistenceError } from './persistence.error.js';

describe('PersistenceError', () => {
  it('is an Error with the correct message and name', () => {
    const error = new PersistenceError('storage failure');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PersistenceError);
    expect(error.message).toBe('storage failure');
    expect(error.name).toBe('PersistenceError');
  });

  it('keeps the original cause', () => {
    const cause = new Error('root cause');

    expect(new PersistenceError('storage failure', { cause }).cause).toBe(cause);
  });
});
