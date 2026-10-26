import { describe, expect, it } from '@jest/globals';
import { buildItem } from '../testing/fake-catalog-api';
import { buildUpdateRequest, toEditFormValues } from './edit-form.model';
import type { EditFormValues } from './edit-form.model';

const item = buildItem({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 });
const values = (overrides: Partial<EditFormValues> = {}): EditFormValues => ({
  ...toEditFormValues(item),
  ...overrides,
});

describe('edit form model', () => {
  describe('toEditFormValues', () => {
    it('starts from the current values of the item', () => {
      expect(toEditFormValues(item)).toEqual({
        title: 'Dune',
        author: 'Frank Herbert',
        publicationYear: '1965',
      });
    });

    it('shows empty inputs for the author and the year that are unknown', () => {
      expect(toEditFormValues(buildItem({ author: null, publicationYear: null }))).toEqual({
        title: 'Dune',
        author: '',
        publicationYear: '',
      });
    });
  });

  describe('buildUpdateRequest', () => {
    it('sends only the fields that changed', () => {
      expect(buildUpdateRequest(item, values({ title: 'Dune Messiah' }))).toEqual({
        valid: true,
        request: { title: 'Dune Messiah' },
      });
      expect(buildUpdateRequest(item, values({ publicationYear: '1969' }))).toEqual({
        valid: true,
        request: { publicationYear: 1969 },
      });
    });

    it('sends every field when all of them changed, with the year as a number', () => {
      expect(
        buildUpdateRequest(item, { title: 'Emma', author: 'Jane Austen', publicationYear: '1815' }),
      ).toEqual({
        valid: true,
        request: { title: 'Emma', author: 'Jane Austen', publicationYear: 1815 },
      });
    });

    it('trims the values before comparing and sending them', () => {
      expect(buildUpdateRequest(item, values({ title: '  Dune  ' }))).toEqual({
        valid: true,
        request: null,
      });
      expect(buildUpdateRequest(item, values({ title: '  Emma ' }))).toMatchObject({
        request: { title: 'Emma' },
      });
    });

    it('returns no request when nothing changed', () => {
      expect(buildUpdateRequest(item, values())).toEqual({ valid: true, request: null });
    });

    it('clears the author and the year with null when the inputs are emptied', () => {
      expect(buildUpdateRequest(item, values({ author: '  ', publicationYear: '' }))).toEqual({
        valid: true,
        request: { author: null, publicationYear: null },
      });
    });

    it('does not send null for an author or a year that were already unknown', () => {
      const unknown = buildItem({ author: null, publicationYear: null });

      expect(
        buildUpdateRequest(unknown, { title: 'Dune', author: '', publicationYear: '' }),
      ).toEqual({ valid: true, request: null });
    });

    it('fills in an author or a year that were unknown', () => {
      const unknown = buildItem({ author: null, publicationYear: null });

      expect(
        buildUpdateRequest(unknown, { title: 'Dune', author: 'FH', publicationYear: '1965' }),
      ).toEqual({ valid: true, request: { author: 'FH', publicationYear: 1965 } });
    });

    it('requires a title', () => {
      expect(buildUpdateRequest(item, values({ title: '   ' }))).toEqual({
        valid: false,
        errors: { title: 'The title is required.' },
      });
    });

    it.each(['abc', '0', '12345', '-1', '19.5', '3000', '19x5'])('rejects the year %p', (year) => {
      const result = buildUpdateRequest(item, values({ publicationYear: year }));

      expect(result.valid).toBe(false);
      expect(!result.valid && result.errors.publicationYear).toMatch(/Enter a year between 1 and/);
    });

    it('reports every error at once', () => {
      const result = buildUpdateRequest(item, values({ title: '', publicationYear: 'x' }));

      expect(!result.valid && Object.keys(result.errors).sort()).toEqual([
        'publicationYear',
        'title',
      ]);
    });
  });
});
