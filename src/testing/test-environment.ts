/**
 * Fake environment shared by every backend test.
 * It contains no real secret: even by mistake, a test can never use a real API key.
 */
export const TEST_ENVIRONMENT = Object.freeze({
  PORT: '0',
  DATABASE_FILE: ':memory:',
  ANTHROPIC_API_KEY: 'test-anthropic-api-key',
  CLAUDE_MODEL: 'test-claude-model',
  MUSICBRAINZ_CONTACT: 'test@example.com',
});
