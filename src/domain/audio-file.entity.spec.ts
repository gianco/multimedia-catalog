import { AbsolutePathVo } from './absolute-path.vo.js';
import { AudioFile } from './audio-file.entity.js';
import { CatalogItem } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';

describe('AudioFile', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Bohemian Rhapsody' });
  const buildAbsolutePath = (): AbsolutePathVo =>
    new AbsolutePathVo('/home/gianco/Musica/bohemian-rhapsody.flac');

  it('extends CatalogItem and encapsulates metadata and absolute path', () => {
    const metadata = buildMetadata();
    const absolutePath = buildAbsolutePath();

    const audioFile = new AudioFile(metadata, absolutePath);

    expect(audioFile).toBeInstanceOf(CatalogItem);
    expect(audioFile.kind).toBe('audio-file');
    expect(audioFile.metadata).toBe(metadata);
    expect(audioFile.absolutePath).toBe(absolutePath);
    expect(audioFile.id).toEqual(expect.any(String));
  });

  it('exposes file name and extension', () => {
    const audioFile = new AudioFile(buildMetadata(), buildAbsolutePath());

    expect(audioFile.fileName).toBe('bohemian-rhapsody.flac');
    expect(audioFile.extension).toBe('flac');
  });

  it('rejects a path that is not an AbsolutePathVo', () => {
    expect(
      () =>
        new AudioFile(buildMetadata(), '/home/gianco/Musica/a.flac' as unknown as AbsolutePathVo),
    ).toThrow(DomainError);
    expect(() => new AudioFile(buildMetadata(), undefined as unknown as AbsolutePathVo)).toThrow(
      /AbsolutePathVo/,
    );
  });

  it('rejects a path that coincides with the title', () => {
    expect(
      () => new AudioFile(new MetadataVo({ title: '/Traccia' }), new AbsolutePathVo('/Traccia')),
    ).toThrow(/title/);
  });

  it('rejects invalid metadata', () => {
    expect(() => new AudioFile(null as unknown as MetadataVo, buildAbsolutePath())).toThrow(
      DomainError,
    );
  });

  it('uses the absolute path as identifier in the enrichment request', () => {
    const audioFile = new AudioFile(buildMetadata(), buildAbsolutePath());

    expect(audioFile.buildEnrichmentRequest()).toMatchObject({
      itemId: audioFile.id,
      kind: 'audio-file',
      title: 'Bohemian Rhapsody',
      identifier: { type: 'absolute-path', value: '/home/gianco/Musica/bohemian-rhapsody.flac' },
    });
  });

  it('refuses a corrected title equal to the path and restores the previous metadata', () => {
    const audioFile = new AudioFile(buildMetadata(), buildAbsolutePath());
    const before = audioFile.metadata;

    expect(() => audioFile.correctMetadata({ title: buildAbsolutePath().value })).toThrow(
      /must not coincide with the title/,
    );

    expect(audioFile.metadata).toBe(before);
  });

  it('accepts any other corrected title', () => {
    const audioFile = new AudioFile(buildMetadata(), buildAbsolutePath());

    audioFile.correctMetadata({ title: 'Bohemian Rhapsody (Remastered)' });

    expect(audioFile.title).toBe('Bohemian Rhapsody (Remastered)');
  });

  it('gets enriched through the data returned by Claude', () => {
    const audioFile = new AudioFile(buildMetadata(), buildAbsolutePath());

    audioFile.applyEnrichment({ aiClassification: 'Rock', author: 'Queen', publicationYear: 1975 });

    expect(audioFile.isEnriched).toBe(true);
    expect(audioFile.metadata.author).toBe('Queen');
    expect(() => audioFile.buildEnrichmentRequest()).toThrow(DomainError);
  });
});
