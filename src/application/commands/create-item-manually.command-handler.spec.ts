import { beforeEach, describe, expect, it } from '@jest/globals';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { Book } from '../../domain/book.entity.js';
import { CD } from '../../domain/cd.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import { createRepositoryMock, savedItem } from '../testing/mocks.js';
import type { MockedCatalogItemRepository } from '../testing/mocks.js';
import { CreateItemManuallyCommandHandler } from './create-item-manually.command-handler.js';
import type { CreateItemManuallyCommand } from './create-item-manually.command-handler.js';

const bookCommand: CreateItemManuallyCommand = {
  kind: 'book',
  identifier: '978-0-306-40615-7',
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
};

describe('CreateItemManuallyCommandHandler', () => {
  let repository: MockedCatalogItemRepository;
  let handler: CreateItemManuallyCommandHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    handler = new CreateItemManuallyCommandHandler(repository);
  });

  it('persists a book with the full manual input and returns its id', async () => {
    const id = await handler.execute(bookCommand);

    expect(repository.save).toHaveBeenCalledTimes(1);
    const item = savedItem(repository);
    expect(item).toBeInstanceOf(Book);
    expect(item.id).toBe(id);
    expect(item.metadata.title).toBe('Dune');
    expect(item.metadata.author).toBe('Frank Herbert');
    expect(item.metadata.publicationYear).toBe(1965);
    expect((item as Book).isbn.value).toBe('9780306406157');
  });

  it.each([
    ['vinyl', '036000291452', Vinyl],
    ['cd', '4006381333931', CD],
    ['video-file', '/home/user/matrix.mkv', VideoFile],
    ['audio-file', '/home/user/song.flac', AudioFile],
  ] as const)('creates the right entity for the kind %s', async (kind, identifier, type) => {
    await handler.execute({ kind, identifier, title: 'Some title' });

    expect(savedItem(repository)).toBeInstanceOf(type);
  });

  it('keeps the enrichment state declared by the user', async () => {
    await handler.execute({
      ...bookCommand,
      aiClassification: 'Science fiction',
      enrichmentCompleted: true,
    });

    const item = savedItem(repository);
    expect(item.isEnriched).toBe(true);
    expect(item.metadata.aiClassification).toBe('Science fiction');
  });

  it('creates an item that still needs enrichment by default', async () => {
    await handler.execute({ kind: 'book', identifier: '9780306406157', title: 'Dune' });

    expect(savedItem(repository).needsEnrichment).toBe(true);
  });

  it('generates a different id for every created item', async () => {
    const first = await handler.execute(bookCommand);
    const second = await handler.execute(bookCommand);

    expect(first).not.toBe(second);
  });

  it.each([
    ['an invalid ISBN', { ...bookCommand, identifier: '1234567890' }],
    ['an empty title', { ...bookCommand, title: '  ' }],
    ['an invalid year', { ...bookCommand, publicationYear: 0 }],
    ['a relative path', { kind: 'video-file', identifier: 'matrix.mkv', title: 'Matrix' }],
    ['an unknown kind', { ...bookCommand, kind: 'magazine' }],
  ] as const)('rejects %s and saves nothing', async (_label, command) => {
    await expect(handler.execute(command as CreateItemManuallyCommand)).rejects.toThrow(
      DomainError,
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propagates repository failures', async () => {
    repository.save.mockRejectedValue(new Error('disk full'));

    await expect(handler.execute(bookCommand)).rejects.toThrow('disk full');
  });
});
