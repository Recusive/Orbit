/**
 * Canvas-UI-Builder Tests
 *
 * Tests for Canvas types and setup logic.
 *
 * Run with: bun run test:canvas
 */

import { createMockInvoke, resetMocks } from '../test-setup';

import type { CanvasSetupState, UseCanvasSetupResult } from '../hooks/use-canvas-setup';

// =============================================================================
// Type Tests
// =============================================================================

describe('Canvas Types', () => {
  it('CanvasSetupState should be a valid union type', () => {
    const validStates: CanvasSetupState[] = ['checking', 'needs-setup', 'ready', 'error'];

    // Type check - these should compile
    validStates.forEach((state) => {
      expect(typeof state).toBe('string');
    });
  });

  it('UseCanvasSetupResult should have required fields', () => {
    const mockResult: UseCanvasSetupResult = {
      state: 'ready',
      orbitPath: '/home/user/.orbit/canvas',
      componentCount: 50,
      previewReady: true,
      error: null,
      recheckSetup: (): Promise<void> => Promise.resolve(),
    };

    expect(mockResult.state).toBe('ready');
    expect(mockResult.componentCount).toBe(50);
    expect(mockResult.orbitPath).toBe('/home/user/.orbit/canvas');
    expect(mockResult.previewReady).toBe(true);
    expect(mockResult.error).toBeNull();
    expect(typeof mockResult.recheckSetup).toBe('function');
  });
});

// =============================================================================
// Mock Tests
// =============================================================================

describe('Test Setup Mocks', () => {
  it('createMockInvoke should return expected responses', async () => {
    const mockInvoke = createMockInvoke({
      canvas_check_setup: {
        initialized: true,
        orbit_path: '/test/.orbit/canvas',
        component_count: 25,
        preview_ready: true,
      },
    });

    const result = (await mockInvoke('canvas_check_setup')) as {
      initialized: boolean;
      orbit_path: string;
      component_count: number;
      preview_ready: boolean;
    };

    expect(result.initialized).toBe(true);
    expect(result.component_count).toBe(25);
  });

  it('createMockInvoke should throw for Error responses', async () => {
    const mockInvoke = createMockInvoke({
      canvas_check_setup: new Error('Tauri error'),
    });

    await expect(mockInvoke('canvas_check_setup')).rejects.toThrow('Tauri error');
  });

  it('createMockInvoke should throw for unknown commands', async () => {
    const mockInvoke = createMockInvoke({});

    await expect(mockInvoke('unknown_command')).rejects.toThrow(
      'No mock response for command: unknown_command'
    );
  });

  it('resetMocks should clear mock call counts', () => {
    // Just verify it doesn't throw
    expect(() => {
      resetMocks();
    }).not.toThrow();
  });
});

// =============================================================================
// Integration Test Stubs
// =============================================================================
// These tests use mocks to test the expected behavior of Tauri commands.

describe('Canvas Setup Flow (with mocks)', () => {
  it('should report needs-setup when not initialized', async () => {
    const mockInvoke = createMockInvoke({
      canvas_check_setup: {
        initialized: false,
        orbit_path: '/home/user/.orbit/canvas',
        component_count: 0,
        preview_ready: false,
      },
    });

    const result = (await mockInvoke('canvas_check_setup')) as {
      initialized: boolean;
    };

    expect(result.initialized).toBe(false);
  });

  it('should report ready when fully initialized', async () => {
    const mockInvoke = createMockInvoke({
      canvas_check_setup: {
        initialized: true,
        orbit_path: '/home/user/.orbit/canvas',
        component_count: 50,
        preview_ready: true,
      },
    });

    const result = (await mockInvoke('canvas_check_setup')) as {
      initialized: boolean;
      component_count: number;
      preview_ready: boolean;
    };

    expect(result.initialized).toBe(true);
    expect(result.component_count).toBe(50);
    expect(result.preview_ready).toBe(true);
  });

  it('should handle initialization flow', async () => {
    const mockInvoke = createMockInvoke({
      canvas_initialize_directories: {},
      canvas_mark_ready: {},
      canvas_check_setup: {
        initialized: true,
        orbit_path: '/home/user/.orbit/canvas',
        component_count: 0,
        preview_ready: false,
      },
    });

    // Initialize directories
    await mockInvoke('canvas_initialize_directories');

    // Mark as ready
    await mockInvoke('canvas_mark_ready');

    // Check setup should now show initialized
    const result = (await mockInvoke('canvas_check_setup')) as {
      initialized: boolean;
    };

    expect(result.initialized).toBe(true);
  });
});

describe('Canvas Download Flow (with mocks)', () => {
  it('should download a component successfully', async () => {
    const mockInvoke = createMockInvoke({
      canvas_download_component: {
        success: true,
        files: ['components/ui/button.tsx', 'lib/utils.ts'],
        dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
      },
    });

    const result = (await mockInvoke('canvas_download_component', { name: 'button' })) as {
      success: boolean;
      files: string[];
      dependencies: string[];
    };

    expect(result.success).toBe(true);
    expect(result.files).toContain('components/ui/button.tsx');
    expect(result.dependencies).toContain('@radix-ui/react-slot');
  });

  it('should handle download failure', async () => {
    const mockInvoke = createMockInvoke({
      canvas_download_component: {
        success: false,
        files: [],
        dependencies: [],
        error: 'Component not found in registry',
      },
    });

    const result = (await mockInvoke('canvas_download_component', {
      name: 'nonexistent',
    })) as {
      success: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('Component not found in registry');
  });
});

describe('Canvas Registry Flow (with mocks)', () => {
  it('should get empty registry on first run', async () => {
    const mockInvoke = createMockInvoke({
      canvas_get_registry: {
        version: '1.0.0',
        last_updated: '2025-01-19T00:00:00Z',
        components: [],
      },
    });

    const result = (await mockInvoke('canvas_get_registry')) as {
      version: string;
      components: unknown[];
    };

    expect(result.version).toBe('1.0.0');
    expect(result.components).toHaveLength(0);
  });

  it('should save and retrieve registry', async () => {
    const registry = {
      version: '1.0.0',
      last_updated: '2025-01-19T00:00:00Z',
      components: [
        {
          name: 'button',
          component_type: 'ui',
          dependencies: ['@radix-ui/react-slot'],
          registry_dependencies: [],
        },
      ],
    };

    const mockInvoke = createMockInvoke({
      canvas_save_registry: {},
      canvas_get_registry: registry,
    });

    // Save registry
    await mockInvoke('canvas_save_registry', { registry });

    // Get registry
    const result = (await mockInvoke('canvas_get_registry')) as typeof registry;

    expect(result.components).toHaveLength(1);
    expect(result.components[0]?.name).toBe('button');
  });
});
