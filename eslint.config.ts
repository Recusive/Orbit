import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import-x';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.mjs', '**/scripts/'],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      react: reactPlugin,
      // @ts-expect-error - Plugin types have legacy config format incompatibility
      'react-hooks': reactHooksPlugin,
      // @ts-expect-error - Plugin types have legacy config format incompatibility
      'import-x': importPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      /* TypeScript strict */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } }, // Allow async onClick
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowNullableBoolean: true, allowNullableString: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      /* React */
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary', 'coerce'] }],
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      /* Imports */
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'import-x/no-duplicates': 'error',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],

      /* General */
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],

      /* No emojis in code (allows keyboard symbols like ⌘, ↵, ⇧) */
      'no-restricted-syntax': [
        'error',
        {
          // Targets actual emojis, excludes keyboard/technical symbols (U+2300-U+23FF, U+2190-U+21FF)
          selector:
            'Literal[value=/[\\u{1F300}-\\u{1F9FF}\\u{1F600}-\\u{1F64F}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2702}\\u{2705}\\u{2708}-\\u{270D}\\u{270F}\\u{2712}\\u{2714}\\u{2716}\\u{271D}\\u{2721}\\u{2728}\\u{2733}-\\u{2734}\\u{2744}\\u{2747}\\u{274C}\\u{274E}\\u{2753}-\\u{2755}\\u{2757}\\u{2763}-\\u{2764}\\u{2795}-\\u{2797}\\u{27A1}\\u{27B0}\\u{27BF}\\u{2B50}\\u{2B55}]/u]',
          message: 'Emojis are not allowed in the codebase. Use descriptive text instead.',
        },
        {
          selector:
            'TemplateElement[value.raw=/[\\u{1F300}-\\u{1F9FF}\\u{1F600}-\\u{1F64F}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2702}\\u{2705}\\u{2708}-\\u{270D}\\u{270F}\\u{2712}\\u{2714}\\u{2716}\\u{271D}\\u{2721}\\u{2728}\\u{2733}-\\u{2734}\\u{2744}\\u{2747}\\u{274C}\\u{274E}\\u{2753}-\\u{2755}\\u{2757}\\u{2763}-\\u{2764}\\u{2795}-\\u{2797}\\u{27A1}\\u{27B0}\\u{27BF}\\u{2B50}\\u{2B55}]/u]',
          message: 'Emojis are not allowed in template literals. Use descriptive text instead.',
        },
      ],
    },
  }
);
