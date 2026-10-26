export const ITEM_KINDS = ['book', 'vinyl', 'cd', 'video-file', 'audio-file'] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

/** Kinds identified by a printed code, enriched through the AI starting from that code. */
export type CodeIdentifiedKind = Extract<ItemKind, 'book' | 'vinyl' | 'cd'>;

/** Kinds identified by the absolute path of a local file. */
export type FileKind = Extract<ItemKind, 'video-file' | 'audio-file'>;

export interface ItemKindInfo {
  readonly label: string;
  readonly pluralLabel: string;
  /** Label of the field holding the identity of the item (ISBN, barcode or path). */
  readonly identifierLabel: string;
  readonly identifierPlaceholder: string;
  /** Label of the author/artist field. */
  readonly creatorLabel: string;
  /** Label of the "let the AI do the work" input mode. */
  readonly aiModeLabel: string;
}

export const ITEM_KIND_INFO: Readonly<Record<ItemKind, ItemKindInfo>> = {
  book: {
    label: 'Book',
    pluralLabel: 'Books',
    identifierLabel: 'ISBN',
    identifierPlaceholder: '978-0-306-40615-7',
    creatorLabel: 'Author',
    aiModeLabel: 'Enrich from ISBN',
  },
  vinyl: {
    label: 'Vinyl',
    pluralLabel: 'Vinyls',
    identifierLabel: 'Barcode',
    identifierPlaceholder: '036000291452',
    creatorLabel: 'Artist',
    aiModeLabel: 'Enrich from barcode',
  },
  cd: {
    label: 'CD',
    pluralLabel: 'CDs',
    identifierLabel: 'Barcode',
    identifierPlaceholder: '4006381333931',
    creatorLabel: 'Artist',
    aiModeLabel: 'Enrich from barcode',
  },
  'video-file': {
    label: 'Video file',
    pluralLabel: 'Video files',
    identifierLabel: 'Absolute path',
    identifierPlaceholder: '/home/user/Videos/movie.mkv',
    creatorLabel: 'Director',
    aiModeLabel: 'Scan file and enrich',
  },
  'audio-file': {
    label: 'Audio file',
    pluralLabel: 'Audio files',
    identifierLabel: 'Absolute path',
    identifierPlaceholder: '/home/user/Music/Artist - Title.flac',
    creatorLabel: 'Artist',
    aiModeLabel: 'Scan file and enrich',
  },
};

export function isFileKind(kind: ItemKind): kind is FileKind {
  return kind === 'video-file' || kind === 'audio-file';
}

export function isCodeIdentifiedKind(kind: ItemKind): kind is CodeIdentifiedKind {
  return !isFileKind(kind);
}

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
}
