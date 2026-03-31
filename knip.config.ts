import type { KnipConfig } from 'knip';

/**
 * Knip configuration for Orbit monorepo
 *
 * Key structural insight: apps/agent and apps/editor
 * are NOT real workspaces (no package.json). They live under the root workspace
 * and share root dependencies. Only apps/common, packages/shared-schemas, and
 * agent-bridge are real Bun workspaces.
 *
 * Strategy:
 * - Root workspace ('.') includes all app source files for dependency tracing
 * - Real workspaces (apps/common, packages/shared-schemas) auto-detected
 * - agent-bridge excluded (separate toolchain with its own knip)
 * - Knip plugins auto-detect vite, vitest, eslint, lint-staged, typescript, etc.
 */
const config: KnipConfig = {
  workspaces: {
    // ── Root workspace ────────────────────────────────────────────────────
    // apps/agent and apps/editor don't have their own
    // package.json, so we include their source files in the root workspace.
    // This lets knip trace their imports against root package.json deps.
    '.': {
      entry: [
        // App entry points (these start the dependency graph)
        'apps/agent/src/main.tsx',
        'apps/editor/src/main.tsx',
      ],
      project: [
        'apps/agent/src/**/*.{ts,tsx}',
        'apps/editor/src/**/*.{ts,tsx}',
        'vite-plugins/**/*.ts',
        'scripts/**/*.ts',
      ],
      // Path aliases — knip needs these to resolve imports across the monorepo.
      // Without this, `@orbit/common` imports appear as "unlisted dependencies".
      paths: {
        '@/*': ['apps/agent/src/*'],
        '@editor/*': ['apps/editor/src/*'],
        '@orbit/common': ['apps/common/src/index.ts'],
        '@orbit/common/*': ['apps/common/src/*'],
      },
    },

    // ── Real workspaces (auto-detected, entry from package.json exports) ──
    // Knip auto-discovers entry points from package.json main/exports fields.
    'apps/common': {},
    'packages/shared-schemas': {},
  },

  // Agent-bridge has its own deps, toolchain, and test runner (Bun)
  ignoreWorkspaces: ['agent-bridge'],

  // ── File exclusions ─────────────────────────────────────────────────────

  ignore: [
    '**/dist/**',
    '**/target/**',
    '**/node_modules/**',
    'reference/**',
    'SDK/**',
    'docs/**',
    'src-tauri/**',
    '**/*.d.ts',
  ],

  // ── Dependency exclusions ───────────────────────────────────────────────
  // Only list deps that are genuinely untraceable by static analysis.
  // If knip can find the import, it should NOT be here.

  ignoreDependencies: [
    // CSS-only deps — consumed via CSS @import/@plugin, not JS imports.
    // Knip cannot trace CSS file imports.
    'tailwindcss',
    'tailwindcss-animate',
    'tw-animate-css',

    // Workspace package resolved via tsconfig paths, not declared in root package.json.
    // Apps import @orbit/common via tsconfig "paths" alias → apps/common/src/index.ts.
    // Knip can't resolve this cross-workspace path alias and flags it as unlisted.
    // TODO: Add "@orbit/common": "workspace:*" to root package.json to fix properly.
    '@orbit/common',
  ],

  // Shell commands/scripts used in npm scripts that aren't npm package binaries
  ignoreBinaries: [
    'open', // macOS `open` command used in scripts
    'scripts/build-claude-cli.mjs', // Custom build script referenced in package.json
  ],
};

export default config;
