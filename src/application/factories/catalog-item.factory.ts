import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { Book } from '../../domain/book.entity.js';
import type { CatalogItem, CatalogItemKind } from '../../domain/catalog-item.abstract.js';
import { CD } from '../../domain/cd.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import type { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';

/** Kinds identified by a code printed on the item (ISBN or barcode). */
export type CodeIdentifiedKind = Extract<CatalogItemKind, 'book' | 'vinyl' | 'cd'>;

/** Kinds identified by the absolute path of a local file. */
export type FileKind = Extract<CatalogItemKind, 'video-file' | 'audio-file'>;

export type ItemIdentity = IsbnVo | BarcodeVo | AbsolutePathVo;

const CODE_IDENTIFIED_KINDS: readonly CatalogItemKind[] = ['book', 'vinyl', 'cd'];
const FILE_KINDS: readonly CatalogItemKind[] = ['video-file', 'audio-file'];

export function isCodeIdentifiedKind(kind: unknown): kind is CodeIdentifiedKind {
  return CODE_IDENTIFIED_KINDS.includes(kind as CatalogItemKind);
}

export function isFileKind(kind: unknown): kind is FileKind {
  return FILE_KINDS.includes(kind as CatalogItemKind);
}

/**
 * Validates a raw identifier and turns it into the identity value object of the given kind.
 * @throws DomainError when the kind is unknown or the identifier is formally invalid.
 */
export function parseIdentity(kind: CatalogItemKind, rawIdentifier: string): ItemIdentity {
  switch (kind) {
    case 'book':
      return new IsbnVo(rawIdentifier);
    case 'vinyl':
    case 'cd':
      return new BarcodeVo(rawIdentifier);
    case 'video-file':
    case 'audio-file':
      return new AbsolutePathVo(rawIdentifier);
    default:
      throw new DomainError(`Unsupported catalog item kind "${String(kind)}".`);
  }
}

function mismatch(kind: CatalogItemKind, expected: string): DomainError {
  return new DomainError(`A "${kind}" item requires ${expected} as identity.`);
}

/**
 * Builds the concrete entity matching the kind.
 * @throws DomainError when the identity value object does not belong to the kind.
 */
export function createCatalogItem(
  kind: CatalogItemKind,
  identity: ItemIdentity,
  metadata: MetadataVo,
): CatalogItem {
  switch (kind) {
    case 'book':
      if (!(identity instanceof IsbnVo)) throw mismatch(kind, 'an ISBN');
      return new Book(metadata, identity);
    case 'vinyl':
      if (!(identity instanceof BarcodeVo)) throw mismatch(kind, 'a barcode');
      return new Vinyl(metadata, identity);
    case 'cd':
      if (!(identity instanceof BarcodeVo)) throw mismatch(kind, 'a barcode');
      return new CD(metadata, identity);
    case 'video-file':
      if (!(identity instanceof AbsolutePathVo)) throw mismatch(kind, 'an absolute path');
      return new VideoFile(metadata, identity);
    case 'audio-file':
      if (!(identity instanceof AbsolutePathVo)) throw mismatch(kind, 'an absolute path');
      return new AudioFile(metadata, identity);
    default:
      throw new DomainError(`Unsupported catalog item kind "${String(kind)}".`);
  }
}
