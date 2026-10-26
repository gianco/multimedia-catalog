/** Port used when `PORT` is not provided. */
export const DEFAULT_PORT = 3000;

/** Value shipped in `.env.example`: it is a valid string, but not a usable API key. */
export const API_KEY_PLACEHOLDER = 'your_anthropic_api_key_here';

/** Used when `MUSICBRAINZ_CONTACT` is unset. Only prevents a crash: set a real email in `.env`. */
export const MUSICBRAINZ_CONTACT_FALLBACK = 'catalog@example.invalid';

const MAX_PORT = 65535;

/** Strongly-typed, read-only configuration of the whole application. */
export interface AppConfig {
  /** TCP port the HTTP server listens on (`PORT`). */
  readonly port: number;
  /** Path of the SQLite database file (`DATABASE_FILE`). */
  readonly databaseFile: string;
  /** Anthropic API key (`ANTHROPIC_API_KEY`). It is a secret: never log or return it. */
  readonly anthropicApiKey: string;
  /** Identifier of the Claude model used for data enrichment (`CLAUDE_MODEL`). */
  readonly claudeModel: string;
  /** Contact email identifying this app to MusicBrainz (`MUSICBRAINZ_CONTACT`). */
  readonly musicbrainzContact: string;
}

/** Anything shaped like `process.env`; tests pass plain objects instead. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** Raised at startup when the environment is incomplete or malformed. */
export class EnvConfigError extends Error {
  /** One entry per problem found, so that everything can be fixed in a single pass. */
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const details = issues.map((issue) => `  - ${issue}`).join('\n');
    super(
      `Invalid environment configuration:\n${details}\n` +
        'Copy .env.example to .env and fill in the values, or export the variables in your shell.',
    );
    this.name = new.target.name;
    this.issues = issues;
  }
}

/** Trimmed value of a variable, or `undefined` when it is missing or blank. */
function readText(environment: EnvironmentSource, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function readRequired(
  environment: EnvironmentSource,
  name: string,
  issues: string[],
): string | undefined {
  const value = readText(environment, name);
  if (value === undefined) {
    issues.push(`${name} is required but it is missing or empty.`);
  }
  return value;
}

function readPort(environment: EnvironmentSource, issues: string[]): number {
  const raw = readText(environment, 'PORT');
  if (raw === undefined) {
    return DEFAULT_PORT;
  }
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port > MAX_PORT) {
    issues.push(`PORT must be an integer between 0 and ${MAX_PORT} (received "${raw}").`);
    return DEFAULT_PORT;
  }
  return port;
}

function readContact(environment: EnvironmentSource, issues: string[]): string {
  const raw = readText(environment, 'MUSICBRAINZ_CONTACT');
  if (raw === undefined) {
    return MUSICBRAINZ_CONTACT_FALLBACK;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    issues.push('MUSICBRAINZ_CONTACT must be an email address.');
    return MUSICBRAINZ_CONTACT_FALLBACK;
  }
  return raw;
}

/**
 * Reads and validates the configuration from the environment (`process.env` by default).
 *
 * It is a pure function of its input, so tests can pass their own values and never depend on a
 * real `.env` file. Every problem is collected and reported together; error messages never
 * contain the API key.
 *
 * @throws EnvConfigError when a required variable is missing or any value is invalid
 */
export function loadConfig(environment: EnvironmentSource = process.env): AppConfig {
  const issues: string[] = [];

  const port = readPort(environment, issues);
  const databaseFile = readRequired(environment, 'DATABASE_FILE', issues);
  const anthropicApiKey = readRequired(environment, 'ANTHROPIC_API_KEY', issues);
  const claudeModel = readRequired(environment, 'CLAUDE_MODEL', issues);
  const musicbrainzContact = readContact(environment, issues);

  if (claudeModel !== undefined && /\s/.test(claudeModel)) {
    issues.push('CLAUDE_MODEL must not contain whitespace.');
  }

  if (
    issues.length > 0 ||
    databaseFile === undefined ||
    anthropicApiKey === undefined ||
    claudeModel === undefined
  ) {
    throw new EnvConfigError(issues);
  }

  return Object.freeze({ port, databaseFile, anthropicApiKey, claudeModel, musicbrainzContact });
}

/** `true` while the key is still the placeholder copied from `.env.example`. */
export function isPlaceholderApiKey(apiKey: string): boolean {
  return apiKey.trim() === API_KEY_PLACEHOLDER;
}
