import { AbsolutePathVo } from './absolute-path.vo.js';
import { DomainError } from './domain.error.js';

describe('AbsolutePathVo', () => {
  describe('creation', () => {
    it('accepts a valid POSIX absolute path', () => {
      const absolutePath = new AbsolutePathVo('/home/gianco/Video/film.mkv');

      expect(absolutePath.value).toBe('/home/gianco/Video/film.mkv');
    });

    it('accepts a file in the root, spaces and unicode characters', () => {
      expect(new AbsolutePathVo('/film.mkv').value).toBe('/film.mkv');
      expect(new AbsolutePathVo('/home/gianco/My Music/naïve café.flac').fileName).toBe(
        'naïve café.flac',
      );
    });

    it('is immutable', () => {
      const absolutePath = new AbsolutePathVo('/a/b.mp3');

      expect(Object.isFrozen(absolutePath)).toBe(true);
      expect(() => {
        (absolutePath as { value: string }).value = '/x';
      }).toThrow(TypeError);
    });
  });

  describe('validation', () => {
    it('rejects non-string values', () => {
      expect(() => new AbsolutePathVo(null as unknown as string)).toThrow(DomainError);
    });

    it.each(['', '   '])('rejects the empty path %j', (value) => {
      expect(() => new AbsolutePathVo(value)).toThrow(/empty/);
    });

    it.each(['home/gianco/a.mp3', './a.mp3', '../a.mp3', 'Titolo del film', 'C:\\Video\\a.mkv'])(
      'rejects the non-absolute path %j',
      (value) => {
        expect(() => new AbsolutePathVo(value)).toThrow(DomainError);
        expect(() => new AbsolutePathVo(value)).toThrow(/start with "\/"/);
      },
    );

    it('rejects the NUL character', () => {
      expect(() => new AbsolutePathVo('/home/a\0b.mp3')).toThrow(/NUL/);
    });

    it('rejects the root alone', () => {
      expect(() => new AbsolutePathVo('/')).toThrow(/root/);
    });

    it('rejects a trailing slash', () => {
      expect(() => new AbsolutePathVo('/home/gianco/')).toThrow(/must not end/);
    });

    it('rejects empty segments', () => {
      expect(() => new AbsolutePathVo('/home//gianco/a.mp3')).toThrow(/empty segments/);
    });

    it.each(['/home/./a.mp3', '/home/../etc/passwd', '/..'])(
      'rejects relative segments in %j',
      (value) => {
        expect(() => new AbsolutePathVo(value)).toThrow(/relative segments/);
      },
    );

    it('rejects a segment over 255 bytes', () => {
      expect(() => new AbsolutePathVo(`/${'a'.repeat(256)}`)).toThrow(/255/);
    });

    it('rejects a path over 4096 bytes', () => {
      const longPath = `/${Array.from({ length: 20 }, () => 'a'.repeat(250)).join('/')}`;

      expect(() => new AbsolutePathVo(longPath)).toThrow(/4096/);
    });
  });

  describe('domain behavior', () => {
    it('exposes file name, extension and directory', () => {
      const absolutePath = new AbsolutePathVo('/home/gianco/Video/Film.Finale.MKV');

      expect(absolutePath.fileName).toBe('Film.Finale.MKV');
      expect(absolutePath.extension).toBe('mkv');
      expect(absolutePath.directory).toBe('/home/gianco/Video');
    });

    it('handles files without extension, dotfiles and files in the root', () => {
      expect(new AbsolutePathVo('/home/gianco/README').extension).toBe('');
      expect(new AbsolutePathVo('/home/gianco/.hidden').extension).toBe('');
      expect(new AbsolutePathVo('/film.mkv').directory).toBe('/');
    });

    it('recognizes a path that coincides with the title', () => {
      const absolutePath = new AbsolutePathVo('/Matrix');

      expect(absolutePath.coincidesWithTitle('/Matrix')).toBe(true);
      expect(absolutePath.coincidesWithTitle('Matrix')).toBe(false);
    });

    it('compares by value', () => {
      expect(new AbsolutePathVo('/a/b.mp3').equals(new AbsolutePathVo('/a/b.mp3'))).toBe(true);
      expect(new AbsolutePathVo('/a/b.mp3').equals(new AbsolutePathVo('/a/c.mp3'))).toBe(false);
    });

    it('serializes as a string', () => {
      expect(String(new AbsolutePathVo('/a/b.mp3'))).toBe('/a/b.mp3');
    });
  });
});
