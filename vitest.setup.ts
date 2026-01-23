/**
 * Vitest Global Setup
 *
 * This file runs before each test file and sets up:
 * - Browser API mocks (localStorage, matchMedia, ResizeObserver, etc.)
 * - Tauri API mocks (@tauri-apps/api)
 * - React testing utilities
 * - Global test helpers
 *
 * For Tauri-specific mocks, see: apps/common/src/testing/tauri-mocks.ts
 */

import '@testing-library/jest-dom/vitest';

import React from 'react';
import { afterEach, beforeAll, vi } from 'vitest';

// =============================================================================
// Browser API Mocks
// =============================================================================

/**
 * LocalStorage Mock
 *
 * In-memory implementation of localStorage for testing.
 * Automatically cleared between tests via afterEach.
 */
const createLocalStorageMock = (): Storage => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string): void => {
      Reflect.deleteProperty(store, key);
    }),
    clear: vi.fn((): void => {
      store = {};
    }),
    key: vi.fn((index: number): string | null => Object.keys(store)[index] ?? null),
    get length(): number {
      return Object.keys(store).length;
    },
  };
};

/**
 * SessionStorage Mock
 *
 * Same implementation as localStorage, separate instance.
 */
const createSessionStorageMock = (): Storage => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string): void => {
      Reflect.deleteProperty(store, key);
    }),
    clear: vi.fn((): void => {
      store = {};
    }),
    key: vi.fn((index: number): string | null => Object.keys(store)[index] ?? null),
    get length(): number {
      return Object.keys(store).length;
    },
  };
};

// Create mock instances
const localStorageMock = createLocalStorageMock();
const sessionStorageMock = createSessionStorageMock();

// Assign to globalThis
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

/**
 * matchMedia Mock
 *
 * Used by theme detection, responsive components, and motion preferences.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated but still used
    removeListener: vi.fn(), // Deprecated but still used
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * ResizeObserver Mock
 *
 * Used by allotment, CodeMirror, xterm, and many UI components.
 */
class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Immediately call with empty entries to simulate initial observation
    this.callback([], this);
  }

  unobserve(): void {
    // No-op
  }

  disconnect(): void {
    // No-op
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true,
});

/**
 * IntersectionObserver Mock
 *
 * Used by lazy loading components and virtualized lists.
 */
class IntersectionObserverMock {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];

  constructor() {
    // No-op constructor
  }

  observe(): void {
    // No-op
  }

  unobserve(): void {
    // No-op
  }

  disconnect(): void {
    // No-op
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: IntersectionObserverMock,
  writable: true,
});

/**
 * MutationObserver Mock
 *
 * Used by theme syncing and DOM change detection.
 */
class MutationObserverMock {
  constructor() {
    // No-op constructor
  }

  observe(): void {
    // No-op
  }

  disconnect(): void {
    // No-op
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

Object.defineProperty(globalThis, 'MutationObserver', {
  value: MutationObserverMock,
  writable: true,
});

/**
 * scrollTo Mock
 *
 * jsdom doesn't implement scrollTo, which is used by many components.
 */
Element.prototype.scrollTo = vi.fn();
window.scrollTo = vi.fn();

/**
 * scrollIntoView Mock
 *
 * Used by focus management and navigation.
 */
Element.prototype.scrollIntoView = vi.fn();

/**
 * requestAnimationFrame / cancelAnimationFrame Mock
 *
 * Used by animations and smooth scrolling.
 */
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback): number => {
    return setTimeout(() => {
      callback(Date.now());
    }, 16) as unknown as number;
  });
}

if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = vi.fn((id: number): void => {
    clearTimeout(id);
  });
}

/**
 * Clipboard API Mock
 *
 * Note: We make this configurable so @testing-library/user-event can override it.
 * user-event has its own clipboard stub that it attaches during setup().
 */
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue([]),
  },
  writable: true,
  configurable: true, // Required for @testing-library/user-event
});

/**
 * URL.createObjectURL / revokeObjectURL Mock
 *
 * Used by file handling and blob URLs.
 */
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}

if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// =============================================================================
// Tauri API Mocks
// =============================================================================

