import { describe, expect, it } from '@jest/globals';
import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { AudioFile } from '../../domain/audio-file.entity.js';
import { BarcodeVo } from '../../domain/barcode.vo.js';
import { Book } from '../../domain/book.entity.js';
import type { CatalogItemKind } from '../../domain/catalog-item.abstract.js';
import { CD } from '../../domain/cd.entity.js';
import { DomainError } from '../../domain/domain.error.js';
import { IsbnVo } from '../../domain/isbn.vo.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { VideoFile } from '../../domain/video-file.entity.js';
import { Vinyl } from '../../domain/vinyl.entity.js';
import {
  createCatalogItem,
  isCodeIdentifiedKind,
  isFileKind,
  parseIdentity,
} from './catalog-item.factory.js';

const metadata = new MetadataVo({ title: 'Some title' });

describe('catalog item factory', () => {
  describe('parseIdentity', () => {
    it.each([
      ['book', '9780306406157', IsbnVo],
      ['vinyl', '036000291452', BarcodeVo],
      ['cd', '4006381333931', BarcodeVo],
      ['video-file', '/home/user/a.mkv', AbsolutePathVo],
      ['audio-file', '/home/user/a.flac', AbsolutePathVo],
    ] as const)('parses the identifier of a %s', (kind, raw, type) => {
      expect(parseIdentity(kind, raw)).toBeInstanceOf(type);
    });

    it('lets domain validation errors through', () => {
      expect(() => parseIdentity('book', '123')).toThrow(DomainError);
    });

    it('rejects an unknown kind', () => {
      expect(() => parseIdentity('magazine' as CatalogItemKind, 'x')).toThrow(
        /Unsupported catalog item kind "magazine"/,
      );
    });
  });

  describe('createCatalogItem', () => {
    it.each([
      ['book', new IsbnVo('9780306406157'), Book],
      ['vinyl', new BarcodeVo('036000291452'), Vinyl],
      ['cd', new BarcodeVo('4006381333931'), CD],
      ['video-file', new AbsolutePathVo('/home/user/a.mkv'), VideoFile],
      ['audio-file', new AbsolutePathVo('/home/user/a.flac'), AudioFile],
    ] as const)('creates the entity for a %s', (kind, identity, type) => {
      const item = createCatalogItem(kind, identity, metadata);

      expect(item).toBeInstanceOf(type);
      expect(item.metadata).toBe(metadata);
    });

    it.each([
      ['book', new BarcodeVo('036000291452')],
      ['vinyl', new IsbnVo('9780306406157')],
      ['cd', new AbsolutePathVo('/home/user/a.flac')],
      ['video-file', new BarcodeVo('036000291452')],
      ['audio-file', new IsbnVo('9780306406157')],
    ] as const)('rejects a mismatching identity for a %s', (kind, identity) => {
      expect(() => createCatalogItem(kind, identity, metadata)).toThrow(/requires/);
    });

    it('rejects an unknown kind', () => {
      expect(() =>
        createCatalogItem('magazine' as CatalogItemKind, new IsbnVo('9780306406157'), metadata),
      ).toThrow(DomainError);
    });
  });

  describe('kind guards', () => {
    it('recognizes the kinds identified by a code', () => {
      expect(['book', 'vinyl', 'cd'].every(isCodeIdentifiedKind)).toBe(true);
      expect(isCodeIdentifiedKind('video-file')).toBe(false);
      expect(isCodeIdentifiedKind(undefined)).toBe(false);
    });

    it('recognizes the file kinds', () => {
      expect(['video-file', 'audio-file'].every(isFileKind)).toBe(true);
      expect(isFileKind('book')).toBe(false);
      expect(isFileKind(42)).toBe(false);
    });
  });
});
