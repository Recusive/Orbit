import path from 'path';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import pkg from './package.json';

// Canvas UI Builder vite configuration
// https://vite.dev/config/
export default defineConfig({
  root: './apps/Canvas-UI-Builder',
  // Compile-time constants - MUST match agent config for consistent Sentry releases
  // Without these, getSentryConfig() falls back to '0.0.0' breaking source map resolution
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Sentry source maps upload - only when auth token is available
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: 'recursive-labs',
          project: 'javascript-react',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          // Release name must match frontend init for source map resolution
          release: {
            name: `orbit@${pkg.version}`,
          },
          sourcemaps: {
            // Delete source maps after upload to prevent exposure in production bundle
            filesToDeleteAfterUpload: ['./dist/canvas/**/*.map'],
          },
          // Disable telemetry
          telemetry: false,
        })
      : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      // @/ resolves to agent src (for shared modules like ui-store, tool-store)
      // Canvas-specific imports use @canvas/ prefix
      '@': path.resolve(__dirname, './apps/agent/src'),
      '@canvas': path.resolve(__dirname, './apps/Canvas-UI-Builder/src'),
      '@orbit/common': path.resolve(__dirname, './apps/common/src'),
    },
  },
  build: {
    outDir: '../../dist/canvas',
    cssCodeSplit: false,
    assetsInlineLimit: 1000000, // Inline all assets as base64
    // Hidden sourcemaps - generates them but doesn't reference in bundle
    // Useful for crash reporting services (Sentry) without exposing source
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        entryFileNames: 'canvas.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.some((n) => n.endsWith('.css'))) {
            return 'canvas.css';
          }
          return '[name].[ext]';
        },
        manualChunks: undefined, // Single bundle
        inlineDynamicImports: true, // Inline all dynamic imports
        format: 'iife', // Use IIFE format for VS Code webview
      },
    },
  },
  // Dev server port for canvas
  server: {
    port: 5177,
    strictPort: true,
  },
  clearScreen: false,
});
