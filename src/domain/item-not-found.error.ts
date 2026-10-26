/**
 * Raised when an operation targets an item that does not exist in the catalog
 * (e.g. updating or deleting an id that was never saved or was already deleted).
 */
export class ItemNotFoundError extends Error {
  readonly itemId: string;

  constructor(itemId: string) {
    super(`Item "${itemId}" not found.`);
    this.name = new.target.name;
    this.itemId = itemId;
  }
}
