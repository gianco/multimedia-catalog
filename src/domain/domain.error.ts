/**
 * Base error of the domain layer.
 * Thrown when a domain invariant or constraint is violated.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
