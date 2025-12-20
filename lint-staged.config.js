export default {
  // TypeScript
  '*.{ts,tsx}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],

  // Tauri config (JSON only)
  'src-tauri/**/*.json': [
    'prettier --write',
  ],

  // Other config files
  '*.{json,md,yml,yaml}': [
    'prettier --write --ignore-unknown',
  ],
};
