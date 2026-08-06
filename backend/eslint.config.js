import globals from 'globals';
import tseslint from 'typescript-eslint';
import localPlugin from './eslint-local-rules/country-literal-ban.mjs';

export default [
  { ignores: ['dist/**', 'src/packs/**', 'src/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'eslint-local-rules/**', 'eslint.config.js'] },
  ...tseslint.configs.recommended,
  {
    plugins: { local: localPlugin },
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'local/country-literal-ban': 'error',
    },
  },
];
