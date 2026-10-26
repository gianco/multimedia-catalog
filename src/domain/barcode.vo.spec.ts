import { BarcodeVo } from './barcode.vo.js';
import { DomainError } from './domain.error.js';

describe('BarcodeVo', () => {
  describe('creation', () => {
    it('accepts a valid EAN-13', () => {
      const barcode = new BarcodeVo('4006381333931');

      expect(barcode.value).toBe('4006381333931');
      expect(barcode.format).toBe('EAN-13');
    });

    it('accepts a valid UPC-A', () => {
      const barcode = new BarcodeVo('036000291452');

      expect(barcode.value).toBe('036000291452');
      expect(barcode.format).toBe('UPC-A');
    });

    it('accepts a valid EAN-8', () => {
      const barcode = new BarcodeVo('96385074');

      expect(barcode.format).toBe('EAN-8');
    });

    it('strips spaces and hyphens', () => {
      expect(new BarcodeVo('4006 3813-33931').value).toBe('4006381333931');
    });

    it('is immutable', () => {
      const barcode = new BarcodeVo('4006381333931');

      expect(Object.isFrozen(barcode)).toBe(true);
      expect(() => {
        (barcode as { value: string }).value = '0';
      }).toThrow(TypeError);
    });
  });

  describe('validation', () => {
    it('rejects non-string values', () => {
      expect(() => new BarcodeVo(4006381333931 as unknown as string)).toThrow(DomainError);
    });

    it.each(['', '  ', '--'])('rejects the empty value %j', (value) => {
      expect(() => new BarcodeVo(value)).toThrow(/empty/);
    });

    it('rejects non-numeric characters', () => {
      expect(() => new BarcodeVo('40063813339A1')).toThrow(/only digits/);
    });

    it.each(['123', '12345678901', '12345678901234'])('rejects the wrong length %j', (value) => {
      expect(() => new BarcodeVo(value)).toThrow(DomainError);
      expect(() => new BarcodeVo(value)).toThrow(/8 \(EAN-8\), 12 \(UPC-A\) or 13 \(EAN-13\)/);
    });

    it('rejects a wrong check digit', () => {
      expect(() => new BarcodeVo('4006381333932')).toThrow(/wrong check digit/);
      expect(() => new BarcodeVo('96385075')).toThrow(/wrong check digit/);
    });
  });

  describe('domain behavior', () => {
    it('normalizes to GTIN-13', () => {
      expect(new BarcodeVo('036000291452').toGtin13()).toBe('0036000291452');
      expect(new BarcodeVo('4006381333931').toGtin13()).toBe('4006381333931');
    });

    it('treats a UPC-A and an EAN-13 with a leading zero as equal', () => {
      expect(new BarcodeVo('036000291452').equals(new BarcodeVo('0036000291452'))).toBe(true);
    });

    it('treats different barcodes as different', () => {
      expect(new BarcodeVo('4006381333931').equals(new BarcodeVo('036000291452'))).toBe(false);
    });

    it('serializes as a string', () => {
      expect(String(new BarcodeVo('4006 3813 33931'))).toBe('4006381333931');
    });
  });
});
