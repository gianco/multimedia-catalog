import { DomainError } from './domain.error.js';

describe('DomainError', () => {
  it('is an Error with the correct message and name', () => {
    const error = new DomainError('violation');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toBe('violation');
    expect(error.name).toBe('DomainError');
  });

  it('can be caught through instanceof after being thrown', () => {
    const raise = (): never => {
      throw new DomainError('boom');
    };

    expect(raise).toThrow(DomainError);
  });
});
