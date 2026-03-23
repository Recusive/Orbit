/// <reference types="vite/client" />

/**
 * Compile-time constants injected by Vite via `define` in vite.config.ts.
 * These enable dead code elimination in production builds.
 */

/** True in development, false in production. Use for dev-only logging, checks, etc. */
declare const __DEV__: boolean;

/** App version from package.json. Useful for crash reporting and "About" dialogs. */
declare const __APP_VERSION__: string;
