import { BarcodeVo } from './barcode.vo.js';
import { CatalogItem } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';
import { Vinyl } from './vinyl.entity.js';

describe('Vinyl', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Abbey Road' });
  const buildBarcode = (): BarcodeVo => new BarcodeVo('036000291452');

  it('extends CatalogItem and encapsulates metadata and barcode', () => {
    const metadata = buildMetadata();
    const barcode = buildBarcode();

    const vinyl = new Vinyl(metadata, barcode);

    expect(vinyl).toBeInstanceOf(CatalogItem);
    expect(vinyl.kind).toBe('vinyl');
    expect(vinyl.metadata).toBe(metadata);
    expect(vinyl.barcode).toBe(barcode);
    expect(vinyl.id).toEqual(expect.any(String));
  });

  it('generates different ids for different instances', () => {
    expect(new Vinyl(buildMetadata(), buildBarcode()).id).not.toBe(
      new Vinyl(buildMetadata(), buildBarcode()).id,
    );
  });

  it('rejects a barcode that is not a BarcodeVo', () => {
    expect(() => new Vinyl(buildMetadata(), '036000291452' as unknown as BarcodeVo)).toThrow(
      DomainError,
    );
    expect(() => new Vinyl(buildMetadata(), null as unknown as BarcodeVo)).toThrow(/BarcodeVo/);
  });

  it('rejects invalid metadata', () => {
    expect(() => new Vinyl(null as unknown as MetadataVo, buildBarcode())).toThrow(DomainError);
  });

  it('uses the GTIN-13 as identifier in the enrichment request', () => {
    const vinyl = new Vinyl(buildMetadata(), buildBarcode());

    expect(vinyl.buildEnrichmentRequest()).toMatchObject({
      itemId: vinyl.id,
      kind: 'vinyl',
      title: 'Abbey Road',
      identifier: { type: 'barcode', value: '0036000291452' },
    });
  });

  it('gets enriched through the data returned by Claude', () => {
    const vinyl = new Vinyl(buildMetadata(), buildBarcode());

    vinyl.applyEnrichment({
      aiClassification: 'Rock',
      author: 'The Beatles',
      publicationYear: 1969,
    });

    expect(vinyl.isEnriched).toBe(true);
    expect(vinyl.metadata.author).toBe('The Beatles');
    expect(() => vinyl.applyEnrichment({ aiClassification: 'Pop' })).toThrow(DomainError);
  });
});
