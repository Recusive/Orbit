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
export * from './image-cache';

// Search operations
export * from './search';

// Settings operations
export * from './settings';
export * from './icons';

// Window operations
export * from './window';

// Browser operations (embedded Chromium + CDP)
export * from './browser';

// OpenCode backend lifecycle
export * from './opencode';

// Marketplace operations
export * from './marketplace';
