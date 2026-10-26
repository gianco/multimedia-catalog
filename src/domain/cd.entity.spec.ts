import { BarcodeVo } from './barcode.vo.js';
import { CatalogItem } from './catalog-item.abstract.js';
import { CD } from './cd.entity.js';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';

describe('CD', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Nevermind' });
  const buildBarcode = (): BarcodeVo => new BarcodeVo('4006381333931');

  it('extends CatalogItem and encapsulates metadata and barcode', () => {
    const metadata = buildMetadata();
    const barcode = buildBarcode();

    const cd = new CD(metadata, barcode);

    expect(cd).toBeInstanceOf(CatalogItem);
    expect(cd.kind).toBe('cd');
    expect(cd.metadata).toBe(metadata);
    expect(cd.barcode).toBe(barcode);
    expect(cd.id).toEqual(expect.any(String));
  });

  it('accepts an existing id and rejects an invalid one', () => {
    const id = '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c';

    expect(new CD(buildMetadata(), buildBarcode(), id).id).toBe(id);
    expect(() => new CD(buildMetadata(), buildBarcode(), 'xyz')).toThrow(DomainError);
  });

  it('rejects a barcode that is not a BarcodeVo', () => {
    expect(() => new CD(buildMetadata(), '4006381333931' as unknown as BarcodeVo)).toThrow(
      DomainError,
    );
    expect(() => new CD(buildMetadata(), undefined as unknown as BarcodeVo)).toThrow(/BarcodeVo/);
  });

  it('rejects invalid metadata', () => {
    expect(() => new CD(undefined as unknown as MetadataVo, buildBarcode())).toThrow(DomainError);
  });

  it('uses the GTIN-13 as identifier in the enrichment request', () => {
    const cd = new CD(buildMetadata(), buildBarcode());

    expect(cd.buildEnrichmentRequest()).toMatchObject({
      itemId: cd.id,
      kind: 'cd',
      title: 'Nevermind',
      identifier: { type: 'barcode', value: '4006381333931' },
    });
  });

  it('gets enriched through the data returned by Claude', () => {
    const cd = new CD(buildMetadata(), buildBarcode());

    cd.applyEnrichment({ aiClassification: 'Grunge', author: 'Nirvana', publicationYear: 1991 });

    expect(cd.isEnriched).toBe(true);
    expect(cd.metadata.publicationYear).toBe(1991);
    expect(() => cd.buildEnrichmentRequest()).toThrow(DomainError);
  });
});
