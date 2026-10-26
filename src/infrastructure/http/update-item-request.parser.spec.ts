import { describe, expect, it } from '@jest/globals';
import { RequestValidationError } from './http-error.js';
import { parseUpdateItemRequest } from './update-item-request.parser.js';

describe('parseUpdateItemRequest', () => {
  it('accepts all the updatable fields', () => {
    expect(
      parseUpdateItemRequest({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 }),
    ).toEqual({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 });
  });

  it.each([[{ title: 'Dune' }], [{ author: 'Frank Herbert' }], [{ publicationYear: 1965 }]])(
    'accepts a partial body %j',
    (body) => {
      expect(parseUpdateItemRequest(body)).toEqual(body);
    },
  );

  it('keeps null, which clears the author or the year', () => {
    expect(parseUpdateItemRequest({ author: null, publicationYear: null })).toEqual({
      author: null,
      publicationYear: null,
    });
  });

  it('does not invent properties that were not sent', () => {
    const payload = parseUpdateItemRequest({ title: 'Dune' });

    expect(Object.keys(payload)).toEqual(['title']);
  });

  it('passes domain-invalid values through, because the domain owns those rules', () => {
    expect(parseUpdateItemRequest({ title: '   ', publicationYear: 0 })).toEqual({
      title: '   ',
      publicationYear: 0,
    });
  });

  describe('rejects', () => {
    it.each([
      ['null', null],
      ['an array', [{ title: 'x' }]],
      ['a string', 'title'],
      ['a number', 42],
      ['undefined', undefined],
    ])('%s as body', (_label, body) => {
      expect(() => parseUpdateItemRequest(body)).toThrow(RequestValidationError);
      expect(() => parseUpdateItemRequest(body)).toThrow(/JSON object/);
    });

    it('an empty object', () => {
      expect(() => parseUpdateItemRequest({})).toThrow(/at least one of: title, author/);
    });

    it.each(['id', 'kind', 'identifier', 'aiClassification', 'enrichmentCompleted', 'unknown'])(
      'the field %s, which cannot be updated',
      (field) => {
        const attempt = (): unknown => parseUpdateItemRequest({ title: 'Dune', [field]: 'x' });

        expect(attempt).toThrow(RequestValidationError);
        expect(attempt).toThrow(`"${field}" cannot be updated`);
      },
    );

    it('lists every unsupported field at once', () => {
      expect(() => parseUpdateItemRequest({ id: 'x', kind: 'cd' })).toThrow('"id", "kind"');
    });

    it.each([
      ['a numeric title', { title: 42 }, /"title" must be a string/],
      ['a null title', { title: null }, /"title" must be a string/],
      ['a numeric author', { author: 7 }, /"author" must be a string or null/],
      ['a text year', { publicationYear: '1965' }, /"publicationYear" must be an integer or null/],
      [
        'a decimal year',
        { publicationYear: 1965.5 },
        /"publicationYear" must be an integer or null/,
      ],
      ['an infinite year', { publicationYear: Infinity }, /"publicationYear"/],
    ])('%s', (_label, body, message) => {
      expect(() => parseUpdateItemRequest(body)).toThrow(RequestValidationError);
      expect(() => parseUpdateItemRequest(body)).toThrow(message);
    });
  });
});
