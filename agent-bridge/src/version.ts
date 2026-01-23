/**
 * Bridge version constant for Sentry release tagging.
 *
 * Uses the same "orbit@version" format as frontend/backend for correlation.
 * This file is generated/updated by the build script.
 *
 * @remarks
 * This exists as a separate file to avoid importing package.json outside
 * the TypeScript rootDir, which causes TS6059 errors.
 */
export const BRIDGE_VERSION = '0.0.1';
