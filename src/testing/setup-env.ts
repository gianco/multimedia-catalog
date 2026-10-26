import { TEST_ENVIRONMENT } from './test-environment.js';

// Jest `setupFiles` entry. It runs before every backend test file and overwrites the four
// application variables, so tests never depend on the real `.env` file or on secrets that
// happen to be exported in the developer's shell.
Object.assign(process.env, TEST_ENVIRONMENT);
