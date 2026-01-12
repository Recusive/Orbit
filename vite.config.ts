import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

import { reactDevToolsPlugin } from './vite-plugins/react-devtools';

// https://vite.dev/config/
export default defineConfig({
  root: './apps/agent',
  // Compile-time constants - enables dead code elimination
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
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
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/agent/src'),
      '@canvas': path.resolve(__dirname, './apps/canvas/src'),
      '@orbit/common': path.resolve(__dirname, './apps/common/src'),
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
    chunkSizeWarningLimit: 500, // Warn on chunks > 500KB
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
          // Return undefined for default chunking behavior
          return undefined;
        },
      },
    },
  },
  // Optimize dependencies - pre-bundle to avoid duplicate instances
  optimizeDeps: {
    include: [
      'streamdown',
      'shiki',
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
