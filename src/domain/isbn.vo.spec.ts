import { DomainError } from './domain.error.js';
import { IsbnVo } from './isbn.vo.js';

describe('IsbnVo', () => {
  describe('creation', () => {
    it('accepts a valid ISBN-13', () => {
      const isbn = new IsbnVo('9780306406157');

      expect(isbn.value).toBe('9780306406157');
      expect(isbn.format).toBe('ISBN-13');
    });

    it('accepts a valid ISBN-10', () => {
      const isbn = new IsbnVo('0306406152');

      expect(isbn.value).toBe('0306406152');
      expect(isbn.format).toBe('ISBN-10');
    });

    it('accepts an ISBN-10 with check digit X (case-insensitive)', () => {
      expect(new IsbnVo('080442957x').value).toBe('080442957X');
    });

    it('strips hyphens and spaces', () => {
      expect(new IsbnVo('978-0-306-40615-7').value).toBe('9780306406157');
      expect(new IsbnVo(' 0 306 40615 2 ').value).toBe('0306406152');
    });

    it.each([
      ['ISBN 978-0-306-40615-7', '9780306406157'],
      ['ISBN: 978 0 306 40615 7', '9780306406157'],
      ['ISBN-13: 978-0-306-40615-7', '9780306406157'],
      ['isbn-10: 0-306-40615-2', '0306406152'],
      ['ISBN 0-8044-2957-X', '080442957X'],
    ])('strips the ISBN label from %j', (raw, expected) => {
      expect(new IsbnVo(raw).value).toBe(expected);
    });

    it('does not mistake the first digits of an unlabeled-colon ISBN-10 for a label', () => {
      expect(new IsbnVo('ISBN 0306406152').value).toBe('0306406152');
    });

    it.each([
      ['en dash', '978\u20130\u2013306\u201340615\u20137'],
      ['em dash', '978\u20140\u2014306\u201440615\u20147'],
      ['minus sign', '978\u22120\u2212306\u221240615\u22127'],
      ['non-breaking space', '978\u00A00\u00A0306\u00A040615\u00A07'],
      ['soft hyphen', '978\u00AD0\u00AD306\u00AD40615\u00AD7'],
      ['zero-width characters', '978\u200B0306\u200C40615\u200D7'],
      ['tabs and new lines', '\t978\n0306\r\n406157 '],
    ])('strips formatting characters (%s)', (_label, raw) => {
      expect(new IsbnVo(raw).value).toBe('9780306406157');
    });

    it.each(['978-0-306-40615-7', 'ISBN 0-306-40615-2', ' 0 306 40615 2 '])(
      'always exposes a clean 10 or 13 character primitive for %j',
      (raw) => {
        expect(new IsbnVo(raw).value).toMatch(/^(?:\d{13}|\d{9}[\dX])$/);
      },
    );

    it('is immutable', () => {
      const isbn = new IsbnVo('9780306406157');

      expect(Object.isFrozen(isbn)).toBe(true);
      expect(() => {
        (isbn as { value: string }).value = '0';
      }).toThrow(TypeError);
    });
  });

  describe('validation', () => {
    it('rejects non-string values', () => {
      expect(() => new IsbnVo(123 as unknown as string)).toThrow(DomainError);
    });

    it.each(['', '   ', '- -'])('rejects the empty value %j', (value) => {
      expect(() => new IsbnVo(value)).toThrow(/empty/);
    });

    it.each(['12345', '97803064061577', '123456789012'])('rejects the wrong length %j', (value) => {
      expect(() => new IsbnVo(value)).toThrow(DomainError);
      expect(() => new IsbnVo(value)).toThrow(/10 or 13/);
    });

    it('rejects a label without any code', () => {
      expect(() => new IsbnVo('ISBN:')).toThrow(/empty/);
      expect(() => new IsbnVo('ISBN-13: ')).toThrow(/empty/);
    });

    it('rejects letters and symbols that are not formatting characters', () => {
      expect(() => new IsbnVo('978-0-306-4O615-7')).toThrow(DomainError);
      expect(() => new IsbnVo('9780306406157; DROP')).toThrow(DomainError);
      expect(() => new IsbnVo('978/0306406157')).toThrow(DomainError);
    });

    it('rejects an ISBN-10 with non-numeric characters', () => {
      expect(() => new IsbnVo('03064A6152')).toThrow(DomainError);
      expect(() => new IsbnVo('0306X06152')).toThrow(DomainError);
    });

    it('rejects an ISBN-13 with non-numeric characters', () => {
      expect(() => new IsbnVo('97803064061X7')).toThrow(DomainError);
    });

    it('rejects an ISBN-10 with a wrong checksum', () => {
      expect(() => new IsbnVo('0306406153')).toThrow(/checksum/);
    });

    it('rejects an ISBN-13 with a wrong checksum', () => {
      expect(() => new IsbnVo('9780306406158')).toThrow(/checksum/);
    });

    it('rejects an ISBN-13 with a prefix other than 978/979', () => {
      expect(() => new IsbnVo('1234567890128')).toThrow(/prefix/);
    });
  });

  describe('domain behavior', () => {
    it('converts an ISBN-10 into an ISBN-13', () => {
      expect(new IsbnVo('0306406152').toIsbn13()).toBe('9780306406157');
    });

    it('returns an ISBN-13 unchanged', () => {
      expect(new IsbnVo('9780306406157').toIsbn13()).toBe('9780306406157');
    });

    it('treats an ISBN-10 and an ISBN-13 of the same edition as equal', () => {
      expect(new IsbnVo('0306406152').equals(new IsbnVo('978-0-306-40615-7'))).toBe(true);
    });

    it('treats ISBNs of different editions as different', () => {
      expect(new IsbnVo('9780306406157').equals(new IsbnVo('9780131103627'))).toBe(false);
    });

    it('serializes as a string', () => {
      expect(String(new IsbnVo('978-0-306-40615-7'))).toBe('9780306406157');
    });
  });
});