/**
 * Mock Tauri invoke function
 *
 * Default implementation returns success responses for common commands.
 * Override in specific tests using vi.mocked(invoke).mockImplementation()
 */
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((command: string) => {
    // Default mock responses for common commands
    switch (command) {
      case 'get_workspace_path':
        return Promise.resolve('/mock/workspace');
      case 'read_file':
        return Promise.resolve('mock file content');
      case 'write_file':
        return Promise.resolve(undefined);
      case 'list_directory':
        return Promise.resolve([]);
      case 'git_status':
        return Promise.resolve({
          branch: 'main',
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
        });
      default:
        return Promise.resolve(undefined);
    }
  }),
}));

/**
 * Mock Tauri event system
 */
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // Cleanup function
  }),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {
    // Cleanup function
  }),
}));

/**
 * Mock Tauri window API
 */
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    label: 'main',
    listen: vi.fn().mockResolvedValue(() => {}),
    emit: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
    setMinSize: vi.fn().mockResolvedValue(undefined),
    setMaxSize: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    setPosition: vi.fn().mockResolvedValue(undefined),
    center: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    unmaximize: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    isMinimized: vi.fn().mockResolvedValue(false),
    isVisible: vi.fn().mockResolvedValue(true),
    isFocused: vi.fn().mockResolvedValue(true),
  })),
  Window: vi.fn(),
}));

/**
 * Mock Tauri shell plugin
 */
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    sidecar: vi.fn(() => ({
      spawn: vi.fn().mockResolvedValue({
        pid: 12345,
        write: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn().mockResolvedValue(undefined),
      }),
      execute: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    })),
  },
  open: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Mock Tauri dialog plugin
 */
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(false),
  confirm: vi.fn().mockResolvedValue(false),
}));

/**
 * Mock Tauri clipboard plugin
 */
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}));

/**
 * Mock Tauri fs plugin
 */
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue(''),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  readDir: vi.fn().mockResolvedValue([]),
  createDir: vi.fn().mockResolvedValue(undefined),
  removeDir: vi.fn().mockResolvedValue(undefined),
  removeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  copyFile: vi.fn().mockResolvedValue(undefined),
  renameFile: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Mock Tauri log plugin
 */
vi.mock('@tauri-apps/plugin-log', () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  attachConsole: vi.fn().mockResolvedValue(() => {}),
}));

// =============================================================================
// Component Mocks (for Vite-specific features)
// =============================================================================

/**
 * Mock FileIcon component
 *
 * The real FileIcon uses import.meta.glob which is Vite-specific and
 * not available in the Vitest test environment.
 */
vi.mock('@/components/files/file-icon', () => ({
  FileIcon: ({
    fileName,
    className,
  }: {
    fileName: string;
    className?: string;
  }): React.ReactElement =>
    React.createElement('span', {
      'data-testid': 'file-icon',
      'data-filename': fileName,
      className,
    }),
}));

// =============================================================================
// Third-Party Library Mocks
// =============================================================================

/**
 * Mock Sentry
 *
 * Prevents actual error reporting during tests.
 */
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
  withScope: vi.fn((callback) => {
    callback({ setTag: vi.fn(), setExtra: vi.fn() });
  }),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

// =============================================================================
// Test Lifecycle Hooks
// =============================================================================

/**
 * Clear all mocks and storage between tests
 */
afterEach(() => {
  // Clear localStorage and sessionStorage
  localStorageMock.clear();
  sessionStorageMock.clear();

  // Reset all mock call counts
  vi.clearAllMocks();
});

/**
 * Setup before all tests
 */
beforeAll(() => {
  // Suppress console.error for expected React warnings in tests
  // Remove this if you want to see all console output
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Filter out React 18 concurrent mode warnings that are expected
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('ReactDOM.render is no longer supported') ||
      message.includes('act(...)')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

// =============================================================================
// Global Test Utilities (available in all tests via globals: true)
// =============================================================================

/**
 * Wait for next tick (useful for async state updates)
 */
(globalThis as Record<string, unknown>).waitForNextTick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Wait for specified milliseconds
 */
(globalThis as Record<string, unknown>).wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
