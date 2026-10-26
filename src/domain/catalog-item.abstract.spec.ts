import { CatalogItem } from './catalog-item.abstract.js';
import type { CatalogItemKind, ItemIdentifier } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';

class TestItem extends CatalogItem {
  readonly kind: CatalogItemKind = 'book';

  constructor(metadata: MetadataVo, id?: string) {
    super(metadata, id);
  }

  protected get identifier(): ItemIdentifier {
    return { type: 'isbn', value: '9780306406157' };
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('CatalogItem', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Dune' });

  describe('identity', () => {
    it('generates a unique UUID v4 for each instance', () => {
      const first = new TestItem(buildMetadata());
      const second = new TestItem(buildMetadata());

      expect(first.id).toMatch(UUID_V4);
      expect(second.id).toMatch(UUID_V4);
      expect(first.id).not.toBe(second.id);
    });

    it('accepts an existing UUID to rebuild a persisted item', () => {
      const id = '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c';

      expect(new TestItem(buildMetadata(), id).id).toBe(id);
    });

    it('rejects an id that is not a UUID', () => {
      expect(() => new TestItem(buildMetadata(), 'non-un-uuid')).toThrow(DomainError);
      expect(() => new TestItem(buildMetadata(), '')).toThrow(/UUID/);
    });

    it('compares entities by identity and not by attributes', () => {
      const id = '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c';

      expect(
        new TestItem(buildMetadata(), id).equals(new TestItem(new MetadataVo({ title: 'X' }), id)),
      ).toBe(true);
      expect(new TestItem(buildMetadata()).equals(new TestItem(buildMetadata()))).toBe(false);
    });
  });

  describe('metadata', () => {
    it('encapsulates the metadata and exposes its title', () => {
      const metadata = buildMetadata();
      const item = new TestItem(metadata);

      expect(item.metadata).toBe(metadata);
      expect(item.title).toBe('Dune');
    });

    it('rejects metadata that is not a MetadataVo', () => {
      expect(() => new TestItem({ title: 'Dune' } as unknown as MetadataVo)).toThrow(DomainError);
    });
  });

  describe('data enrichment', () => {
    it('initially needs enrichment', () => {
      const item = new TestItem(buildMetadata());

      expect(item.needsEnrichment).toBe(true);
      expect(item.isEnriched).toBe(false);
    });

    it('builds a consistent enrichment request', () => {
      const item = new TestItem(new MetadataVo({ title: 'Dune', author: 'Frank Herbert' }));

      expect(item.buildEnrichmentRequest()).toEqual({
        itemId: item.id,
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publicationYear: null,
        identifier: { type: 'isbn', value: '9780306406157' },
        missingFields: ['publicationYear'],
      });
    });

    it('applies the enrichment by replacing the metadata', () => {
      const item = new TestItem(buildMetadata());
      const before = item.metadata;

      item.applyEnrichment({
        aiClassification: 'Fantascienza',
        author: 'Frank Herbert',
        publicationYear: 1965,
      });

      expect(item.isEnriched).toBe(true);
      expect(item.needsEnrichment).toBe(false);
      expect(item.metadata).not.toBe(before);
      expect(item.metadata.author).toBe('Frank Herbert');
      expect(item.metadata.aiClassification).toBe('Fantascienza');
      expect(before.enrichmentCompleted).toBe(false);
    });

    it('corrects the descriptive metadata and keeps the enrichment', () => {
      const item = new TestItem(buildMetadata());
      item.applyEnrichment({ aiClassification: 'SF', author: 'F. Herbert' });

      item.correctMetadata({ title: 'Dune II', author: 'Frank Herbert' });

      expect(item.title).toBe('Dune II');
      expect(item.metadata.author).toBe('Frank Herbert');
      expect(item.metadata.aiClassification).toBe('SF');
      expect(item.isEnriched).toBe(true);
    });

    it('keeps the identity when the metadata is corrected', () => {
      const item = new TestItem(buildMetadata());
      const { id } = item;

      item.correctMetadata({ title: 'Other' });

      expect(item.id).toBe(id);
    });

    it('leaves the item untouched when a correction is invalid', () => {
      const item = new TestItem(buildMetadata());
      const before = item.metadata;

      expect(() => item.correctMetadata({ title: ' ' })).toThrow(DomainError);

      expect(item.metadata).toBe(before);
    });

    it('does not allow re-enriching an already enriched item', () => {
      const item = new TestItem(buildMetadata());
      item.applyEnrichment({ aiClassification: 'SF' });

      expect(() => item.applyEnrichment({ aiClassification: 'Altro' })).toThrow(DomainError);
      expect(() => item.buildEnrichmentRequest()).toThrow(/already been completed/);
    });
  });
});
