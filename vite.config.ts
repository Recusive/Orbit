import path from 'path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import type { Plugin } from 'vite'

// Plugin to exclude KaTeX CSS (causes CSP font-src issues in VS Code webviews)
function excludeKatexCss(): Plugin {
  return {
    name: 'exclude-katex-css',
    transform(code, id) {
      // Replace katex CSS imports with empty string
      if (id.includes('katex') && id.endsWith('.css')) {
        return { code: '', map: null }
      }
      return null
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [excludeKatexCss(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Exclude KaTeX entirely - causes CSP font-src issues in VS Code webviews
      'katex/dist/katex.min.css': path.resolve(__dirname, './src/empty.css'),
      'katex': path.resolve(__dirname, './src/empty-katex.ts'),
    },
  },
  build: {
    outDir: 'dist/webview',
    cssCodeSplit: false,
    assetsInlineLimit: 1000000, // Inline all assets including fonts as base64
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.some((n) => n.endsWith('.css'))) {
            return 'index.css';
          }
          return '[name].[ext]';
        },
        manualChunks: undefined, // Single bundle
        inlineDynamicImports: true, // Inline all dynamic imports
        format: 'iife', // Use IIFE format to avoid ES module exports
      },
    },
  },
  // Optimize dependencies to ensure proper bundling
  optimizeDeps: {
    include: ['streamdown', 'shiki', 'mermaid', 'monaco-editor'],
  },
  // Define globals
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
