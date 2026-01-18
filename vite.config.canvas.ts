import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Canvas UI Builder vite configuration
// https://vite.dev/config/
export default defineConfig({
  root: './apps/Canvas-UI-Builder',
  plugins: [react(), tailwindcss()],
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
  // Define globals for production
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  // Dev server port for canvas
  server: {
    port: 5177,
    strictPort: true,
  },
  clearScreen: false,
});
