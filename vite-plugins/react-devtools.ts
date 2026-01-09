/**
 * Vite plugin to inject React DevTools standalone script for Tauri development.
 *
 * This plugin injects the React DevTools connection script as the FIRST script
 * in the <head> tag, which is critical for React DevTools to properly hook into
 * React before it initializes.
 *
 * The script is only injected when:
 * 1. TAURI_DEBUG environment variable is set (set by `tauri dev` or `tauri build --debug`)
 * 2. Running in development mode (not production builds)
 *
 * Usage:
 * 1. Run `bun run devtools` in one terminal to start React DevTools standalone
 * 2. Run `bun run dev` in another terminal to start the Tauri app
 * 3. The app will automatically connect to React DevTools
 *
 * @see https://github.com/facebook/react/tree/main/packages/react-devtools
 */

import type { Plugin, HtmlTagDescriptor } from 'vite';

const DEVTOOLS_PORT = 8097;

interface ReactDevToolsPluginOptions {
  /**
   * Port for React DevTools WebSocket server.
   * @default 8097
   */
  port?: number;
}

export function reactDevToolsPlugin(options: ReactDevToolsPluginOptions = {}): Plugin {
  const port = options.port ?? DEVTOOLS_PORT;

  // Helper to check env var at runtime (not at plugin creation time)
  const isTauriDebug = (): boolean => !!process.env.TAURI_DEBUG;

  return {
    name: 'vite-plugin-react-devtools',
    apply: 'serve', // Only apply during development

    transformIndexHtml(html) {
      // Check at transform time - Tauri may set TAURI_DEBUG after Vite starts
      if (!isTauriDebug()) {
        return html;
      }

      const tags: HtmlTagDescriptor[] = [
        {
          tag: 'script',
          attrs: {
            src: `http://localhost:${String(port)}`,
          },
          // 'head-prepend' ensures this is the FIRST script in <head>
          // This is critical for React DevTools to work properly
          injectTo: 'head-prepend',
        },
      ];

      return {
        html,
        tags,
      };
    },

    configResolved(config) {
      if (isTauriDebug() && config.command === 'serve') {
        // Use console.warn for dev-time info messages (console.log is disallowed by lint rules)
        console.warn('\n[React DevTools] Plugin enabled');
        console.warn(`[React DevTools] Connecting to ws://localhost:${String(port)}`);
        console.warn('[React DevTools] Run "bun run devtools" to start the DevTools UI\n');
      }
    },
  };
}
