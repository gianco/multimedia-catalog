import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { Book } from '../../domain/book.entity.js';
import type { CatalogItem, CatalogItemKind } from '../../domain/catalog-item.abstract.js';
import { CD } from '../../domain/cd.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import { PersistenceError } from './persistence.error.js';

/**
 * Registry of the supported kinds. Typing it as a `Record` makes the compiler
 * fail when a new `CatalogItemKind` is added without being registered here.
 */
const KIND_REGISTRY: Readonly<Record<CatalogItemKind, true>> = {
  book: true,
  vinyl: true,
  cd: true,
  'video-file': true,
  'audio-file': true,
};

export const CATALOG_ITEM_KINDS: readonly CatalogItemKind[] = Object.freeze(
  Object.keys(KIND_REGISTRY) as CatalogItemKind[],
);

export function isCatalogItemKind(value: unknown): value is CatalogItemKind {
  return typeof value === 'string' && Object.hasOwn(KIND_REGISTRY, value);
}

/** Flat representation of a catalog item, as stored in a single database row. */
export type CatalogItemRow = {
  readonly id: string;
  readonly kind: CatalogItemKind;
  readonly title: string;
  readonly author: string | null;
  readonly publicationYear: number | null;
  readonly aiClassification: string | null;
  readonly enrichmentCompleted: 0 | 1;
  /** ISBN, barcode or absolute path, depending on the kind. */
  readonly identifier: string;
};

type RawRow = Readonly<Record<string, unknown>>;

function describeValue(value: unknown): string {
  if (value === null) {
    return 'NULL';
  }
  return `${typeof value} (${String(value)})`;
}

function readString(raw: RawRow, column: string): string {
  const value = raw[column];
  if (typeof value !== 'string') {
    throw new PersistenceError(
      `Column "${column}" must be a TEXT value, got ${describeValue(value)}.`,
    );
  }
  return value;
}

function readNullableString(raw: RawRow, column: string): string | null {
  const value = raw[column];
  if (value === null || value === undefined) {
    return null;
  }
  return readString(raw, column);
}

function toSafeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (
    typeof value === 'bigint' &&
    value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  return null;
}

function readNullableInteger(raw: RawRow, column: string): number | null {
  const value = raw[column];
  if (value === null || value === undefined) {
    return null;
  }
  const integer = toSafeInteger(value);
  if (integer === null) {
    throw new PersistenceError(
      `Column "${column}" must be a safe INTEGER value, got ${describeValue(value)}.`,
    );
  }
  return integer;
}

function readFlag(raw: RawRow, column: string): boolean {
  const integer = toSafeInteger(raw[column]);
  if (integer !== 0 && integer !== 1) {
    throw new PersistenceError(
      `Column "${column}" must be 0 or 1, got ${describeValue(raw[column])}.`,
    );
  }
  return integer === 1;
}

function readKind(raw: RawRow): CatalogItemKind {
  const value = raw['kind'];
  if (!isCatalogItemKind(value)) {
    throw new PersistenceError(
      `Column "kind" holds an unknown item kind: ${describeValue(value)}.`,
    );
  }
  return value;
}

/**
 * Converts rich domain entities into flat database rows and back.
 * It is the only place that knows how entities are laid out in storage.
 */
export class DataMapper {
  /** Flattens an entity into a row. */
  toRow(item: CatalogItem): CatalogItemRow {
    const { metadata } = item;

    return {
      id: item.id,
      kind: item.kind,
      title: metadata.title,
      author: metadata.author,
      publicationYear: metadata.publicationYear,
      aiClassification: metadata.aiClassification,
      enrichmentCompleted: metadata.enrichmentCompleted ? 1 : 0,
      identifier: this.extractIdentifier(item),
    };
  }

  /**
   * Rebuilds an entity from a raw row, validating every column.
   * @throws PersistenceError when the row is malformed or violates a domain invariant.
   */
  toDomain(raw: RawRow): CatalogItem {
    const id = readString(raw, 'id');
    const kind = readKind(raw);

    try {
      const metadata = new MetadataVo({
        title: readString(raw, 'title'),
        author: readNullableString(raw, 'author'),
        publicationYear: readNullableInteger(raw, 'publicationYear'),
        aiClassification: readNullableString(raw, 'aiClassification'),
        enrichmentCompleted: readFlag(raw, 'enrichmentCompleted'),
      });
      const identifier = readString(raw, 'identifier');

      switch (kind) {
        case 'book':
          return new Book(metadata, new IsbnVo(identifier), id);
        case 'vinyl':
          return new Vinyl(metadata, new BarcodeVo(identifier), id);
        case 'cd':
          return new CD(metadata, new BarcodeVo(identifier), id);
        case 'video-file':
          return new VideoFile(metadata, new AbsolutePathVo(identifier), id);
        case 'audio-file':
          return new AudioFile(metadata, new AbsolutePathVo(identifier), id);
        default: {
          const unsupportedKind: never = kind;
          throw new PersistenceError(`Unsupported item kind "${String(unsupportedKind)}".`);
        }
      }
    } catch (error) {
      if (error instanceof DomainError) {
        throw new PersistenceError(
          `Stored ${kind} "${id}" violates a domain constraint: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private extractIdentifier(item: CatalogItem): string {
    if (item instanceof Book) {
      return item.isbn.value;
    }
    if (item instanceof Vinyl || item instanceof CD) {
      return item.barcode.value;
    }
    if (item instanceof VideoFile || item instanceof AudioFile) {
      return item.absolutePath.value;
    }
    throw new PersistenceError(`Unsupported catalog item implementation for kind "${item.kind}".`);
  }
}
