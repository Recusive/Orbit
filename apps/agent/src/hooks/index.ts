/**
 * Hooks barrel file
 * Organized by domain for clean imports
 */

// Agent hooks
export * from './agent';

// Browser hooks (in-app webview)
export * from './browser';

// Canvas hooks (from @snowflake/common)
export * from '@snowflake/common/hooks/canvas';

// Chat hooks
export * from './chat';

// Core hooks
export * from './core';

// File hooks
export * from './file';

// Git hooks
export * from './git';

// LSP hooks
export * from './lsp';

// Terminal hooks
export * from './terminal';

// UI hooks
export * from './ui';
