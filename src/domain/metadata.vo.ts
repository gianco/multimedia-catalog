import { DomainError } from './domain.error.js';

export type MissingMetadataField = 'author' | 'publicationYear';

export interface MetadataProps {
  readonly title: string;
  readonly author?: string | null;
  readonly publicationYear?: number | null;
  readonly aiClassification?: string | null;
  readonly enrichmentCompleted?: boolean;
}

/**
 * Result of the data enrichment (e.g. returned by the Claude API).
 * `author` and `publicationYear` only fill in the fields that are still missing.
 */
export interface MetadataEnrichment {
  readonly aiClassification: string;
  readonly author?: string;
  readonly publicationYear?: number;
}

/**
 * Manual corrections of the descriptive metadata. A missing (`undefined`) property keeps the
 * current value, while `null` clears an optional one (author, publication year).
 * The AI classification and the enrichment state are results of the enrichment and can never be
 * corrected by hand.
 */
export interface MetadataCorrections {
  readonly title?: string;
  readonly author?: string | null;
  readonly publicationYear?: number | null;
}

const MIN_PUBLICATION_YEAR = 1;

function normalizeText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError(`Metadata: the "${field}" field must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeOptionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return normalizeText(value, field);
}

function normalizePublicationYear(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const maxYear = new Date().getFullYear() + 1;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_PUBLICATION_YEAR ||
    value > maxYear
  ) {
    throw new DomainError(
      `Metadata: the publication year must be an integer between ${MIN_PUBLICATION_YEAR} and ${maxYear}.`,
    );
  }
  return value;
}

/**
 * Generic metadata shared by all catalog resources.
 * Immutable: every "modification" returns a new instance.
 */
export class MetadataVo {
  readonly title: string;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly aiClassification: string | null;
  readonly enrichmentCompleted: boolean;

  constructor(props: MetadataProps) {
    if (props === null || typeof props !== 'object') {
      throw new DomainError('Metadata: the properties are required.');
    }

    this.title = normalizeText(props.title, 'title');
    this.author = normalizeOptionalText(props.author, 'author');
    this.publicationYear = normalizePublicationYear(props.publicationYear);
    this.aiClassification = normalizeOptionalText(props.aiClassification, 'aiClassification');

    const enrichmentCompleted = props.enrichmentCompleted ?? false;
    if (typeof enrichmentCompleted !== 'boolean') {
      throw new DomainError('Metadata: "enrichmentCompleted" must be a boolean.');
    }
    if (enrichmentCompleted && this.aiClassification === null) {
      throw new DomainError('Metadata: a completed enrichment requires an AI classification.');
    }
    this.enrichmentCompleted = enrichmentCompleted;

    Object.freeze(this);
  }

  /** Fields that still have to be filled in through enrichment. */
  get missingFields(): readonly MissingMetadataField[] {
    const missing: MissingMetadataField[] = [];
    if (this.author === null) {
      missing.push('author');
    }
    if (this.publicationYear === null) {
      missing.push('publicationYear');
    }
    return missing;
  }

  /**
   * Returns new enriched metadata: sets the AI classification,
   * fills in only the missing fields and marks the enrichment as completed.
   */
  withEnrichment(enrichment: MetadataEnrichment): MetadataVo {
    if (this.enrichmentCompleted) {
      throw new DomainError('Metadata: data enrichment has already been completed.');
    }
    if (enrichment === null || typeof enrichment !== 'object') {
      throw new DomainError('Metadata: the enrichment result is required.');
    }

    return new MetadataVo({
      title: this.title,
      author: this.author ?? enrichment.author ?? null,
      publicationYear: this.publicationYear ?? enrichment.publicationYear ?? null,
      aiClassification: enrichment.aiClassification,
      enrichmentCompleted: true,
    });
  }

  /**
   * Returns new metadata with the manual corrections applied, validated by the same rules as a new
   * instance. The AI classification and the enrichment state are preserved as they are.
   */
  withCorrections(corrections: MetadataCorrections): MetadataVo {
    if (corrections === null || typeof corrections !== 'object') {
      throw new DomainError('Metadata: the corrections are required.');
    }

    return new MetadataVo({
      title: corrections.title === undefined ? this.title : corrections.title,
      author: corrections.author === undefined ? this.author : corrections.author,
      publicationYear:
        corrections.publicationYear === undefined
          ? this.publicationYear
          : corrections.publicationYear,
      aiClassification: this.aiClassification,
      enrichmentCompleted: this.enrichmentCompleted,
    });
  }

  equals(other: MetadataVo): boolean {
    return (
      this.title === other.title &&
      this.author === other.author &&
      this.publicationYear === other.publicationYear &&
      this.aiClassification === other.aiClassification &&
      this.enrichmentCompleted === other.enrichmentCompleted
    );
  }
}
