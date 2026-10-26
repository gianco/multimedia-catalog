/**
 * Error raised by the persistence layer, e.g. when a stored row cannot be mapped back
 * to a valid domain entity or when an unsupported item type is requested.
 */
export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
