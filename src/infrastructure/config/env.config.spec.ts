import { describe, expect, it } from '@jest/globals';
import { TEST_ENVIRONMENT } from '../../testing/test-environment.js';
import {
  API_KEY_PLACEHOLDER,
  DEFAULT_PORT,
  EnvConfigError,
  MUSICBRAINZ_CONTACT_FALLBACK,
  isPlaceholderApiKey,
  loadConfig,
} from './env.config.js';

const validEnvironment = {
  PORT: '8080',
  DATABASE_FILE: 'data/catalog.db',
  ANTHROPIC_API_KEY: 'sk-ant-secret-value',
  CLAUDE_MODEL: 'claude-sonnet-5-5',
};

const withoutKey = (name: keyof typeof validEnvironment): Record<string, string> =>
  Object.fromEntries(Object.entries(validEnvironment).filter(([key]) => key !== name));

const REQUIRED = ['DATABASE_FILE', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL'] as const;

describe('loadConfig', () => {
  describe('valid environment', () => {
    it('returns a typed configuration with the port parsed as a number', () => {
      const config = loadConfig(validEnvironment);

      expect(config).toEqual({
        port: 8080,
        databaseFile: 'data/catalog.db',
        anthropicApiKey: 'sk-ant-secret-value',
        claudeModel: 'claude-sonnet-5-5',
        musicbrainzContact: MUSICBRAINZ_CONTACT_FALLBACK,
      });
      expect(typeof config.port).toBe('number');
    });

    it('returns a read-only object', () => {
      const config = loadConfig(validEnvironment);

      expect(Object.isFrozen(config)).toBe(true);
      expect(() => {
        (config as { port: number }).port = 1;
      }).toThrow(TypeError);
      expect(config.port).toBe(8080);
    });

    it('trims the surrounding whitespace of every value', () => {
      const config = loadConfig({
        PORT: ' 8080 ',
        DATABASE_FILE: '  catalog.db ',
        ANTHROPIC_API_KEY: ' key ',
        CLAUDE_MODEL: ' model ',
        MUSICBRAINZ_CONTACT: ' me@example.com ',
      });

      expect(config).toEqual({
        port: 8080,
        databaseFile: 'catalog.db',
        anthropicApiKey: 'key',
        claudeModel: 'model',
        musicbrainzContact: 'me@example.com',
      });
    });

    it('does not modify the environment it reads from', () => {
      const environment = { ...validEnvironment };

      loadConfig(environment);

      expect(environment).toEqual(validEnvironment);
    });
  });

  describe('PORT', () => {
    it('defaults to 3000 when it is missing or blank', () => {
      expect(loadConfig(withoutKey('PORT')).port).toBe(DEFAULT_PORT);
      expect(loadConfig({ ...validEnvironment, PORT: '   ' }).port).toBe(3000);
      expect(DEFAULT_PORT).toBe(3000);
    });

    it.each([
      ['0', 0],
      ['1', 1],
      ['65535', 65535],
    ])('accepts the boundary value %s', (raw, port) => {
      expect(loadConfig({ ...validEnvironment, PORT: raw }).port).toBe(port);
    });

    it.each(['abc', '-1', '65536', '3000.5', '1e3', '0x10', '+80', '99999999'])(
      'rejects the invalid value %p',
      (raw) => {
        const attempt = (): unknown => loadConfig({ ...validEnvironment, PORT: raw });

        expect(attempt).toThrow(EnvConfigError);
        expect(attempt).toThrow(/PORT must be an integer between 0 and 65535/);
      },
    );
  });

  describe('required variables', () => {
    it.each(REQUIRED)('fails when %s is missing', (name) => {
      const attempt = (): unknown => loadConfig(withoutKey(name));

      expect(attempt).toThrow(EnvConfigError);
      expect(attempt).toThrow(`${name} is required`);
    });

    it.each(REQUIRED)('fails when %s is empty or blank', (name) => {
      expect(() => loadConfig({ ...validEnvironment, [name]: '' })).toThrow(`${name} is required`);
      expect(() => loadConfig({ ...validEnvironment, [name]: '   ' })).toThrow(
        `${name} is required`,
      );
    });

    it('fails when the environment is completely empty', () => {
      expect(() => loadConfig({})).toThrow(EnvConfigError);
    });

    it('rejects a model name containing whitespace', () => {
      expect(() => loadConfig({ ...validEnvironment, CLAUDE_MODEL: 'claude sonnet' })).toThrow(
        /CLAUDE_MODEL must not contain whitespace/,
      );
    });
  });

  describe('MUSICBRAINZ_CONTACT', () => {
    it('is optional and falls back to a placeholder address', () => {
      expect(loadConfig(validEnvironment).musicbrainzContact).toBe(MUSICBRAINZ_CONTACT_FALLBACK);
      expect(
        loadConfig({ ...validEnvironment, MUSICBRAINZ_CONTACT: '  ' }).musicbrainzContact,
      ).toBe(MUSICBRAINZ_CONTACT_FALLBACK);
    });

    it('is read from the environment when it is an email address', () => {
      const config = loadConfig({ ...validEnvironment, MUSICBRAINZ_CONTACT: 'me@example.com' });

      expect(config.musicbrainzContact).toBe('me@example.com');
    });

    it.each(['not-an-email', 'a@b', '@example.com', 'a b@example.com'])(
      'rejects the invalid value %p',
      (raw) => {
        expect(() => loadConfig({ ...validEnvironment, MUSICBRAINZ_CONTACT: raw })).toThrow(
          /MUSICBRAINZ_CONTACT must be an email address/,
        );
      },
    );
  });

  describe('error reporting', () => {
    it('reports every problem at once, so they can be fixed in a single pass', () => {
      let error: unknown;
      try {
        loadConfig({ PORT: 'oops' });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(EnvConfigError);
      const { issues, message } = error as EnvConfigError;
      expect(issues).toHaveLength(4);
      expect(message).toContain('PORT must be an integer');
      expect(message).toContain('DATABASE_FILE is required');
      expect(message).toContain('ANTHROPIC_API_KEY is required');
      expect(message).toContain('CLAUDE_MODEL is required');
    });

    it('explains how to fix the problem', () => {
      expect(() => loadConfig({})).toThrow(/Copy \.env\.example to \.env/);
    });

    it('is a named Error subclass', () => {
      const error = new EnvConfigError(['something is wrong']);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EnvConfigError');
      expect(error.issues).toEqual(['something is wrong']);
    });

    it('never leaks the API key in the error message', () => {
      const secret = 'sk-ant-super-secret';

      let message = '';
      try {
        loadConfig({ ANTHROPIC_API_KEY: secret, PORT: 'oops' });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).not.toBe('');
      expect(message).not.toContain(secret);
    });
  });

  describe('default source', () => {
    it('reads process.env, which the Jest setup replaces with a fake environment', () => {
      expect(loadConfig()).toEqual({
        port: 0,
        databaseFile: ':memory:',
        anthropicApiKey: 'test-anthropic-api-key',
        claudeModel: 'test-claude-model',
        musicbrainzContact: 'test@example.com',
      });
    });

    it('uses the same fake values exposed by TEST_ENVIRONMENT', () => {
      expect(loadConfig(TEST_ENVIRONMENT).anthropicApiKey).toBe(TEST_ENVIRONMENT.ANTHROPIC_API_KEY);
    });
  });

  describe('isPlaceholderApiKey', () => {
    it('recognizes the value copied from .env.example', () => {
      expect(isPlaceholderApiKey(API_KEY_PLACEHOLDER)).toBe(true);
      expect(isPlaceholderApiKey(`  ${API_KEY_PLACEHOLDER} `)).toBe(true);
    });

    it('accepts any other value as a real key', () => {
      expect(isPlaceholderApiKey('sk-ant-real')).toBe(false);
    });
  });
});
