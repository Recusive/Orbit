/// <reference types="vite/client" />

// Pierre themes are not exported via package.json `exports` but are valid
// ES modules in dist/. Vite resolves them at bundle time.
declare module '@pierre/diffs/dist/themes/pierre-dark.js' {
  import type { ThemeRegistration } from 'shiki';
  const theme: ThemeRegistration;
  export default theme;
}
declare module '@pierre/diffs/dist/themes/pierre-light.js' {
  import type { ThemeRegistration } from 'shiki';
  const theme: ThemeRegistration;
  export default theme;
}

/**
 * Compile-time constants injected by Vite via `define` in vite.config.ts.
 * These enable dead code elimination in production builds.
 */

/** True in development, false in production. Use for dev-only logging, checks, etc. */
declare const __DEV__: boolean;

/** App version from package.json. Useful for crash reporting and "About" dialogs. */
declare const __APP_VERSION__: string;
