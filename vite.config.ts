import path from 'path';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

import pkg from './package.json';
import { reactDevToolsPlugin } from './vite-plugins/react-devtools';

// https://vite.dev/config/
export default defineConfig({
  root: './apps/agent',
  // Compile-time constants - enables dead code elimination
  // Note: npm_package_version isn't set by Bun, so we read from package.json directly
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Milkdown Crepe uses Vue internally for its UI widgets (toolbar, slash menu, etc.)
    __VUE_OPTIONS_API__: JSON.stringify(false),
    __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
  },
  plugins: [
    // React DevTools must be FIRST to inject script before React initializes
    reactDevToolsPlugin(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    tailwindcss(),
    // Bundle analyzer - generates stats.html after build
    visualizer({
      filename: path.resolve(__dirname, 'dist/stats.html'),
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    // Sentry source maps upload - only in production builds
    // Only enable when SENTRY_AUTH_TOKEN is set to avoid local build failures
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: 'recursive-labs',
            project: 'javascript-react',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // Release must match the frontend SDK's release name exactly
            // Otherwise source maps won't resolve to the correct release
            release: {
              name: `orbit@${pkg.version}`,
            },
            sourcemaps: {
              // Delete source maps after upload to prevent exposure in production bundle
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            // Disable telemetry
            telemetry: false,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/agent/src'),
      '@canvas': path.resolve(__dirname, './apps/Canvas-UI-Builder/src'),
      '@editor': path.resolve(__dirname, './apps/editor/src'),
      '@orbit.build/sdk/v2/client': path.resolve(
        __dirname,
        './packages/orbit-sdk/src/v2/client.js'
      ),
      '@orbit.build/sdk/v2': path.resolve(__dirname, './packages/orbit-sdk/src/v2/index.js'),
      '@orbit.build/sdk': path.resolve(__dirname, './packages/orbit-sdk/src/v2/index.js'),
      '@orbit/common': path.resolve(__dirname, './apps/common/src'),
      // Pierre's package.json exports don't include internal theme files.
      // Alias bypasses the exports check so we can extend pierre-dark/light
      // with custom sidebar-matched backgrounds in pierre-adapter.ts.
      '@pierre/diffs/dist/themes': path.resolve(
        __dirname,
        'node_modules/@pierre/diffs/dist/themes'
      ),
    },
  },
  // Keep function/class names in production for readable stack traces and profiling
  esbuild: {
    keepNames: true,
  },
  build: {
    // Tauri uses modern WebViews (WebKit/WebView2) that support latest JS features.
    // No need to transpile to older ES versions - results in smaller, faster code.
    target: 'esnext',
    outDir: '../../dist',
    // Clean output directory on each build (prevents stale files)
    emptyOutDir: true,
    // Hidden sourcemaps - generates them but doesn't reference in bundle
    // Useful for crash reporting services (Sentry) without exposing source
    sourcemap: 'hidden',
    // Skip module preload polyfill - Tauri WebViews are always modern
    modulePreload: { polyfill: false },
    // Skip compressed size calc - visualizer plugin already does this
    reportCompressedSize: false,
    cssCodeSplit: false,
    // Tauri apps load from disk, not network - larger chunks are acceptable.
    // Combined vendor chunks can be several MB (shiki ~300KB, mermaid ~900KB, codemirror ~500KB).
    // Using 10MB limit to suppress warnings for desktop app bundles.
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        // Split heavy dependencies into separate lazy-loaded chunks
        manualChunks: (id) => {
          // Mermaid and its dependencies (~900KB total)
          if (id.includes('node_modules/mermaid') || id.includes('node_modules/dagre')) {
            return 'vendor-mermaid';
          }
          // CodeMirror - all packages must stay together (~500KB)
          if (
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/codemirror') ||
            id.includes('node_modules/@lezer')
          ) {
            return 'vendor-codemirror';
          }
          // Lexical editor framework
          if (id.includes('node_modules/lexical') || id.includes('node_modules/@lexical')) {
            return 'vendor-lexical';
          }
          // xterm terminal emulator (~200KB)
          if (id.includes('node_modules/@xterm') || id.includes('node_modules/xterm')) {
            return 'vendor-xterm';
          }
          // Shiki syntax highlighter (~300KB with languages)
          if (id.includes('node_modules/shiki') || id.includes('node_modules/@shikijs')) {
            return 'vendor-shiki';
          }
          // Framer Motion animations (~100KB)
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          // Radix UI components (~150KB combined)
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          // Markdown processing
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/remark-gfm') ||
            id.includes('node_modules/remark-parse') ||
            id.includes('node_modules/rehype') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/hast')
          ) {
            return 'vendor-markdown';
          }
          // Streamdown (uses shiki internally)
          if (id.includes('node_modules/streamdown')) {
            return 'vendor-streamdown';
          }
          // Pierre diffs — bundles Shiki internally for syntax highlighting (~200KB)
          if (
            id.includes('node_modules/@pierre/diffs') ||
            id.includes('node_modules/@pierre/precision-diffs')
          ) {
            return 'vendor-pierre-diffs';
          }
          // All other node_modules will be bundled together into the main vendor chunk
          // by Vite's default behavior. Only split out packages that are >100KB or
          // used lazily to benefit from code splitting.
          return undefined;
        },
      },
    },
  },
  // Optimize dependencies - pre-bundle to avoid duplicate instances
  optimizeDeps: {
    // Force re-optimization on every dev server start to avoid stale cache issues
    // This adds ~2s to startup but prevents "504 Outdated Optimize Dep" errors
    force: true,
    include: [
      'streamdown',
      'shiki',
      // lucide-react has 1,500+ icons - pre-bundling speeds up dev server imports
      'lucide-react',
      // CodeMirror packages must be bundled together to avoid duplicate @codemirror/state instances
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
      '@codemirror/view',
      '@lezer/highlight',
      // Lexical chat input editor packages
      // NOTE: @lexical/react has no root "." export — must list deep imports individually.
      'lexical',
      '@lexical/react/LexicalComposer',
      '@lexical/react/LexicalComposerContext',
      '@lexical/react/LexicalContentEditable',
      '@lexical/react/LexicalErrorBoundary',
      '@lexical/react/LexicalHistoryPlugin',
      '@lexical/react/LexicalPlainTextPlugin',
      '@lexical/plain-text',
      '@lexical/history',
      '@lexical/selection',
      // xterm packages must be pre-bundled to prevent runtime discovery that triggers
      // 504 "Outdated Optimize Dep" errors — especially in Tauri's WKWebView which
      // doesn't handle Vite's full-reload recovery as well as a regular browser.
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-search',
      '@xterm/addon-web-links',
      // Pierre diffs — pre-bundle to prevent stale cache in dev
      '@pierre/diffs',
      '@pierre/diffs/react',
      '@pierre/precision-diffs',
      // Milkdown Crepe — lazy-loaded by VaultCrepeEditor, must be pre-bundled to prevent
      // runtime discovery triggering 504 "Outdated Optimize Dep" in Tauri's WKWebView.
      '@milkdown/crepe',
    ],
  },
  // Tauri expects a fixed port
  server: {
    port: 5176,
    strictPort: true,
  },
  // Clear screen on start
  clearScreen: false,
});
