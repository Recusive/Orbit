/**
 * Tauri Mock Utilities for Testing
 *
 * This module provides utilities for mocking Tauri commands in tests.
 * Use these helpers to create custom mock implementations for specific test scenarios.
 *
 * @example
 * ```typescript
 * import { createMockInvoke, mockTauriCommand } from '@orbit/common/testing';
 *
 * // Create a custom invoke mock
 * const mockInvoke = createMockInvoke({
 *   'read_file': 'file contents',
 *   'write_file': undefined,
 *   'git_status': { branch: 'feature', ahead: 1, behind: 0 },
 * });
 *
 * // Or mock a specific command
 * mockTauriCommand('read_file', 'custom content');
 * ```
 */

// vi is available as a global via vitest/globals (configured in root tsconfig.json)

// =============================================================================
// Types
// =============================================================================

/**
 * Response map type for createMockInvoke
 */
export type MockResponseMap = Record<string, unknown>;

/**
 * Mock invoke function type - matches Tauri's invoke signature
 * Uses intersection to provide both mock methods and invoke signature
 */
export interface MockInvokeFn {
  (cmd: string, args?: unknown): Promise<unknown>;
  mockImplementation: (fn: (cmd: string, args?: unknown) => Promise<unknown>) => void;
  getMockImplementation: () => ((cmd: string, args?: unknown) => Promise<unknown>) | undefined;
  mockClear: () => void;
  mockReset: () => void;
}

// =============================================================================
// Mock Creators
// =============================================================================

/**
 * Create a mock invoke function with custom responses
 *
 * @param responses - Map of command names to their responses (or Errors to reject)
 * @returns A mock function that resolves/rejects based on the response map
 *
 * @example
 * ```typescript
 * const mockInvoke = createMockInvoke({
 *   'canvas_check_setup': {
 *     initialized: true,
 *     orbit_path: '/test/.orbit/canvas',
 *     component_count: 25,
 *   },
 *   'canvas_download_component': new Error('Network error'),
 * });
 *
 * // Use in test
 * vi.mocked(invoke).mockImplementation(mockInvoke);
 * ```
 */
export function createMockInvoke(responses: MockResponseMap): MockInvokeFn {
  return vi.fn((command: string): Promise<unknown> => {
    if (command in responses) {
      const response = responses[command];
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response);
    }
    return Promise.reject(new Error(`No mock response for command: ${command}`));
  });
}

/**
 * Mock a specific Tauri command with a custom implementation
 *
 * This function modifies the global invoke mock for a specific command.
 * Use this when you need to override the default mock for a single command.
 *
 * @param command - The Tauri command name
 * @param response - The response to return (or Error to reject)
 *
 * @example
 * ```typescript
 * import { invoke } from '@tauri-apps/api/core';
 *
 * // In your test
 * await mockTauriCommand('read_file', 'custom file content');
 *
 * // The next call to invoke('read_file') will return 'custom file content'
 * const content = await invoke('read_file', { path: '/test.txt' });
 * ```
 */
export async function mockTauriCommand(command: string, response: unknown): Promise<void> {
  // Dynamic import to get the mocked invoke - cast through unknown since
  // in tests the module is mocked and invoke has mock methods attached
  const { invoke } = (await import('@tauri-apps/api/core')) as unknown as { invoke: MockInvokeFn };

  const originalImpl = invoke.getMockImplementation();

  invoke.mockImplementation((cmd: string, args?: unknown): Promise<unknown> => {
    if (cmd === command) {
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response);
    }
    // Fall back to original implementation
    return originalImpl?.(cmd, args) ?? Promise.resolve(undefined);
  });
}

/**
 * Reset all Tauri command mocks to their default implementations
 *
 * Call this in afterEach or when you need to reset mock state.
 */
export function resetTauriMocks(): void {
  vi.resetAllMocks();
}

// =============================================================================
// Common Mock Response Factories
// =============================================================================

/**
 * Factory functions for creating common mock responses.
 * These help ensure consistent mock data across tests.
 */
export const mockResponses = {
  /**
   * Create a mock canvas setup response
   */
  canvasSetup: (overrides: Partial<CanvasSetupResponse> = {}): CanvasSetupResponse => ({
    initialized: false,
    orbit_path: '/mock/home/.orbit/canvas',
    component_count: 0,
    preview_ready: false,
    ...overrides,
  }),

  /**
   * Create a mock git status response
   */
  gitStatus: (overrides: Partial<GitStatusResponse> = {}): GitStatusResponse => ({
    branch: 'main',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    ...overrides,
  }),

  /**
   * Create a mock file entry response
   */
  fileEntry: (overrides: Partial<FileEntryResponse> = {}): FileEntryResponse => ({
    name: 'test.ts',
    path: '/mock/workspace/test.ts',
    is_dir: false,
    is_file: true,
    ...overrides,
  }),

  /**
   * Create a mock terminal info response
   */
  terminalInfo: (overrides: Partial<TerminalInfoResponse> = {}): TerminalInfoResponse => ({
    id: 'term-1',
    shell: '/bin/zsh',
    cwd: '/mock/workspace',
    rows: 24,
    cols: 80,
    ...overrides,
  }),
};

// =============================================================================
// Response Types (for type safety)
// =============================================================================

export interface CanvasSetupResponse {
  readonly initialized: boolean;
  readonly orbit_path: string;
  readonly component_count: number;
  readonly preview_ready: boolean;
}

export interface GitStatusResponse {
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
  readonly staged: readonly string[];
  readonly unstaged: readonly string[];
  readonly untracked: readonly string[];
}

export interface FileEntryResponse {
  readonly name: string;
  readonly path: string;
  readonly is_dir: boolean;
  readonly is_file: boolean;
}

export interface TerminalInfoResponse {
  readonly id: string;
  readonly shell: string;
  readonly cwd: string;
  readonly rows: number;
  readonly cols: number;
}
