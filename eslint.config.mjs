import js from '@eslint/js';
import globals from 'globals';

export default [
  // TS lint arrives with the dashboard task, so .ts/.tsx files are ignored for now.
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**', '**/*.ts', '**/*.tsx'] },
  js.configs.recommended,
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
];
