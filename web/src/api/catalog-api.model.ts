import type { CodeIdentifiedKind, FileKind, ItemKind } from '../model/item-kinds.model';

/** An item as returned by the backend. */
export interface Item {
  readonly id: string;
  readonly kind: ItemKind;
  readonly title: string;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly aiClassification: string | null;
  readonly enrichmentCompleted: boolean;
  /** ISBN, barcode or absolute path, depending on the kind. */
  readonly identifier: string;
}

/** Body of `POST /api/items`. */
export type CreateItemRequest =
  | {
      readonly mode: 'manual';
      readonly kind: ItemKind;
      readonly identifier: string;
      readonly title: string;
      readonly author?: string;
      readonly publicationYear?: number;
      readonly aiClassification?: string;
    }
  | { readonly mode: 'enrich'; readonly kind: CodeIdentifiedKind; readonly identifier: string }
  | { readonly mode: 'scan'; readonly kind: FileKind; readonly absolutePath: string };

/**
 * Body of `PUT /api/items/:id`. A property that is missing is left unchanged,
 * `null` clears the author or the publication year.
 */
export interface UpdateItemRequest {
  readonly title?: string;
  readonly author?: string | null;
  readonly publicationYear?: number | null;
}

/** The operations the UI needs from the backend. Components depend on this, not on `fetch`. */
export interface CatalogApi {
  listItems(): Promise<Item[]>;
  listItemsByType(kind: ItemKind): Promise<Item[]>;
  getItem(id: string): Promise<Item>;
  createItem(request: CreateItemRequest): Promise<Item>;
  updateItem(id: string, request: UpdateItemRequest): Promise<Item>;
  deleteItem(id: string): Promise<void>;
}

/** Any failure of an API call, with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The message to show for any thrown value. */
export function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
