import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*', '**/node_modules/**', '**/.next/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'prefer-const': 'warn',
      'no-var': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];