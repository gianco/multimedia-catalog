import { Book } from './book.entity.js';
import { CatalogItem } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { IsbnVo } from './isbn.vo.js';
import { MetadataVo } from './metadata.vo.js';

describe('Book', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Il nome della rosa' });
  const buildIsbn = (): IsbnVo => new IsbnVo('978-0-306-40615-7');

  it('extends CatalogItem and encapsulates metadata and ISBN', () => {
    const metadata = buildMetadata();
    const isbn = buildIsbn();

    const book = new Book(metadata, isbn);

    expect(book).toBeInstanceOf(CatalogItem);
    expect(book.kind).toBe('book');
    expect(book.metadata).toBe(metadata);
    expect(book.isbn).toBe(isbn);
    expect(book.id).toEqual(expect.any(String));
  });

  it('accepts an existing id', () => {
    const id = '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c';

    expect(new Book(buildMetadata(), buildIsbn(), id).id).toBe(id);
  });

  it('rejects an ISBN that is not an IsbnVo', () => {
    expect(() => new Book(buildMetadata(), '9780306406157' as unknown as IsbnVo)).toThrow(
      DomainError,
    );
    expect(() => new Book(buildMetadata(), undefined as unknown as IsbnVo)).toThrow(/IsbnVo/);
  });

  it('rejects invalid metadata', () => {
    expect(() => new Book(undefined as unknown as MetadataVo, buildIsbn())).toThrow(DomainError);
  });

  it('uses the ISBN-13 as identifier in the enrichment request', () => {
    const book = new Book(buildMetadata(), new IsbnVo('0306406152'));

    expect(book.buildEnrichmentRequest()).toMatchObject({
      itemId: book.id,
      kind: 'book',
      title: 'Il nome della rosa',
      identifier: { type: 'isbn', value: '9780306406157' },
      missingFields: ['author', 'publicationYear'],
    });
  });

  it('gets enriched through the data returned by Claude', () => {
    const book = new Book(buildMetadata(), buildIsbn());

    book.applyEnrichment({
      aiClassification: 'Giallo storico',
      author: 'Umberto Eco',
      publicationYear: 1980,
    });

    expect(book.isEnriched).toBe(true);
    expect(book.metadata.author).toBe('Umberto Eco');
    expect(book.metadata.publicationYear).toBe(1980);
    expect(() => book.buildEnrichmentRequest()).toThrow(DomainError);
  });
});
