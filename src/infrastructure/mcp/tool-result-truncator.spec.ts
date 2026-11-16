import { describe, expect, it } from '@jest/globals';
import { MAX_ARRAY_ITEMS, MAX_STRING_LENGTH, truncateToolText } from './tool-result-truncator.js';

const LIMIT = 20_000;

interface OpenLibraryEdition {
  key: string;
  title: string;
  isbn_13: string[];
  publishers: string[];
  notes: string;
}

interface OpenLibraryDoc {
  title: string;
  author_name: string[];
  edition_count: number;
  edition_key: string[];
  isbn: string[];
}

interface OpenLibraryResponse {
  num_found: number;
  docs: OpenLibraryDoc[];
  editions: OpenLibraryEdition[];
}

/** Synthetic Open Library answer for "The Hobbit": hundreds of editions with long notes. */
function buildHobbitPayload(editionCount = 500): OpenLibraryResponse {
  const editions = Array.from({ length: editionCount }, (_, index) => ({
    key: `/books/OL${index}M`,
    title: 'The Hobbit',
    isbn_13: [`978030640${String(index).padStart(4, '0')}`],
    publishers: ['Allen & Unwin', 'Houghton Mifflin', 'Ballantine'],
    notes: `Edition ${index}. ${'Lorem ipsum dolor sit amet. '.repeat(40)}`,
  }));
  return {
    num_found: editionCount,
    docs: [
      {
        title: 'The Hobbit',
        author_name: ['J.R.R. Tolkien'],
        edition_count: editionCount,
        edition_key: editions.map((edition) => edition.key),
        isbn: editions.flatMap((edition) => edition.isbn_13),
      },
    ],
    editions,
  };
}

