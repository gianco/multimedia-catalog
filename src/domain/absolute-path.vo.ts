import { DomainError } from './domain.error.js';

const POSIX_PATH_MAX_BYTES = 4096;
const POSIX_NAME_MAX_BYTES = 255;

/**
 * Canonical absolute path of a file on a Linux/POSIX file system.
 *
 * Constraints: non-empty string, starts with "/", no NUL byte, no empty segment
 * (e.g. "//"), "." or "..", no trailing slash, is not the root alone,
 * maximum length of 4096 bytes (PATH_MAX) and 255 bytes per segment (NAME_MAX).
 */
export class AbsolutePathVo {
  readonly value: string;

  constructor(raw: string) {
    if (typeof raw !== 'string') {
      throw new DomainError('AbsolutePath: the value must be a string.');
    }

    if (raw.trim().length === 0) {
      throw new DomainError('AbsolutePath: the path must not be empty.');
    }

    if (raw.includes('\0')) {
      throw new DomainError('AbsolutePath: the path must not contain the NUL character.');
    }

    if (!raw.startsWith('/')) {
      throw new DomainError(
        `AbsolutePath "${raw}" is invalid: a POSIX absolute path must start with "/".`,
      );
    }

    if (raw === '/') {
      throw new DomainError('AbsolutePath: the root "/" does not identify a file.');
    }

    if (raw.endsWith('/')) {
      throw new DomainError(`AbsolutePath "${raw}" is invalid: it must not end with "/".`);
    }

    if (Buffer.byteLength(raw, 'utf8') > POSIX_PATH_MAX_BYTES) {
      throw new DomainError(
        `AbsolutePath is invalid: it exceeds the allowed ${POSIX_PATH_MAX_BYTES} bytes.`,
      );
    }

    for (const segment of raw.slice(1).split('/')) {
      if (segment.length === 0) {
        throw new DomainError(
          `AbsolutePath "${raw}" is invalid: it contains empty segments ("//").`,
        );
      }
      if (segment === '.' || segment === '..') {
        throw new DomainError(
          `AbsolutePath "${raw}" is invalid: relative segments ("." or "..") are not allowed.`,
        );
      }
      if (Buffer.byteLength(segment, 'utf8') > POSIX_NAME_MAX_BYTES) {
        throw new DomainError(
          `AbsolutePath is invalid: a segment exceeds the allowed ${POSIX_NAME_MAX_BYTES} bytes.`,
        );
      }
    }

    this.value = raw;
    Object.freeze(this);
  }

  /** File name (last segment of the path). */
  get fileName(): string {
    return this.value.slice(this.value.lastIndexOf('/') + 1);
  }

  /** Lowercase extension without the dot; empty string if absent (dotfiles have none). */
  get extension(): string {
    const name = this.fileName;
    const dotIndex = name.lastIndexOf('.');
    return dotIndex <= 0 ? '' : name.slice(dotIndex + 1).toLowerCase();
  }

  /** Directory containing the file ("/" if the file is in the root). */
  get directory(): string {
    const lastSlash = this.value.lastIndexOf('/');
    return lastSlash === 0 ? '/' : this.value.slice(0, lastSlash);
  }

  /** Tells whether the path simply coincides with the given title. */
  coincidesWithTitle(title: string): boolean {
    return this.value === title.trim();
  }

  equals(other: AbsolutePathVo): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
