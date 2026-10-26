import { CatalogItem } from './catalog-item.abstract.js';
import type { CatalogItemKind, ItemIdentifier } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { IsbnVo } from './isbn.vo.js';
import type { MetadataVo } from './metadata.vo.js';

/** Book identified by an ISBN code. */
export class Book extends CatalogItem {
  readonly kind: CatalogItemKind = 'book';
  readonly isbn: IsbnVo;

  constructor(metadata: MetadataVo, isbn: IsbnVo, id?: string) {
    super(metadata, id);

    if (!(isbn instanceof IsbnVo)) {
      throw new DomainError('Book: the ISBN must be an instance of IsbnVo.');
    }
    this.isbn = isbn;
  }

  protected get identifier(): ItemIdentifier {
    return { type: 'isbn', value: this.isbn.toIsbn13() };
  }
}
