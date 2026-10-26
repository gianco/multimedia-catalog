import { DomainError } from './domain.error.js';

export type IsbnFormat = 'ISBN-10' | 'ISBN-13';

function hasValidIsbn10Checksum(code: string): boolean {
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const char = code.charAt(index);
    const digit = char === 'X' ? 10 : Number(char);
    sum += digit * (10 - index);
  }
  return sum % 11 === 0;
}

function computeIsbn13CheckDigit(first12Digits: string): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(first12Digits.charAt(index)) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * ISBN code (10 or 13 digits) of a book.
 * The value is stripped of hyphens and spaces and its checksum is validated as well.
 */
export class IsbnVo {
  readonly value: string;

  constructor(raw: string) {
    if (typeof raw !== 'string') {
      throw new DomainError('ISBN: the value must be a string.');
    }

    const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();

    if (cleaned.length === 0) {
      throw new DomainError('ISBN: the value must not be empty.');
    }

    if (![10, 13].includes(cleaned.length)) {
      throw new DomainError(
        `ISBN "${raw}" is invalid: it must contain 10 or 13 digits (found ${cleaned.length} characters).`,
      );
    }

    if (cleaned.length === 10) {
      if (!/^\d{9}[\dX]$/.test(cleaned)) {
        throw new DomainError(
          `ISBN-10 "${raw}" is invalid: only digits are allowed (X only as the last character).`,
        );
      }
      if (!hasValidIsbn10Checksum(cleaned)) {
        throw new DomainError(`ISBN-10 "${raw}" is invalid: wrong checksum.`);
      }
    }

    if (cleaned.length === 13) {
      if (!/^\d{13}$/.test(cleaned)) {
        throw new DomainError(`ISBN-13 "${raw}" is invalid: only digits are allowed.`);
      }
      if (!cleaned.startsWith('978') && !cleaned.startsWith('979')) {
        throw new DomainError(`ISBN-13 "${raw}" is invalid: the prefix must be 978 or 979.`);
      }
      if (computeIsbn13CheckDigit(cleaned) !== Number(cleaned.charAt(12))) {
        throw new DomainError(`ISBN-13 "${raw}" is invalid: wrong checksum.`);
      }
    }

    this.value = cleaned;
    Object.freeze(this);
  }

  get format(): IsbnFormat {
    return this.value.length === 10 ? 'ISBN-10' : 'ISBN-13';
  }

  /** Returns the ISBN-13 representation (converted from ISBN-10 when necessary). */
  toIsbn13(): string {
    if (this.value.length === 13) {
      return this.value;
    }
    const first12 = `978${this.value.slice(0, 9)}`;
    return `${first12}${computeIsbn13CheckDigit(first12)}`;
  }

  /** Two ISBNs are equal if they identify the same edition, regardless of format. */
  equals(other: IsbnVo): boolean {
    return this.toIsbn13() === other.toIsbn13();
  }

  toString(): string {
    return this.value;
  }
}
