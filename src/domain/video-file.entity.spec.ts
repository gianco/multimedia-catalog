import { AbsolutePathVo } from './absolute-path.vo.js';
import { CatalogItem } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import { MetadataVo } from './metadata.vo.js';
import { VideoFile } from './video-file.entity.js';

describe('VideoFile', () => {
  const buildMetadata = (): MetadataVo => new MetadataVo({ title: 'Matrix' });
  const buildAbsolutePath = (): AbsolutePathVo =>
    new AbsolutePathVo('/home/gianco/Video/matrix.mkv');

  it('extends CatalogItem and encapsulates metadata and absolute path', () => {
    const metadata = buildMetadata();
    const absolutePath = buildAbsolutePath();

    const videoFile = new VideoFile(metadata, absolutePath);

    expect(videoFile).toBeInstanceOf(CatalogItem);
    expect(videoFile.kind).toBe('video-file');
    expect(videoFile.metadata).toBe(metadata);
    expect(videoFile.absolutePath).toBe(absolutePath);
    expect(videoFile.id).toEqual(expect.any(String));
  });

  it('exposes file name and extension', () => {
    const videoFile = new VideoFile(buildMetadata(), buildAbsolutePath());

    expect(videoFile.fileName).toBe('matrix.mkv');
    expect(videoFile.extension).toBe('mkv');
  });

  it('rejects a path that is not an AbsolutePathVo', () => {
    expect(
      () =>
        new VideoFile(
          buildMetadata(),
          '/home/gianco/Video/matrix.mkv' as unknown as AbsolutePathVo,
        ),
    ).toThrow(DomainError);
    expect(() => new VideoFile(buildMetadata(), null as unknown as AbsolutePathVo)).toThrow(
      /AbsolutePathVo/,
    );
  });

  it('rejects a path that coincides with the title', () => {
    expect(
      () => new VideoFile(new MetadataVo({ title: '/Matrix' }), new AbsolutePathVo('/Matrix')),
    ).toThrow(/title/);
  });

  it('rejects invalid metadata', () => {
    expect(() => new VideoFile(undefined as unknown as MetadataVo, buildAbsolutePath())).toThrow(
      DomainError,
    );
  });

  it('uses the absolute path as identifier in the enrichment request', () => {
    const videoFile = new VideoFile(buildMetadata(), buildAbsolutePath());

    expect(videoFile.buildEnrichmentRequest()).toMatchObject({
      itemId: videoFile.id,
      kind: 'video-file',
      title: 'Matrix',
      identifier: { type: 'absolute-path', value: '/home/gianco/Video/matrix.mkv' },
    });
  });

  it('refuses a corrected title equal to the path and restores the previous metadata', () => {
    const videoFile = new VideoFile(buildMetadata(), buildAbsolutePath());
    const before = videoFile.metadata;

    expect(() => videoFile.correctMetadata({ title: buildAbsolutePath().value })).toThrow(
      /must not coincide with the title/,
    );

    expect(videoFile.metadata).toBe(before);
  });

  it('accepts any other corrected title', () => {
    const videoFile = new VideoFile(buildMetadata(), buildAbsolutePath());

    videoFile.correctMetadata({ title: 'The Matrix' });

    expect(videoFile.title).toBe('The Matrix');
  });

  it('gets enriched through the data returned by Claude', () => {
    const videoFile = new VideoFile(buildMetadata(), buildAbsolutePath());

    videoFile.applyEnrichment({
      aiClassification: 'Fantascienza',
      author: 'Lana e Lilly Wachowski',
      publicationYear: 1999,
    });

    expect(videoFile.isEnriched).toBe(true);
    expect(videoFile.metadata.publicationYear).toBe(1999);
    expect(() => videoFile.applyEnrichment({ aiClassification: 'Azione' })).toThrow(DomainError);
  });
});
