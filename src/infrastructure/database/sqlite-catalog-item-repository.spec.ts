import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { Book } from '../../domain/book.entity.js';
import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import { CD } from '../../domain/cd.entity.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import { PersistenceError } from './persistence.error.js';
import { SqliteCatalogItemRepository } from './sqlite-catalog-item-repository.js';

const buildBook = (): Book =>
  new Book(
    new MetadataVo({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 }),
    new IsbnVo('978-0-306-40615-7'),
  );
const buildVinyl = (): Vinyl =>
  new Vinyl(new MetadataVo({ title: 'Abbey Road' }), new BarcodeVo('036000291452'));
const buildCd = (): CD =>
  new CD(new MetadataVo({ title: 'Nevermind' }), new BarcodeVo('4006381333931'));
const buildVideoFile = (): VideoFile =>
  new VideoFile(new MetadataVo({ title: 'Matrix' }), new AbsolutePathVo('/home/user/matrix.mkv'));
const buildAudioFile = (): AudioFile =>
  new AudioFile(
    new MetadataVo({ title: 'Bohemian Rhapsody' }),
    new AbsolutePathVo('/home/user/bohemian.flac'),
  );

describe('SqliteCatalogItemRepository (integration, in-memory SQLite)', () => {
  let database: DatabaseSync;
  let repository: CatalogItemRepository;

  beforeEach(() => {
    // A fresh private in-memory database per test guarantees full isolation.
    database = new DatabaseSync(':memory:');
    repository = new SqliteCatalogItemRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  describe('save', () => {
    it('persists a book as a flat row', async () => {
      const book = buildBook();

      await repository.save(book);

      const row = database.prepare('SELECT * FROM catalog_items WHERE id = ?').get(book.id);
      expect({ ...row }).toEqual({
        id: book.id,
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publication_year: 1965,
        ai_classification: null,
        enrichment_completed: 0,
        identifier: '9780306406157',
      });
    });

    it('persists one row per saved entity', async () => {
      await repository.save(buildBook());
      await repository.save(buildVinyl());
      await repository.save(buildCd());

      const count = database.prepare('SELECT COUNT(*) AS total FROM catalog_items').get();
      expect(count?.['total']).toBe(3);
    });

    it('updates the existing row when saving the same id again (upsert)', async () => {
      const book = buildBook();
      await repository.save(book);

      book.applyEnrichment({ aiClassification: 'Science fiction' });
      await repository.save(book);

      const count = database.prepare('SELECT COUNT(*) AS total FROM catalog_items').get();
      expect(count?.['total']).toBe(1);

      const stored = await repository.findById(book.id);
      expect(stored?.isEnriched).toBe(true);
      expect(stored?.metadata.aiClassification).toBe('Science fiction');
    });

    it('stores NULL for the optional metadata that is missing', async () => {
      await repository.save(buildVinyl());

      const row = database
        .prepare('SELECT author, publication_year, ai_classification FROM catalog_items')
        .get();
      expect({ ...row }).toEqual({
        author: null,
        publication_year: null,
        ai_classification: null,
      });
    });

    it('resolves without returning a value', async () => {
      await expect(repository.save(buildBook())).resolves.toBeUndefined();
    });

    it('is safe against SQL injection through user-provided text', async () => {
      const hostile = new Book(
        new MetadataVo({ title: "x'); DROP TABLE catalog_items; --" }),
        new IsbnVo('9780306406157'),
      );

      await repository.save(hostile);

      const stored = await repository.findById(hostile.id);
      expect(stored?.title).toBe("x'); DROP TABLE catalog_items; --");
    });
  });

  describe('findById', () => {
    it('retrieves a book with the correct type and values', async () => {
      const book = buildBook();
      await repository.save(book);

      const found = await repository.findById(book.id);

      expect(found).toBeInstanceOf(Book);
      expect(found?.id).toBe(book.id);
      expect(found?.kind).toBe('book');
      expect(found?.metadata.equals(book.metadata)).toBe(true);
      expect((found as Book).isbn.equals(book.isbn)).toBe(true);
    });

    it.each([
      ['vinyl', buildVinyl, Vinyl],
      ['cd', buildCd, CD],
      ['video file', buildVideoFile, VideoFile],
      ['audio file', buildAudioFile, AudioFile],
    ] as const)('retrieves a %s as an instance of its own class', async (_label, build, type) => {
      const item = build();
      await repository.save(item);

      const found = await repository.findById(item.id);

      expect(found).toBeInstanceOf(type);
      expect(found?.id).toBe(item.id);
      expect(found?.title).toBe(item.title);
    });

    it('restores the specific identity value object', async () => {
      const vinyl = buildVinyl();
      const videoFile = buildVideoFile();
      await repository.save(vinyl);
      await repository.save(videoFile);

      const foundVinyl = (await repository.findById(vinyl.id)) as Vinyl;
      const foundVideoFile = (await repository.findById(videoFile.id)) as VideoFile;

      expect(foundVinyl.barcode.value).toBe('036000291452');
      expect(foundVideoFile.absolutePath.value).toBe('/home/user/matrix.mkv');
    });

    it('preserves the enrichment state', async () => {
      const book = buildBook();
      book.applyEnrichment({ aiClassification: 'Science fiction' });
      await repository.save(book);

      const found = await repository.findById(book.id);

      expect(found?.isEnriched).toBe(true);
      expect(found?.needsEnrichment).toBe(false);
      expect(found?.metadata.aiClassification).toBe('Science fiction');
    });

    it('returns null when the item does not exist', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });

    it('returns a new equal-by-identity instance, not the saved reference', async () => {
      const book = buildBook();
      await repository.save(book);

      const found = await repository.findById(book.id);

      expect(found).not.toBe(book);
      expect(found?.equals(book)).toBe(true);
    });
  });

  describe('findAll', () => {
    it('returns an empty array when the catalog is empty', async () => {
      await expect(repository.findAll()).resolves.toEqual([]);
    });

    it('returns every item with its own concrete type, in insertion order', async () => {
      const items: CatalogItem[] = [
        buildBook(),
        buildVinyl(),
        buildCd(),
        buildVideoFile(),
        buildAudioFile(),
      ];
      for (const item of items) {
        await repository.save(item);
      }

      const found = await repository.findAll();

      expect(found.map((item) => item.id)).toEqual(items.map((item) => item.id));
      expect(found.map((item) => item.constructor)).toEqual([
        Book,
        Vinyl,
        CD,
        VideoFile,
        AudioFile,
      ]);
      expect(found.map((item) => item.kind)).toEqual([
        'book',
        'vinyl',
        'cd',
        'video-file',
        'audio-file',
      ]);
    });

    it('does not duplicate an item that is saved twice', async () => {
      const book = buildBook();
      await repository.save(book);
      await repository.save(book);

      await expect(repository.findAll()).resolves.toHaveLength(1);
    });
  });

  describe('findByType', () => {
    beforeEach(async () => {
      await repository.save(buildBook());
      await repository.save(buildBook());
      await repository.save(buildVinyl());
      await repository.save(buildCd());
      await repository.save(buildVideoFile());
    });

    it('returns only the books', async () => {
      const found = await repository.findByType('book');

      expect(found).toHaveLength(2);
      expect(found.every((item) => item instanceof Book)).toBe(true);
    });

    it.each([
      ['vinyl', Vinyl],
      ['cd', CD],
      ['video-file', VideoFile],
    ] as const)('returns only the items of type %s', async (type, expectedClass) => {
      const found = await repository.findByType(type);

      expect(found).toHaveLength(1);
      expect(found[0]).toBeInstanceOf(expectedClass);
      expect(found[0]?.kind).toBe(type);
    });

    it('returns an empty array for a supported type without items', async () => {
      await expect(repository.findByType('audio-file')).resolves.toEqual([]);
    });

    it('rejects an unsupported type', async () => {
      await expect(repository.findByType('magazine')).rejects.toThrow(PersistenceError);
      await expect(repository.findByType('magazine')).rejects.toThrow(
        /Unknown catalog item type "magazine"/,
      );
    });

    it('is safe against SQL injection through the type argument', async () => {
      await expect(repository.findByType("book' OR '1'='1")).rejects.toThrow(PersistenceError);
    });
  });

  describe('update', () => {
    const rowOf = (id: string) =>
      ({ ...database.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id) }) as Record<
        string,
        unknown
      >;
    const countRows = (): unknown =>
      database.prepare('SELECT COUNT(*) AS total FROM catalog_items').get()?.['total'];

    it('maps the corrected metadata of the entity into the flat columns of its row', async () => {
      const book = new Book(
        new MetadataVo({ title: 'Dne', author: 'F. Herbert', publicationYear: 1956 }),
        new IsbnVo('9780306406157'),
      );
      await repository.save(book);

      book.correctMetadata({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 });
      await repository.update(book);

      expect(rowOf(book.id)).toEqual({
        id: book.id,
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publication_year: 1965,
        ai_classification: null,
        enrichment_completed: 0,
        identifier: '9780306406157',
      });
    });

    it('writes NULL when the author and the year are cleared', async () => {
      const book = buildBook();
      await repository.save(book);

      book.correctMetadata({ author: null, publicationYear: null });
      await repository.update(book);

      expect(rowOf(book.id)).toMatchObject({ author: null, publication_year: null });
    });

    it('updates the row in place: same id, same position, same number of rows', async () => {
      const first = buildBook();
      const second = buildVinyl();
      await repository.save(first);
      await repository.save(second);

      first.correctMetadata({ title: 'Corrected title' });
      await repository.update(first);

      expect(countRows()).toBe(2);
      const all = await repository.findAll();
      expect(all.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(all[0]?.title).toBe('Corrected title');
    });

    it('does not touch the other rows', async () => {
      const book = buildBook();
      const vinyl = buildVinyl();
      await repository.save(book);
      await repository.save(vinyl);
      const vinylRowBefore = rowOf(vinyl.id);

      book.correctMetadata({ title: 'Changed' });
      await repository.update(book);

      expect(rowOf(vinyl.id)).toEqual(vinylRowBefore);
    });

    it('reads the corrected item back as an entity of the same class', async () => {
      const video = buildVideoFile();
      await repository.save(video);

      video.correctMetadata({
        title: 'The Matrix',
        author: 'The Wachowskis',
        publicationYear: 1999,
      });
      await repository.update(video);

      const found = await repository.findById(video.id);
      expect(found).toBeInstanceOf(VideoFile);
      expect(found?.metadata.equals(video.metadata)).toBe(true);
      expect((found as VideoFile).absolutePath.value).toBe('/home/user/matrix.mkv');
    });

    it('persists the enrichment state of the entity', async () => {
      const book = buildBook();
      await repository.save(book);

      book.applyEnrichment({ aiClassification: 'Science fiction' });
      await repository.update(book);

      expect(rowOf(book.id)).toMatchObject({
        ai_classification: 'Science fiction',
        enrichment_completed: 1,
      });
    });

    it('throws ItemNotFoundError and creates nothing for an item that was never saved', async () => {
      const unsaved = buildBook();

      const attempt = repository.update(unsaved);

      await expect(attempt).rejects.toThrow(ItemNotFoundError);
      await expect(attempt).rejects.toThrow(`Item "${unsaved.id}" not found.`);
      expect(countRows()).toBe(0);
    });

    it('throws ItemNotFoundError for an item that was deleted meanwhile', async () => {
      const book = buildBook();
      await repository.save(book);
      await repository.delete(book.id);

      await expect(repository.update(book)).rejects.toThrow(ItemNotFoundError);
      expect(countRows()).toBe(0);
    });

    it('is safe against SQL injection through the corrected text', async () => {
      const book = buildBook();
      await repository.save(book);

      book.correctMetadata({ title: "x'); DROP TABLE catalog_items; --" });
      await repository.update(book);

      expect((await repository.findById(book.id))?.title).toBe("x'); DROP TABLE catalog_items; --");
    });
  });

  describe('delete', () => {
    const countRows = (): unknown =>
      database.prepare('SELECT COUNT(*) AS total FROM catalog_items').get()?.['total'];

    it('removes the row of the item from the table', async () => {
      const book = buildBook();
      await repository.save(book);

      await repository.delete(book.id);

      expect(database.prepare('SELECT * FROM catalog_items WHERE id = ?').get(book.id)).toBe(
        undefined,
      );
      expect(countRows()).toBe(0);
    });

    it('makes the item unreachable from every finder', async () => {
      const book = buildBook();
      await repository.save(book);

      await repository.delete(book.id);

      await expect(repository.findById(book.id)).resolves.toBeNull();
      await expect(repository.findAll()).resolves.toEqual([]);
      await expect(repository.findByType('book')).resolves.toEqual([]);
    });

    it('deletes only the requested item and keeps the others intact', async () => {
      const book = buildBook();
      const vinyl = buildVinyl();
      const cd = buildCd();
      await repository.save(book);
      await repository.save(vinyl);
      await repository.save(cd);

      await repository.delete(vinyl.id);

      const remaining = await repository.findAll();
      expect(remaining.map((item) => item.id)).toEqual([book.id, cd.id]);
      expect(remaining[0]).toBeInstanceOf(Book);
      expect(remaining[1]).toBeInstanceOf(CD);
    });

    it('resolves without returning a value', async () => {
      const book = buildBook();
      await repository.save(book);

      await expect(repository.delete(book.id)).resolves.toBeUndefined();
    });

    it('throws ItemNotFoundError for an id that does not exist', async () => {
      await repository.save(buildBook());

      await expect(repository.delete(randomUUID())).rejects.toThrow(ItemNotFoundError);

      expect(countRows()).toBe(1);
    });

    it('throws ItemNotFoundError when the same item is deleted twice', async () => {
      const book = buildBook();
      await repository.save(book);
      await repository.delete(book.id);

      await expect(repository.delete(book.id)).rejects.toThrow(ItemNotFoundError);
    });

    it('allows saving again an item that was deleted', async () => {
      const book = buildBook();
      await repository.save(book);
      await repository.delete(book.id);

      await repository.save(book);

      expect((await repository.findById(book.id))?.id).toBe(book.id);
    });

    it('treats SQL-looking ids as plain data and deletes nothing else', async () => {
      await repository.save(buildBook());
      await repository.save(buildVinyl());

      await expect(repository.delete("' OR '1'='1")).rejects.toThrow(ItemNotFoundError);

      expect(countRows()).toBe(2);
    });
  });

  describe('data integrity', () => {
    it('reports corrupted rows instead of returning invalid entities', async () => {
      database
        .prepare(
          `INSERT INTO catalog_items (id, kind, title, enrichment_completed, identifier)
           VALUES (?, 'book', 'Broken', 0, 'not-an-isbn')`,
        )
        .run(randomUUID());

      await expect(repository.findAll()).rejects.toThrow(PersistenceError);
      await expect(repository.findAll()).rejects.toThrow(/violates a domain constraint/);
    });

    it('rejects an unknown kind at the database level', () => {
      expect(() =>
        database
          .prepare(
            `INSERT INTO catalog_items (id, kind, title, enrichment_completed, identifier)
             VALUES (?, 'magazine', 'Unknown', 0, 'x')`,
          )
          .run(randomUUID()),
      ).toThrow(/CHECK constraint failed/);
    });

    it('creates the schema idempotently when the repository is opened twice', async () => {
      const book = buildBook();
      await repository.save(book);

      const secondRepository = new SqliteCatalogItemRepository(database);

      await expect(secondRepository.findById(book.id)).resolves.toBeInstanceOf(Book);
    });
  });

  describe('isolation', () => {
    it('does not share data between in-memory databases', async () => {
      await repository.save(buildBook());
      const otherDatabase = new DatabaseSync(':memory:');
      const otherRepository = new SqliteCatalogItemRepository(otherDatabase);

      try {
        await expect(otherRepository.findAll()).resolves.toEqual([]);
        await expect(repository.findAll()).resolves.toHaveLength(1);
      } finally {
        otherDatabase.close();
      }
    });
  });

  describe('local database file', () => {
    let directory: string;

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'catalog-repository-'));
    });

    afterEach(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    it('persists the data in a .db file that survives reopening', async () => {
      const filePath = join(directory, 'catalog.db');
      const book = buildBook();

      const firstSession = SqliteCatalogItemRepository.open(filePath);
      await firstSession.save(book);
      firstSession.close();

      expect(existsSync(filePath)).toBe(true);

      const secondSession = SqliteCatalogItemRepository.open(filePath);
      try {
        const found = await secondSession.findById(book.id);
        expect(found).toBeInstanceOf(Book);
        expect(found?.metadata.equals(book.metadata)).toBe(true);
      } finally {
        secondSession.close();
      }
    });
  });
});
