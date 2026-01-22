import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest Configuration for Orbit Frontend
 *
 * This configuration supports testing across all frontend apps:
 * - apps/agent (main AI chat interface)
 * - apps/Canvas-UI-Builder (visual component builder)
 * - apps/editor (code editor - stub)
 * - apps/common (shared utilities)
 *
 * Run tests:
 *   bun run test              # Run all tests once
 *   bun run test:watch        # Watch mode
 *   bun run test:ui           # Vitest UI
 *   bun run test:coverage     # With coverage report
 */
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],

  test: {
    // =========================================================================
    // Environment
    // =========================================================================

    // Use jsdom for browser API simulation (DOM, localStorage, etc.)
    environment: 'jsdom',

    // Global test APIs (describe, it, expect) - no imports needed
    globals: true,

    // Setup file runs before each test file
    setupFiles: ['./vitest.setup.ts'],

    // =========================================================================
    // File Patterns
    // =========================================================================

    // Include test files from all frontend apps
    include: [
      'apps/agent/src/**/*.{test,spec}.{ts,tsx}',
      'apps/Canvas-UI-Builder/src/**/*.{test,spec}.{ts,tsx}',
      'apps/editor/src/**/*.{test,spec}.{ts,tsx}',
      'apps/common/src/**/*.{test,spec}.{ts,tsx}',
    ],

    // Exclude node_modules, dist, and reference folders
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/reference/**',
      '**/agent-bridge/**', // Uses Bun test runner
    ],

    // =========================================================================
    // Coverage
    // =========================================================================

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',

      // Include source files from all apps
      include: [
        'apps/agent/src/**/*.{ts,tsx}',
        'apps/Canvas-UI-Builder/src/**/*.{ts,tsx}',
        'apps/editor/src/**/*.{ts,tsx}',
        'apps/common/src/**/*.{ts,tsx}',
      ],

      // Exclude test files, type definitions, and barrel exports
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/index.ts', // Barrel exports
        '**/main.tsx', // Entry points
        '**/__tests__/**',
        '**/testing/**', // Test utilities
      ],
    },

    // =========================================================================
    // Performance
    // =========================================================================

    // Run tests in parallel (per-file isolation)
    pool: 'threads',

    // Timeout for individual tests (ms)
    testTimeout: 10000,

    // Timeout for hooks (beforeAll, afterAll, etc.)
    hookTimeout: 10000,

    // =========================================================================
    // Reporter
    // =========================================================================

    reporters: ['default'],

    // Show summary at end
    outputFile: {
      json: './test-results.json',
    },
  },

  // ===========================================================================
  // Path Aliases (must match tsconfig.json and vite.config.ts)
  // ===========================================================================

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/agent/src'),
      '@canvas': path.resolve(__dirname, './apps/Canvas-UI-Builder/src'),
      '@editor': path.resolve(__dirname, './apps/editor/src'),
      '@orbit/common': path.resolve(__dirname, './apps/common/src'),
    },
  },
});
