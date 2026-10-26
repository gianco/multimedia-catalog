import type { AppConfig } from '../infrastructure/config/env.config.js';
import { loadConfig } from '../infrastructure/config/env.config.js';
import { TEST_ENVIRONMENT } from './test-environment.js';

/** A valid configuration built from the fake test environment, with optional overrides. */
export function buildTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return Object.freeze({ ...loadConfig(TEST_ENVIRONMENT), ...overrides });
}