describe('truncateToolText', () => {
  describe('oversized Open Library payload (The Hobbit regression)', () => {
    const raw = JSON.stringify(buildHobbitPayload());

    it('starts from a payload far bigger than the limit', () => {
      expect(raw.length).toBeGreaterThan(LIMIT * 10);
    });

    it('should return valid JSON within the limit when the payload has hundreds of editions', () => {
      const result = truncateToolText(raw, LIMIT);

      expect(result.length).toBeLessThanOrEqual(LIMIT);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should keep only the first editions when an array exceeds the item limit', () => {
      const parsed = JSON.parse(truncateToolText(raw, LIMIT)) as Record<string, unknown>;

      const editions = parsed['editions'] as OpenLibraryEdition[];
      expect(editions).toHaveLength(MAX_ARRAY_ITEMS);
      expect(editions.map((edition) => edition.key)).toEqual([
        '/books/OL0M',
        '/books/OL1M',
        '/books/OL2M',
      ]);
      const doc = (parsed['docs'] as OpenLibraryDoc[])[0];
      expect(doc?.edition_key).toHaveLength(MAX_ARRAY_ITEMS);
      expect(doc?.isbn).toHaveLength(MAX_ARRAY_ITEMS);
    });

    it('should tell the model how many entries were omitted', () => {
      const parsed = JSON.parse(truncateToolText(raw, LIMIT)) as Record<string, unknown>;

      expect(parsed['editionsOmitted']).toBe(500 - MAX_ARRAY_ITEMS);
      expect(parsed['num_found']).toBe(500);
      expect(parsed['docsOmitted']).toBeUndefined();
    });

    it('should cut long strings and keep the short ones untouched', () => {
      const parsed = JSON.parse(truncateToolText(raw, LIMIT)) as Record<string, unknown>;

      const first = (parsed['editions'] as OpenLibraryEdition[])[0];
      expect(first?.notes.length).toBeLessThanOrEqual(MAX_STRING_LENGTH + 1);
      expect(first?.notes.endsWith('…')).toBe(true);
      expect(first?.title).toBe('The Hobbit');
      expect(first?.isbn_13).toEqual(['9780306400000']);
    });

    it('should produce the same output when called twice with the same input', () => {
      expect(truncateToolText(raw, LIMIT)).toBe(truncateToolText(raw, LIMIT));
      expect(truncateToolText(raw, LIMIT)).toBe(
        truncateToolText(JSON.stringify(buildHobbitPayload()), LIMIT),
      );
    });

    it('should keep the same first editions however many editions follow them', () => {
      const small = JSON.parse(truncateToolText(JSON.stringify(buildHobbitPayload(10)), LIMIT)) as {
        editions: OpenLibraryEdition[];
      };
      const huge = JSON.parse(truncateToolText(raw, LIMIT)) as { editions: OpenLibraryEdition[] };

      expect(huge.editions).toEqual(small.editions);
    });
  });

  describe('JSON shapes', () => {
    it('should leave a small JSON payload byte-for-byte untouched', () => {
      const text = JSON.stringify({ title: 'Dune', editions: [{ key: 'a' }, { key: 'b' }] });

      expect(truncateToolText(text, LIMIT)).toBe(text);
    });

    it('should leave a payload with exactly the maximum number of items untouched', () => {
      const text = JSON.stringify({ editions: [1, 2, 3] });

      expect(truncateToolText(text, LIMIT)).toBe(text);
    });

    it('should wrap a top-level array that is too long together with the omitted counter', () => {
      const text = JSON.stringify(Array.from({ length: 50 }, (_, index) => ({ index })));

      const parsed: unknown = JSON.parse(truncateToolText(text, LIMIT));

      expect(parsed).toEqual({
        items: [{ index: 0 }, { index: 1 }, { index: 2 }],
        itemsOmitted: 47,
      });
    });

    it('should keep a short top-level array as it is', () => {
      const text = JSON.stringify([{ index: 0 }, { index: 1 }]);

      expect(truncateToolText(text, LIMIT)).toBe(text);
    });

    it('should reduce arrays nested deeply inside objects', () => {
      const list = Array.from({ length: 9 }, (_, index) => index);
      const text = JSON.stringify({ a: { b: { c: { list } } } });

      const parsed: unknown = JSON.parse(truncateToolText(text, LIMIT));

      expect(parsed).toEqual({ a: { b: { c: { list: [0, 1, 2], listOmitted: 6 } } } });
    });

    it('should replace nesting deeper than the maximum depth with a placeholder', () => {
      let nested: unknown = 'leaf';
      for (let level = 0; level < 20; level += 1) {
        nested = { next: nested };
      }

      const result = truncateToolText(JSON.stringify(nested), LIMIT);

      expect(() => JSON.parse(result)).not.toThrow();
      expect(result).toContain('[truncated]');
      expect(result).not.toContain('leaf');
    });

    it('should cut a single huge string inside a JSON object', () => {
      const text = JSON.stringify({ description: 'x'.repeat(100_000) });

      const parsed: unknown = JSON.parse(truncateToolText(text, LIMIT));

      expect(parsed).toEqual({ description: `${'x'.repeat(MAX_STRING_LENGTH)}…` });
    });

    it('should keep a hostile __proto__ key inert when the payload is reduced', () => {
      const text = '{"__proto__":{"polluted":true},"list":[1,2,3,4,5]}';

      const parsed = JSON.parse(truncateToolText(text, LIMIT)) as { list: number[] };

      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(parsed.list).toEqual([1, 2, 3]);
    });

    it.each(['"just a string"', '42', 'true', 'null'])(
      'should treat the JSON scalar %s like plain text',
      (text) => {
        expect(truncateToolText(text, LIMIT)).toBe(text);
      },
    );
  });

  describe('fallbacks', () => {
    it('should use the stricter profile when the first one is still too big', () => {
      const docs = Array.from({ length: 3 }, (_, index) => ({
        index,
        text: 'y'.repeat(MAX_STRING_LENGTH),
      }));

      const result = truncateToolText(JSON.stringify({ docs }), 1_000);

      expect(result.length).toBeLessThanOrEqual(1_000);
      const parsed = JSON.parse(result) as { docs: unknown[]; docsOmitted: number };
      expect(parsed.docs).toHaveLength(1);
      expect(parsed.docsOmitted).toBe(2);
    });

    it('should return a valid JSON envelope with a preview as the last resort', () => {
      const keys = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`key${i}`, i]));
      const text = JSON.stringify(keys);

      const result = truncateToolText(text, 500);

      expect(result.length).toBeLessThanOrEqual(500);
      const parsed = JSON.parse(result) as { truncated: boolean; preview: string };
      expect(parsed.truncated).toBe(true);
      expect(text.startsWith(parsed.preview)).toBe(true);
    });

    it('should keep the last-resort envelope valid even when escaping expands the preview', () => {
      const entries = Array.from({ length: 300 }, (_, i): [string, string] => [`"k\\${i}"`, '"\\']);

      const result = truncateToolText(JSON.stringify(Object.fromEntries(entries)), 400);

      expect(result.length).toBeLessThanOrEqual(400);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('plain text', () => {
    it('should leave short text untouched', () => {
      expect(truncateToolText('Dune, Frank Herbert, 1965', LIMIT)).toBe(
        'Dune, Frank Herbert, 1965',
      );
    });

    it('should cut long text and append the truncation marker', () => {
      const result = truncateToolText('z'.repeat(LIMIT + 500), LIMIT);

      expect(result).toBe(`${'z'.repeat(LIMIT)}\n[truncated]`);
    });

    it('should treat malformed JSON as plain text', () => {
      const text = `{"docs":[${'1,'.repeat(LIMIT)}`;

      const result = truncateToolText(text, LIMIT);

      expect(result.endsWith('\n[truncated]')).toBe(true);
      expect(result.startsWith('{"docs":[1,1,')).toBe(true);
    });

    it('should return an empty string unchanged', () => {
      expect(truncateToolText('', LIMIT)).toBe('');
    });
  });
});
