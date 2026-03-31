export default {
  // TypeScript - must match directories in bun run lint command
  'apps/agent/src/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'apps/editor/src/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'apps/common/src/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'agent-bridge/src/**/*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'packages/shared-schemas/src/**/*.{ts,tsx}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],

  // Scripts and plugins
  'scripts/**/*.ts': ['eslint --fix --max-warnings=0', 'prettier --write'],
  'vite-plugins/**/*.ts': ['eslint --fix --max-warnings=0', 'prettier --write'],

  // Root config files
  'vitest.setup.ts': ['eslint --fix --max-warnings=0', 'prettier --write'],

  // Tauri config (JSON only)
  'src-tauri/**/*.json': ['prettier --write'],

  // Other config files
  '*.{json,md,yml,yaml}': ['prettier --write --ignore-unknown'],
};
