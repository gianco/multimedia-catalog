import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';

describe('MetadataVo', () => {
  describe('creation', () => {
    it('creates complete metadata', () => {
      const metadata = new MetadataVo({
        title: '  Dune  ',
        author: 'Frank Herbert',
        publicationYear: 1965,
        aiClassification: 'Fantascienza',
        enrichmentCompleted: true,
      });

      expect(metadata.title).toBe('Dune');
      expect(metadata.author).toBe('Frank Herbert');
      expect(metadata.publicationYear).toBe(1965);
      expect(metadata.aiClassification).toBe('Fantascienza');
      expect(metadata.enrichmentCompleted).toBe(true);
    });

    it('applies default values when only the title is given', () => {
      const metadata = new MetadataVo({ title: 'Dune' });

      expect(metadata.author).toBeNull();
      expect(metadata.publicationYear).toBeNull();
      expect(metadata.aiClassification).toBeNull();
      expect(metadata.enrichmentCompleted).toBe(false);
    });

    it('is immutable (frozen object)', () => {
      const metadata = new MetadataVo({ title: 'Dune' });

      expect(Object.isFrozen(metadata)).toBe(true);
      expect(() => {
        (metadata as { title: string }).title = 'Altro';
      }).toThrow(TypeError);
      expect(metadata.title).toBe('Dune');
    });
  });

  describe('validation', () => {
    it.each([['' as string], ['   ']])('rejects the empty title %j', (title) => {
      expect(() => new MetadataVo({ title })).toThrow(DomainError);
      expect(() => new MetadataVo({ title })).toThrow(/title/);
    });

    it('rejects a non-string title', () => {
      expect(() => new MetadataVo({ title: 42 as unknown as string })).toThrow(DomainError);
    });

    it('rejects null props', () => {
      expect(() => new MetadataVo(null as unknown as { title: string })).toThrow(DomainError);
    });

    it('rejects an empty author when provided', () => {
      expect(() => new MetadataVo({ title: 'Dune', author: '  ' })).toThrow(/author/);
    });

    it.each([0, -5, 1965.5, Number.NaN, 9999])('rejects the invalid year %p', (year) => {
      expect(() => new MetadataVo({ title: 'Dune', publicationYear: year })).toThrow(DomainError);
    });

    it('rejects a non-numeric year', () => {
      expect(
        () => new MetadataVo({ title: 'Dune', publicationYear: '1965' as unknown as number }),
      ).toThrow(DomainError);
    });

    it('rejects an empty AI classification', () => {
      expect(() => new MetadataVo({ title: 'Dune', aiClassification: '' })).toThrow(
        /aiClassification/,
      );
    });

    it('rejects a non-boolean completion flag', () => {
      expect(
        () =>
          new MetadataVo({
            title: 'Dune',
            aiClassification: 'x',
            enrichmentCompleted: 'yes' as unknown as boolean,
          }),
      ).toThrow(DomainError);
    });

    it('rejects a completed enrichment without an AI classification', () => {
      expect(() => new MetadataVo({ title: 'Dune', enrichmentCompleted: true })).toThrow(
        /AI classification/,
      );
    });
  });

  describe('missingFields', () => {
    it('lists the missing fields', () => {
      expect(new MetadataVo({ title: 'Dune' }).missingFields).toEqual([
        'author',
        'publicationYear',
      ]);
      expect(new MetadataVo({ title: 'Dune', author: 'FH' }).missingFields).toEqual([
        'publicationYear',
      ]);
      expect(
        new MetadataVo({ title: 'Dune', author: 'FH', publicationYear: 1965 }).missingFields,
      ).toEqual([]);
    });
  });

  describe('withEnrichment', () => {
    it('returns a new enriched instance without modifying the original', () => {
      const original = new MetadataVo({ title: 'Dune' });

      const enriched = original.withEnrichment({
        aiClassification: 'Fantascienza',
        author: 'Frank Herbert',
        publicationYear: 1965,
      });

      expect(enriched).not.toBe(original);
      expect(enriched.author).toBe('Frank Herbert');
      expect(enriched.publicationYear).toBe(1965);
      expect(enriched.aiClassification).toBe('Fantascienza');
      expect(enriched.enrichmentCompleted).toBe(true);
      expect(original.enrichmentCompleted).toBe(false);
      expect(original.author).toBeNull();
    });

    it('does not overwrite fields that are already present', () => {
      const original = new MetadataVo({ title: 'Dune', author: 'Frank Herbert' });

      const enriched = original.withEnrichment({ aiClassification: 'SF', author: 'Altro' });

      expect(enriched.author).toBe('Frank Herbert');
    });

    it('fails if the enrichment is already completed', () => {
      const enriched = new MetadataVo({ title: 'Dune' }).withEnrichment({ aiClassification: 'SF' });

      expect(() => enriched.withEnrichment({ aiClassification: 'Altro' })).toThrow(DomainError);
    });

    it('fails with an invalid AI classification', () => {
      expect(() =>
        new MetadataVo({ title: 'Dune' }).withEnrichment({ aiClassification: ' ' }),
      ).toThrow(DomainError);
    });

    it('fails without an enrichment result', () => {
      expect(() =>
        new MetadataVo({ title: 'Dune' }).withEnrichment(
          null as unknown as { aiClassification: string },
        ),
      ).toThrow(DomainError);
    });
  });

  describe('withCorrections', () => {
    const enriched = new MetadataVo({
      title: 'Dne',
      author: 'F. Herbert',
      publicationYear: 1956,
      aiClassification: 'Science fiction',
      enrichmentCompleted: true,
    });

    it('returns a new instance with the corrected values', () => {
      const corrected = enriched.withCorrections({
        title: ' Dune ',
        author: 'Frank Herbert',
        publicationYear: 1965,
      });

      expect(corrected).not.toBe(enriched);
      expect(corrected.title).toBe('Dune');
      expect(corrected.author).toBe('Frank Herbert');
      expect(corrected.publicationYear).toBe(1965);
    });

    it('does not modify the original instance', () => {
      enriched.withCorrections({ title: 'Dune', author: null, publicationYear: null });

      expect(enriched.title).toBe('Dne');
      expect(enriched.author).toBe('F. Herbert');
      expect(enriched.publicationYear).toBe(1956);
    });

    it('keeps the AI classification and the enrichment state, even when completed', () => {
      const corrected = enriched.withCorrections({ title: 'Dune' });

      expect(corrected.aiClassification).toBe('Science fiction');
      expect(corrected.enrichmentCompleted).toBe(true);
    });

    it('keeps a value when its property is missing and clears it when it is null', () => {
      expect(enriched.withCorrections({ title: 'Dune' }).author).toBe('F. Herbert');
      expect(enriched.withCorrections({ author: null }).author).toBeNull();
      expect(enriched.withCorrections({ publicationYear: null }).publicationYear).toBeNull();
      expect(enriched.withCorrections({}).equals(enriched)).toBe(true);
    });

    it.each([
      ['an empty title', { title: '  ' }, /"title"/],
      ['an empty author', { author: '' }, /"author"/],
      ['an invalid year', { publicationYear: 0 }, /publication year/],
      ['a decimal year', { publicationYear: 1965.5 }, /publication year/],
    ])('rejects %s', (_label, corrections, message) => {
      expect(() => enriched.withCorrections(corrections)).toThrow(DomainError);
      expect(() => enriched.withCorrections(corrections)).toThrow(message);
    });

    it('rejects missing corrections', () => {
      expect(() => enriched.withCorrections(null as unknown as { title: string })).toThrow(
        /corrections are required/,
      );
    });
  });

  describe('equals', () => {
    it('compares by value', () => {
      expect(new MetadataVo({ title: 'Dune' }).equals(new MetadataVo({ title: 'Dune' }))).toBe(
        true,
      );
      expect(new MetadataVo({ title: 'Dune' }).equals(new MetadataVo({ title: 'Emma' }))).toBe(
        false,
      );
    });
  });
});
