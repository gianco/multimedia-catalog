import { randomUUID } from 'node:crypto';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';
import type {
  MetadataCorrections,
  MetadataEnrichment,
  MissingMetadataField,
} from './metadata.vo.js';

export type CatalogItemKind = 'book' | 'vinyl' | 'cd' | 'video-file' | 'audio-file';

export type ItemIdentifierType = 'isbn' | 'barcode' | 'absolute-path';

/** Identifier specific to the concrete entity (ISBN, barcode or path). */
export interface ItemIdentifier {
  readonly type: ItemIdentifierType;
  readonly value: string;
}

/**
 * Neutral, serializable description of what must be known to enrich an item.
 * It is meant to be consumed by an infrastructure adapter (e.g. the Claude API)
 * without the domain depending on it.
 */
export interface EnrichmentRequest {
  readonly itemId: string;
  readonly kind: CatalogItemKind;
  readonly title: string;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly identifier: ItemIdentifier;
  readonly missingFields: readonly MissingMetadataField[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Abstract base class of all catalog resources.
 * Encapsulates the globally unique identity (UUID generated with `node:crypto`) and the common metadata.
 */
export abstract class CatalogItem {
  abstract readonly kind: CatalogItemKind;

  readonly id: string;
  #metadata: MetadataVo;

  /**
   * @param metadata common metadata of the item
   * @param id existing UUID, to be provided only to rebuild an already persisted item;
   *           if omitted, a new one is generated.
   */
  protected constructor(metadata: MetadataVo, id?: string) {
    if (!(metadata instanceof MetadataVo)) {
      throw new DomainError('CatalogItem: the metadata must be an instance of MetadataVo.');
    }
    if (id !== undefined && (typeof id !== 'string' || !UUID_PATTERN.test(id))) {
      throw new DomainError(`CatalogItem: the id "${String(id)}" is not a valid UUID.`);
    }

    this.id = id ?? randomUUID();
    this.#metadata = metadata;
  }

  get metadata(): MetadataVo {
    return this.#metadata;
  }

  get title(): string {
    return this.#metadata.title;
  }

  /** `true` if data enrichment has already been completed. */
  get isEnriched(): boolean {
    return this.#metadata.enrichmentCompleted;
  }

  /** `true` if the item is still awaiting data enrichment. */
  get needsEnrichment(): boolean {
    return !this.#metadata.enrichmentCompleted;
  }

  /** Specific identifier (ISBN, barcode or absolute path). */
  protected abstract get identifier(): ItemIdentifier;

  /** Builds the enrichment request to send to an external service (e.g. Claude). */
  buildEnrichmentRequest(): EnrichmentRequest {
    if (this.isEnriched) {
      throw new DomainError(`CatalogItem ${this.id}: data enrichment has already been completed.`);
    }

    return {
      itemId: this.id,
      kind: this.kind,
      title: this.#metadata.title,
      author: this.#metadata.author,
      publicationYear: this.#metadata.publicationYear,
      identifier: this.identifier,
      missingFields: this.#metadata.missingFields,
    };
  }

  /** Applies the enrichment result by replacing the metadata with a new version. */
  applyEnrichment(enrichment: MetadataEnrichment): void {
    this.#metadata = this.#metadata.withEnrichment(enrichment);
  }

  /**
   * Manually corrects the descriptive metadata (title, author, publication year).
   * The change is all-or-nothing: if the corrected metadata is invalid, either on its own or for
   * this specific kind of item, an error is thrown and the item is left untouched.
   */
  correctMetadata(corrections: MetadataCorrections): void {
    const previous = this.#metadata;
    this.#metadata = previous.withCorrections(corrections);
    try {
      this.assertInvariants();
    } catch (error) {
      this.#metadata = previous;
      throw error;
    }
  }

  /**
   * Hook for the invariants that tie the metadata to the identity of a concrete entity.
   * Subclasses that have some override it and also call it at the end of their constructor.
   */
  protected assertInvariants(): void {}

  /** Two items are the same item if they share the identity (id), not the attributes. */
  equals(other: CatalogItem): boolean {
    return this.id === other.id;
  }
}
