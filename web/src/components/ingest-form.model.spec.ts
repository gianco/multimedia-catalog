import { describe, expect, it } from '@jest/globals';
import { EMPTY_FORM_VALUES, buildRequest, visibleFields } from './ingest-form.model';
import type { IngestFormValues } from './ingest-form.model';

const values = (overrides: Partial<IngestFormValues>): IngestFormValues => ({
  ...EMPTY_FORM_VALUES,
  ...overrides,
});

describe('ingest form model', () => {
  describe('visibleFields', () => {
    it('shows every field for manual entry', () => {
      expect(visibleFields('manual')).toEqual({
        identifier: true,
        title: true,
        author: true,
        publicationYear: true,
      });
    });

    it('shows only the identifier for AI mode', () => {
      expect(visibleFields('ai')).toEqual({
        identifier: true,
        title: false,
        author: false,
        publicationYear: false,
      });
    });
  });

  describe('buildRequest', () => {
    it('builds a manual request, trimming values and omitting empty optional fields', () => {
      const result = buildRequest(
        values({ kind: 'cd', identifier: ' 4006381333931 ', title: ' Nevermind ', author: ' ' }),
      );

      expect(result).toEqual({
        valid: true,
        request: { mode: 'manual', kind: 'cd', identifier: '4006381333931', title: 'Nevermind' },
      });
    });

    it('includes the author and the year as a number when provided', () => {
      const result = buildRequest(
        values({
          identifier: '9780306406157',
          title: 'Dune',
          author: 'FH',
          publicationYear: '1965',
        }),
      );

      expect(result).toMatchObject({
        valid: true,
        request: { author: 'FH', publicationYear: 1965 },
      });
    });

    it.each([
      ['book', 'enrich'],
      ['vinyl', 'enrich'],
      ['cd', 'enrich'],
      ['video-file', 'scan'],
      ['audio-file', 'scan'],
    ] as const)('maps AI mode for a %s to the "%s" request', (kind, mode) => {
      const result = buildRequest(values({ kind, mode: 'ai', identifier: '/x/y.mkv' }));

      expect(result.valid && result.request.mode).toBe(mode);
    });

    it('uses the identifier as absolutePath for scan requests', () => {
      const result = buildRequest(
        values({ kind: 'audio-file', mode: 'ai', identifier: '/m/a.flac' }),
      );

      expect(result).toEqual({
        valid: true,
        request: { mode: 'scan', kind: 'audio-file', absolutePath: '/m/a.flac' },
      });
    });

    it('does not require the title in AI mode and ignores the manual values', () => {
      const result = buildRequest(values({ mode: 'ai', identifier: '9780306406157', title: '' }));

      expect(result).toEqual({
        valid: true,
        request: { mode: 'enrich', kind: 'book', identifier: '9780306406157' },
      });
    });

    it('reports the missing required fields', () => {
      expect(buildRequest(values({ identifier: ' ', title: '' }))).toEqual({
        valid: false,
        errors: { identifier: 'This field is required.', title: 'The title is required.' },
      });
    });

    it.each(['abc', '0', '12345', '-1', '19.5', '3000'])('rejects the year %p', (year) => {
      const result = buildRequest(values({ identifier: 'x', title: 'y', publicationYear: year }));

      expect(result.valid).toBe(false);
      expect(!result.valid && result.errors.publicationYear).toMatch(/Enter a year/);
    });
  });
});
