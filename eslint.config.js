import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `dist/` also matches `web/dist/`: build output is generated code and must not be linted.
  { ignores: ['node_modules/', 'dist/', 'web/dist/', 'coverage/'] },
  tseslint.configs.recommended,
  eslintConfigPrettier,
);
