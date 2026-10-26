import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const backendPreset = createDefaultEsmPreset();
const webPreset = createDefaultEsmPreset({ tsconfig: '<rootDir>/web/tsconfig.json' });

const config: Config = {
  projects: [
    {
      ...backendPreset,
      displayName: 'backend',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
      // Replaces the application variables with fake values before every test file, so the
      // tests never read the real `.env` file nor secrets exported in the developer shell.
      setupFiles: ['<rootDir>/src/testing/setup-env.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      ...webPreset,
      displayName: 'web',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/web/src'],
      testMatch: ['<rootDir>/web/src/**/*.spec.ts', '<rootDir>/web/src/**/*.spec.tsx'],
      setupFilesAfterEnv: ['<rootDir>/web/src/testing/setup-tests.ts'],
    },
  ],
};

export default config;
