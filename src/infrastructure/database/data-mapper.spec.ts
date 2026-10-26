import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { Book } from '../../domain/book.entity.js';
import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import { CD } from '../../domain/cd.entity.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import { CATALOG_ITEM_KINDS, DataMapper, isCatalogItemKind } from './data-mapper.js';
import { PersistenceError } from './persistence.error.js';

const validRow = {
  id: '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c',
  kind: 'book',
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
  aiClassification: 'Science fiction',
  enrichmentCompleted: 1,
  identifier: '9780306406157',
};

describe('DataMapper', () => {
  const mapper = new DataMapper();

  describe('toRow', () => {
    it('flattens a book', () => {
      const book = new Book(
        new MetadataVo({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 }),
        new IsbnVo('978-0-306-40615-7'),
      );

      expect(mapper.toRow(book)).toEqual({
        id: book.id,
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publicationYear: 1965,
        aiClassification: null,
        enrichmentCompleted: 0,
        identifier: '9780306406157',
      });
    });

    it('maps the enrichment flag to 1 once the item is enriched', () => {
      const book = new Book(new MetadataVo({ title: 'Dune' }), new IsbnVo('9780306406157'));
      book.applyEnrichment({ aiClassification: 'Science fiction' });

      expect(mapper.toRow(book)).toMatchObject({
        aiClassification: 'Science fiction',
        enrichmentCompleted: 1,
      });
    });

    it.each<[string, CatalogItem, string, string]>([
      [
        'vinyl',
        new Vinyl(new MetadataVo({ title: 'Abbey Road' }), new BarcodeVo('036000291452')),
        'vinyl',
        '036000291452',
      ],
      [
        'cd',
        new CD(new MetadataVo({ title: 'Nevermind' }), new BarcodeVo('4006381333931')),
        'cd',
        '4006381333931',
      ],
      [
        'video file',
        new VideoFile(new MetadataVo({ title: 'Matrix' }), new AbsolutePathVo('/v/matrix.mkv')),
        'video-file',
        '/v/matrix.mkv',
      ],
      [
        'audio file',
        new AudioFile(new MetadataVo({ title: 'Song' }), new AbsolutePathVo('/m/song.flac')),
        'audio-file',
        '/m/song.flac',
      ],
    ])('stores the identifier of a %s', (_label, item, kind, identifier) => {
      expect(mapper.toRow(item)).toMatchObject({ id: item.id, kind, identifier });
    });
  });

  describe('toDomain', () => {
    it('rebuilds a book with the correct type and values', () => {
      const item = mapper.toDomain(validRow);

      expect(item).toBeInstanceOf(Book);
      expect(item.id).toBe(validRow.id);
      expect(item.metadata.title).toBe('Dune');
      expect(item.metadata.author).toBe('Frank Herbert');
      expect(item.metadata.publicationYear).toBe(1965);
      expect(item.metadata.aiClassification).toBe('Science fiction');
      expect(item.isEnriched).toBe(true);
      expect((item as Book).isbn.value).toBe('9780306406157');
    });

    it.each([
      ['vinyl', '036000291452', Vinyl],
      ['cd', '4006381333931', CD],
      ['video-file', '/v/matrix.mkv', VideoFile],
      ['audio-file', '/m/song.flac', AudioFile],
    ] as const)('rebuilds a %s', (kind, identifier, expectedClass) => {
      const item = mapper.toDomain({ ...validRow, kind, identifier, enrichmentCompleted: 1 });

      expect(item).toBeInstanceOf(expectedClass);
      expect(item.kind).toBe(kind);
    });

    it('accepts NULL optional columns and a flag of 0', () => {
      const item = mapper.toDomain({
        ...validRow,
        author: null,
        publicationYear: null,
        aiClassification: null,
        enrichmentCompleted: 0,
      });

      expect(item.metadata.author).toBeNull();
      expect(item.metadata.publicationYear).toBeNull();
      expect(item.isEnriched).toBe(false);
    });

    it('accepts bigint integers returned by the driver', () => {
      const item = mapper.toDomain({
        ...validRow,
        publicationYear: BigInt(1965),
        enrichmentCompleted: BigInt(1),
      });

      expect(item.metadata.publicationYear).toBe(1965);
      expect(item.isEnriched).toBe(true);
    });

    it.each([
      ['an unknown kind', { kind: 'magazine' }, /unknown item kind/],
      ['a missing kind', { kind: undefined }, /unknown item kind/],
      ['a non-text id', { id: 42 }, /"id" must be a TEXT value/],
      ['a non-text title', { title: 7 }, /"title" must be a TEXT value/],
      ['a non-text author', { author: 7 }, /"author" must be a TEXT value/],
      [
        'a non-integer year',
        { publicationYear: 1965.5 },
        /"publicationYear" must be a safe INTEGER/,
      ],
      ['a text year', { publicationYear: '1965' }, /"publicationYear" must be a safe INTEGER/],
      ['a flag other than 0/1', { enrichmentCompleted: 2 }, /"enrichmentCompleted" must be 0 or 1/],
      ['a NULL flag', { enrichmentCompleted: null }, /"enrichmentCompleted" must be 0 or 1/],
      ['a non-text identifier', { identifier: null }, /"identifier" must be a TEXT value/],
    ])('throws a PersistenceError for %s', (_label, override, message) => {
      expect(() => mapper.toDomain({ ...validRow, ...override })).toThrow(PersistenceError);
      expect(() => mapper.toDomain({ ...validRow, ...override })).toThrow(message);
    });

    it('wraps domain violations into a PersistenceError keeping the cause', () => {
      const act = (): CatalogItem => mapper.toDomain({ ...validRow, identifier: '1234567890' });

      expect(act).toThrow(PersistenceError);
      expect(act).toThrow(/violates a domain constraint/);

      let thrown: unknown;
      try {
        act();
      } catch (error) {
        thrown = error;
      }
      expect((thrown as PersistenceError).cause).toBeInstanceOf(Error);
    });
  });

  describe('round trip', () => {
    it('preserves every attribute through toRow and toDomain', () => {
      const original = new Vinyl(
        new MetadataVo({ title: 'Abbey Road', author: 'The Beatles', publicationYear: 1969 }),
        new BarcodeVo('036000291452'),
      );
      original.applyEnrichment({ aiClassification: 'Rock' });

      const restored = mapper.toDomain({ ...mapper.toRow(original) });

      expect(restored).toBeInstanceOf(Vinyl);
      expect(restored.id).toBe(original.id);
      expect(restored.metadata.equals(original.metadata)).toBe(true);
      expect((restored as Vinyl).barcode.equals(original.barcode)).toBe(true);
    });
  });

  describe('kind helpers', () => {
    it('lists all the supported kinds', () => {
      expect([...CATALOG_ITEM_KINDS].sort()).toEqual(
        ['audio-file', 'book', 'cd', 'video-file', 'vinyl'].sort(),
      );
    });

    it('recognizes valid kinds and rejects anything else', () => {
      expect(isCatalogItemKind('book')).toBe(true);
      expect(isCatalogItemKind('magazine')).toBe(false);
      expect(isCatalogItemKind('toString')).toBe(false);
      expect(isCatalogItemKind(undefined)).toBe(false);
    });
  });
});
