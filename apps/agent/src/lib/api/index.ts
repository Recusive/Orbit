/**
 * Backend API - Tauri IPC functions
 *
 * This module provides a unified API for all backend operations.
 * All functions use Tauri invoke() for communication with the Rust backend.
 */

// Core utilities (only isTauri is public - invoke/listen are internal)
export { isTauri } from './core';

// File operations
export * from './files';

// LSP operations
export * from './lsp';

// Terminal operations
export * from './terminal';

// Git operations
export * from './git';

// Agent operations
export * from './agent';

// Conversation operations
export * from './conversations';

// AI operations
export * from './ai';

// Search operations
export * from './search';

// Settings operations
export * from './settings';

// Window operations
export * from './window';
