import type { CatalogItem, CatalogItemKind } from '../../domain/catalog-item.abstract.js';
import { DataMapper } from '../database/data-mapper.js';

/** Public JSON representation of a catalog item. Domain objects never leave the API as they are. */
export interface ItemDto {
  readonly id: string;
  readonly kind: CatalogItemKind;
  readonly title: string;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly aiClassification: string | null;
  readonly enrichmentCompleted: boolean;
  /** ISBN, barcode or absolute path, depending on the kind. */
  readonly identifier: string;
}

const mapper = new DataMapper();

export function toItemDto(item: CatalogItem): ItemDto {
  const row = mapper.toRow(item);

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    publicationYear: row.publicationYear,
    aiClassification: row.aiClassification,
    enrichmentCompleted: row.enrichmentCompleted === 1,
    identifier: row.identifier,
  };
}
