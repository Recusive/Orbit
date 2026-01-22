/**
 * Test setup for Canvas-UI-Builder
 *
 * This file provides mock implementations for Tauri APIs
 * to enable testing React components in a non-Tauri environment.
 *
 * Run tests with: bun run test:canvas
 */

// =============================================================================
// Tauri API Mocks
// =============================================================================

/**
 * Mock invoke function
 *
 * By default returns empty/success responses.
 * Override in specific tests using vi.mocked(invoke).mockImplementation()
 */
export const mockInvoke = vi.fn((command: string): Promise<unknown> => {
  switch (command) {
    case 'canvas_check_setup':
      return Promise.resolve({
        initialized: false,
        orbit_path: '/mock/home/.orbit/canvas',
        component_count: 0,
        preview_ready: false,
      });
    case 'canvas_initialize_directories':
      return Promise.resolve({});
    case 'canvas_download_component':
      return Promise.resolve({
        success: true,
        files: [],
        dependencies: [],
      });
    default:
      return Promise.reject(new Error(`Unknown command: ${command}`));
  }
});

/**
 * Mock listen function
 *
 * Returns a cleanup function that does nothing.
 */
export const mockListen = vi.fn((): Promise<() => void> => {
  return Promise.resolve(() => {
    // Cleanup function - no-op in tests
  });
});

/**
 * Mock emit function
 */
export const mockEmit = vi.fn((): Promise<void> => {
  // No-op in tests
  return Promise.resolve();
});

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Helper to create a mock invoke function with custom responses
 */
export function createMockInvoke(
  responses: Record<string, unknown>
): ReturnType<typeof vi.fn<(command: string, args?: unknown) => Promise<unknown>>> {
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
 * Reset all mocks to their default implementations
 */
export function resetMocks(): void {
  mockInvoke.mockClear();
  mockListen.mockClear();
  mockEmit.mockClear();
}
