import { DomainError } from './domain.error.js';

export type BarcodeFormat = 'EAN-8' | 'UPC-A' | 'EAN-13';

const FORMAT_BY_LENGTH: Readonly<Record<number, BarcodeFormat>> = {
  8: 'EAN-8',
  12: 'UPC-A',
  13: 'EAN-13',
};

const GTIN_13_LENGTH = 13;

/** Computes the GS1 check digit from the code body (without the check digit). */
function computeGs1CheckDigit(body: string): number {
  let sum = 0;
  for (let offset = 0; offset < body.length; offset += 1) {
    const digit = Number(body.charAt(body.length - 1 - offset));
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Barcode of a physical medium (Vinyl or CD).
 * Supports EAN-8, UPC-A (12 digits) and EAN-13, with GS1 check digit validation.
 */
export class BarcodeVo {
  readonly value: string;

  constructor(raw: string) {
    if (typeof raw !== 'string') {
      throw new DomainError('Barcode: the value must be a string.');
    }

    const cleaned = raw.replace(/[\s-]/g, '');

    if (cleaned.length === 0) {
      throw new DomainError('Barcode: the value must not be empty.');
    }
    if (!/^\d+$/.test(cleaned)) {
      throw new DomainError(`Barcode "${raw}" is invalid: only digits are allowed.`);
    }
    if (FORMAT_BY_LENGTH[cleaned.length] === undefined) {
      throw new DomainError(
        `Barcode "${raw}" is invalid: it must have 8 (EAN-8), 12 (UPC-A) or 13 (EAN-13) digits (found ${cleaned.length}).`,
      );
    }

    const body = cleaned.slice(0, -1);
    if (computeGs1CheckDigit(body) !== Number(cleaned.charAt(cleaned.length - 1))) {
      throw new DomainError(`Barcode "${raw}" is invalid: wrong check digit.`);
    }

    this.value = cleaned;
    Object.freeze(this);
  }

  get format(): BarcodeFormat {
    return FORMAT_BY_LENGTH[this.value.length] as BarcodeFormat;
  }

  /** Normalized GTIN-13 representation (left zero-padding). */
  toGtin13(): string {
    return this.value.padStart(GTIN_13_LENGTH, '0');
  }

  /** Two barcodes are equal if they share the same GTIN-13, even with different formats. */
  equals(other: BarcodeVo): boolean {
    return this.toGtin13() === other.toGtin13();
  }

  toString(): string {
    return this.value;
  }
}
