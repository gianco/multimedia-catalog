import type { CatalogItem } from '../catalog-item.abstract.js';

/**
 * Persistence contract for catalog items.
 * The domain only knows this abstraction: concrete storage lives in the infrastructure layer.
 */
export interface CatalogItemRepository {
  /** Persists the item, inserting it or updating it when an item with the same id already exists. */
  save(item: CatalogItem): Promise<void>;

  /** Retrieves every item, in insertion order. */
  findAll(): Promise<CatalogItem[]>;

  /** Retrieves all the items of the given kind (e.g. `book`, `vinyl`, `cd`, `video-file`, `audio-file`). */
  findByType(type: string): Promise<CatalogItem[]>;

  /** Retrieves the item with the given id, or `null` when it does not exist. */
  findById(id: string): Promise<CatalogItem | null>;

  /**
   * Removes the item with the given id.
   * @throws ItemNotFoundError when no item has that id
   */
  delete(id: string): Promise<void>;

  /**
   * Writes the current state of an item that already exists, replacing the stored one.
   * Unlike `save` it never creates a record.
   * @throws ItemNotFoundError when the item has never been saved or was deleted
   */
  update(item: CatalogItem): Promise<void>;
}
