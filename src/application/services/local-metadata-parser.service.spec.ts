import { describe, expect, it } from '@jest/globals';
import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { FileNameLocalMetadataParser } from './local-metadata-parser.service.js';

describe('FileNameLocalMetadataParser (mocked local parser)', () => {
  const parser = new FileNameLocalMetadataParser();
  const parse = (path: string) => parser.parse(new AbsolutePathVo(path));

  it('splits "Author - Title" and cleans underscores and the extension', async () => {
    await expect(parse('/m/Queen - Bohemian_Rhapsody.flac')).resolves.toEqual({
      title: 'Bohemian Rhapsody',
      author: 'Queen',
    });
  });

  it('uses the whole readable name as title when there is no author', async () => {
    await expect(parse('/v/The.Matrix.1999.mkv')).resolves.toEqual({ title: 'The Matrix 1999' });
  });

  it('handles files without extension', async () => {
    await expect(parse('/v/Matrix')).resolves.toEqual({ title: 'Matrix' });
  });

  it('keeps the raw file name when nothing readable remains', async () => {
    await expect(parse('/v/___.mp3')).resolves.toEqual({ title: '___.mp3' });
  });

  it('does not split when the author or title part would be empty', async () => {
    await expect(parse('/m/ - Lonely.mp3')).resolves.toEqual({ title: '- Lonely' });
  });
});
