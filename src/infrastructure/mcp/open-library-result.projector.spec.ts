import { describe, expect, it } from '@jest/globals';
import { MAX_RECORDS, projectOpenLibraryResult } from './open-library-result.projector.js';

const ESSENTIAL_EDITION_FIELDS = [
  'title',
  'authors',
  'publish_date',
  'isbn_10',
  'isbn_13',
  'number_of_pages',
  'publishers',
];

const HOBBIT_AUTHORS = ['J.R.R. Tolkien', 'Charles Dixon', 'Sean Deming'];

interface ProjectedRecord {
  title?: unknown;
  authors?: string[];
  publish_date?: string;
  isbn_10?: string[];
  isbn_13?: string[];
  number_of_pages?: number;
  publishers?: string[];
  [key: string]: unknown;
}

interface ProjectedSearch {
  num_found?: number;
  results: ProjectedRecord[];
  resultsOmitted?: number;
}

/** Shape of `get_book_by_id` (real answer of mcp-open-library for an ISBN of "The Hobbit"). */
function buildHobbitEdition(): Record<string, unknown> {
  return {
    title: 'The Hobbit',
    authors: ['J.R.R. Tolkien'],
    publishers: ['Mariner Books'],
    publish_date: '2012',
    number_of_pages: 300,
    isbn_13: ['9780547928227'],
    isbn_10: ['054792822X'],
    oclc: Array.from({ length: 300 }, (_, index) => String(770_000_000 + index)),
    olid: Array.from({ length: 300 }, (_, index) => `OL${index}M`),
    open_library_edition_key: '/books/OL33891995M',
    open_library_work_key: '/works/OL27482W',
    cover_url: 'https://covers.openlibrary.org/b/id/12003329-M.jpg',
    info_url: 'http://openlibrary.org/books/OL33891995M/The_Hobbit',
    preview_url: 'https://archive.org/details/hobbitortherebac0000tolk_y8a9',
    notes: 'Lorem ipsum dolor sit amet. '.repeat(500),
  };
}

/** Shape of `search_books` / `get_book_by_title`, with hundreds of hits. */
function buildHobbitSearch(hits = 500): Record<string, unknown> {
  return {
    num_found: hits,
    offset: 0,
    limit: hits,
    results: Array.from({ length: hits }, (_, index) => ({
      title: index === 0 ? 'The Hobbit' : `The Hobbit, volume ${index}`,
      authors: HOBBIT_AUTHORS,
      first_publish_year: 1937,
      open_library_work_key: `/works/OL${index}W`,
      edition_count: 482,
      author_keys: Array.from({ length: 50 }, (_, key) => `OL${key}A`),
      best_edition: {
        edition_key: `OL${index}M`,
        isbn_10: '054792822X',
        isbn_13: '9780547928227',
      },
      cover_url: 'https://covers.openlibrary.org/b/id/14627509-M.jpg',
      ratings_average: 4.29,
      ebook_access: 'borrowable',
    })),
  };
}

function project<T>(payload: unknown): T {
  const projected = projectOpenLibraryResult(JSON.stringify(payload));
  if (projected === undefined) {
    throw new Error('Expected the payload to be recognized.');
  }
  return JSON.parse(projected) as T;
}

