import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  root: './apps/agent',
  plugins: [
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
    },
  },
  build: {
    outDir: '../../dist',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Split heavy diagram libraries into separate chunks (loaded on demand by streamdown)
        manualChunks: (id) => {
          // Mermaid and its dependencies (~900KB total)
          if (id.includes('node_modules/mermaid') || id.includes('node_modules/dagre-d3')) {
            return 'mermaid';
          }
          // Cytoscape (~442KB)
          if (id.includes('node_modules/cytoscape')) {
            return 'cytoscape';
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
      'codemirror',
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
