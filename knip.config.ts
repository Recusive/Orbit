import type { KnipConfig } from 'knip';

/**
 * Knip configuration for Orbit monorepo
 *
 * This monorepo has a unique structure:
 * - Root package.json contains ALL dependencies (not per-workspace)
 * - apps/agent and apps/Canvas-UI-Builder use root deps via imports
 * - agent-bridge has its own package.json with separate deps
 * - packages/shared-schemas exports types for IPC
 *
 * We use workspace config but with root dependencies tracked at root level.
 */
const config: KnipConfig = {
  workspaces: {
    // Root workspace - tracks all shared dependencies
    '.': {
      project: ['*.ts', '*.js'],
      ignore: ['dist/**', 'target/**', 'src-tauri/**'],
    },

    // Main agent app
    'apps/agent': {
      entry: ['src/main.tsx', 'src/vite-env.d.ts'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    },

    // Canvas UI Builder app (embedded in agent)
    'apps/Canvas-UI-Builder': {
      entry: ['src/main.tsx', 'src/CanvasApp.tsx'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    },

    // Editor app (stub)
    'apps/editor': {
      entry: ['src/main.tsx'],
      project: ['src/**/*.{ts,tsx}'],
    },

    // Common shared utilities
    'apps/common': {
      project: ['src/**/*.ts'],
    },

    // Shared schemas package
    'packages/shared-schemas': {
      // Note: src/index.ts is auto-detected by knip
      // All module barrel exports are entry points (used by apps via @orbit/shared-schemas)
      entry: [
        'src/agent/index.ts',
        'src/common/index.ts',
        'src/file/index.ts',
        'src/sdk/index.ts',
        'src/settings/index.ts',
        'src/terminal/index.ts',
      ],
      project: ['src/**/*.ts'],
    },
  },

  // Global ignore patterns
  ignore: [
    '**/dist/**',
    '**/target/**',
    '**/node_modules/**',
    'src-tauri/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/__tests__/**',
    '**/*.d.ts',
    'lint-staged.config.js',
  ],

  // Dependencies that are used but knip can't trace
  // (root deps used by app workspaces, dynamic imports, etc.)
  ignoreDependencies: [
    // === Root package.json dependencies used by apps ===
    // These are in root package.json but imported by apps/agent and apps/Canvas-UI-Builder

    // React ecosystem
    'react',
    'react-dom',

    // Tauri APIs (used via @tauri-apps/* imports)
    '@tauri-apps/api',
    '@tauri-apps/plugin-clipboard-manager',
    '@tauri-apps/plugin-dialog',
    '@tauri-apps/plugin-fs',
    '@tauri-apps/plugin-shell',

    // UI components (Radix)
    '@radix-ui/react-collapsible',
    '@radix-ui/react-context-menu',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-hover-card',
    '@radix-ui/react-icons',
    '@radix-ui/react-popover',
    '@radix-ui/react-scroll-area',
    '@radix-ui/react-select',
    '@radix-ui/react-separator',
    '@radix-ui/react-slot',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-tooltip',

    // CodeMirror (editor)
    '@codemirror/autocomplete',
    '@codemirror/commands',
    '@codemirror/lang-css',
    '@codemirror/lang-go',
    '@codemirror/lang-html',
    '@codemirror/lang-javascript',
    '@codemirror/lang-json',
    '@codemirror/lang-markdown',
    '@codemirror/lang-python',
    '@codemirror/lang-rust',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/theme-one-dark',
    '@codemirror/view',
    '@lezer/highlight',
    'codemirror',

    // Terminal
    '@xterm/addon-fit',
    '@xterm/addon-search',
    '@xterm/addon-web-links',
    '@xterm/xterm',

    // Canvas/ReactFlow
    '@xyflow/react',
    '@codesandbox/sandpack-client',
    '@codesandbox/sandpack-react',

    // Babel (AST parsing for code transforms)
    '@babel/generator',
    '@babel/parser',
    '@babel/traverse',
    '@babel/types',

    // Icons
    '@central-icons-react/all',
    '@central-icons-react/round-outlined-radius-1-stroke-2',
    '@lucide/lab',
    'lucide-react',
    'react-icons',

    // UI utilities
    'class-variance-authority',
    'clsx',
    'cmdk',
    'tailwind-merge',
    'framer-motion',
    '@tanstack/react-virtual',
    'react-resizable-panels',
    'sonner',
    'next-themes',

    // Markdown/content rendering
    'react-markdown',
    'rehype-highlight',
    'remark-gfm',
    'streamdown',
    'mermaid',
    'dompurify',
    'shiki',

    // State management
    'zustand',
    'immer',
    'zod',

    // Workspace deps
    '@orbit/shared-schemas',

    // === Build tools and plugins (not imported, used by bundler) ===
    'tailwindcss',
    'tailwindcss-animate',
    'tw-animate-css',

    // === Dev dependencies ===
    '@types/react',
    '@types/react-dom',
    '@types/babel__generator',
    '@types/babel__traverse',
  ],

  // Binaries used in scripts
  ignoreBinaries: ['open', 'scripts/build-claude-cli.mjs'],

  // Don't check these workspaces (they're standalone or have separate checks)
  ignoreWorkspaces: ['agent-bridge'],
};

export default config;
