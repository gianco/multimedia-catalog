import type { AbsolutePathVo } from '../../domain/absolute-path.vo.js';

/** Metadata that can be extracted locally from a file, before any AI refinement. */
export interface LocalFileMetadata {
  readonly title: string;
  readonly author?: string;
}

/** Port for reading the metadata of a local file (tags, container info, file name...). */
export interface LocalMetadataParser {
  parse(absolutePath: AbsolutePathVo): Promise<LocalFileMetadata>;
}

const AUTHOR_TITLE_SEPARATOR = ' - ';

/**
 * Mocked parser: it does not open the file, it only derives the metadata from the file name
 * (e.g. `Queen - Bohemian_Rhapsody.flac` gives author "Queen" and title "Bohemian Rhapsody").
 * A real implementation (ffprobe, music-metadata...) can replace it without touching the handlers.
 */
export class FileNameLocalMetadataParser implements LocalMetadataParser {
  async parse(absolutePath: AbsolutePathVo): Promise<LocalFileMetadata> {
    const { fileName, extension } = absolutePath;
    const baseName = extension === '' ? fileName : fileName.slice(0, -(extension.length + 1));
    const readable = baseName.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

    if (readable.length === 0) {
      return { title: fileName };
    }

    const separatorIndex = readable.indexOf(AUTHOR_TITLE_SEPARATOR);
    if (separatorIndex > 0) {
      const author = readable.slice(0, separatorIndex).trim();
      const title = readable.slice(separatorIndex + AUTHOR_TITLE_SEPARATOR.length).trim();
      if (author.length > 0 && title.length > 0) {
        return { title, author };
      }
    }
    return { title: readable };
  }
}