describe('projectOpenLibraryResult', () => {
  describe('a flat edition (get_book_by_id)', () => {
    it('should keep the essential fields intact when the edition is projected', () => {
      const edition = project<ProjectedRecord>(buildHobbitEdition());

      expect(edition).toEqual({
        title: 'The Hobbit',
        authors: ['J.R.R. Tolkien'],
        publish_date: '2012',
        publishers: ['Mariner Books'],
        number_of_pages: 300,
        isbn_10: ['054792822X'],
        isbn_13: ['9780547928227'],
        open_library_work_key: '/works/OL27482W',
      });
      for (const field of ESSENTIAL_EDITION_FIELDS) {
        expect(edition).toHaveProperty(field);
      }
    });

    it('should drop the bulky arrays, urls and notes when the edition is projected', () => {
      const text = projectOpenLibraryResult(JSON.stringify(buildHobbitEdition())) ?? '';

      for (const noise of ['oclc', 'olid', 'cover_url', 'info_url', 'preview_url', 'notes']) {
        expect(text).not.toContain(`"${noise}"`);
      }
      expect(text.length).toBeLessThan(500);
    });

    it('should omit the fields the edition does not have instead of inventing them', () => {
      const edition = project<ProjectedRecord>({ title: 'Dune', publish_date: 1965 });

      expect(edition).toEqual({ title: 'Dune', publish_date: '1965' });
    });

    it('should limit long lists and long texts', () => {
      const edition = project<ProjectedRecord>({
        title: 'T'.repeat(1_000),
        authors: Array.from({ length: 40 }, (_, index) => `Author ${index}`),
      });

      expect(edition.authors).toHaveLength(5);
      expect(String(edition.title).length).toBeLessThanOrEqual(201);
    });
  });

  describe('a search with hundreds of hits (search_books, get_book_by_title)', () => {
    it('should keep only the first matching records when the search has hundreds of hits', () => {
      const search = project<ProjectedSearch>(buildHobbitSearch());

      expect(search.results).toHaveLength(MAX_RECORDS);
      expect(search.results[0]?.title).toBe('The Hobbit');
      expect(search.num_found).toBe(500);
      expect(search.resultsOmitted).toBe(500 - MAX_RECORDS);
    });

    it('should keep a non-empty title and the ISBNs of every kept record', () => {
      const search = project<ProjectedSearch>(buildHobbitSearch());

      for (const record of search.results) {
        expect(typeof record.title).toBe('string');
        expect((record.title as string).trim().length).toBeGreaterThan(0);
        expect(record.authors).toEqual(HOBBIT_AUTHORS);
        expect(record.isbn_10).toEqual(['054792822X']);
        expect(record.isbn_13).toEqual(['9780547928227']);
      }
    });

    it('should strip the bulky fields of every kept record', () => {
      const text = projectOpenLibraryResult(JSON.stringify(buildHobbitSearch())) ?? '';

      for (const noise of ['author_keys', 'cover_url', 'ratings_average', 'ebook_access']) {
        expect(text).not.toContain(`"${noise}"`);
      }
      expect(text.length).toBeLessThan(2_000);
    });

    it('should not report omitted results when the search already fits', () => {
      const search = project<ProjectedSearch>(buildHobbitSearch(2));

      expect(search.results).toHaveLength(2);
      expect(search.resultsOmitted).toBeUndefined();
    });

    it('should accept the native Open Library docs key', () => {
      const search = project<ProjectedSearch>({
        numFound: 9,
        docs: [
          { title: 'The Hobbit', author_name: ['J.R.R. Tolkien'], isbn_13: ['9780547928227'] },
        ],
      });

      expect(search.results[0]).toEqual({
        title: 'The Hobbit',
        authors: ['J.R.R. Tolkien'],
        isbn_13: ['9780547928227'],
      });
      expect(search.num_found).toBe(9);
    });

    it('should return the same text when the same payload is projected twice', () => {
      const payload = JSON.stringify(buildHobbitSearch());

      expect(projectOpenLibraryResult(payload)).toBe(projectOpenLibraryResult(payload));
    });
  });

  describe('records without a usable title', () => {
    it.each([
      ['title_suggest', { title_suggest: 'The Hobbit' }],
      ['full_title', { full_title: 'The Hobbit' }],
      ['work_title', { work_title: 'The Hobbit' }],
      ['name', { name: 'The Hobbit' }],
      ['a blank title with a fallback key', { title: '   ', full_title: 'The Hobbit' }],
    ])('should fall back to an alternative title key (%s)', (_label, record) => {
      const edition = project<ProjectedRecord>({ ...record, authors: ['J.R.R. Tolkien'] });

      expect(edition.title).toBe('The Hobbit');
    });

    it('should accept authors given as name objects', () => {
      const edition = project<ProjectedRecord>({
        title: 'The Hobbit',
        authors: [{ name: 'J.R.R. Tolkien' }, { key: '/authors/OL1A' }],
      });

      expect(edition.authors).toEqual(['J.R.R. Tolkien']);
    });

    it('should drop the search hits that cannot be named instead of passing them on empty', () => {
      const search = project<ProjectedSearch>({
        num_found: 3,
        results: [
          { title: '', authors: ['Nobody'] },
          { title: null },
          { title: 'The Hobbit', isbn_13: ['9780547928227'] },
        ],
      });

      expect(search.results).toEqual([{ title: 'The Hobbit', isbn_13: ['9780547928227'] }]);
      expect(search.resultsOmitted).toBe(2);
    });

    it('should return an empty result list when no hit has a title', () => {
      const search = project<ProjectedSearch>({ num_found: 1, results: [{ title: ' ' }] });

      expect(search.results).toEqual([]);
    });

    it('should not recognize an edition that has no title at all', () => {
      expect(
        projectOpenLibraryResult(JSON.stringify({ isbn_13: ['9780547928227'] })),
      ).toBeUndefined();
    });
  });

  describe('answers that are not an Open Library record', () => {
    it.each([
      ['a plain not-found message', 'No book found for isbn: 0547928227'],
      ['an empty text', ''],
      ['malformed JSON', '{"title": "The Hob'],
      ['a top-level array', '[{"title":"The Hobbit"}]'],
      ['a JSON scalar', '"The Hobbit"'],
    ])('should return undefined for %s so the generic truncation applies', (_label, text) => {
      expect(projectOpenLibraryResult(text)).toBeUndefined();
    });
  });
});
