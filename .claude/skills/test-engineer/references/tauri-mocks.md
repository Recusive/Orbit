# Tauri Mocking Patterns

## When to Mock Tauri

**Only mock Tauri if the code under test directly calls `invoke`.**

Many Zustand stores and components don't call Tauri directly - they use hooks or services that do. Check the imports first.

```typescript
// This store DOES need Tauri mocks - it imports invoke
import { invoke } from '@tauri-apps/api/core';

// This store does NOT need Tauri mocks - no invoke import
import { useFileService } from '@/services/file-service';
```

---

## Basic Setup

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Tauri core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri events
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock Tauri window
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    isMaximized: vi.fn(() => Promise.resolve(false)),
  })),
}));

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));

// Mock Tauri fs (plugin-fs v2)
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  createDir: vi.fn(),
  removeDir: vi.fn(),
  removeFile: vi.fn(),
  copyFile: vi.fn(),
  renameFile: vi.fn(),
}));
```

If the repo already provides global Tauri mocks (for example in a root
`vitest.setup.ts`), do not re-mock here. Override with `vi.mocked(invoke)`
or reuse shared helpers (e.g., a `tauri-mocks.ts` utility) to avoid conflicts.

---

## Composable Command Mocks (Recommended)

The key problem with naive mocking is that each `mockImplementation` call **overwrites** the previous one. This pattern accumulates mocks instead.

```typescript
// src/test/mocks/tauri.ts
import { vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Type your command responses
interface CommandResponses {
  read_file: { content: string; path: string };
  write_file: { success: boolean };
  list_files: string[];
  get_project: { id: string; name: string; path: string } | null;
  run_agent: { output: string; exitCode: number };
  // Add your commands here
}

type CommandName = keyof CommandResponses;

// Accumulated mocks (doesn't overwrite on each call)
const commandMocks = new Map<string, unknown | Error>();

/**
 * Mock a single Tauri command. Accumulates - doesn't overwrite previous mocks.
 */
export function mockCommand<T extends CommandName>(
  command: T,
  response: CommandResponses[T] | Error
): void {
  commandMocks.set(command, response);
}

/**
 * Mock multiple commands at once.
 */
export function mockCommands(
  responses: Partial<{ [K in CommandName]: CommandResponses[K] | Error }>
): void {
  for (const [cmd, response] of Object.entries(responses)) {
    commandMocks.set(cmd, response);
  }
}

/**
 * Clear all command mocks. Call in beforeEach.
 */
export function clearCommandMocks(): void {
  commandMocks.clear();
}

/**
 * Set up the invoke mock once in setup.ts
 */
export function setupInvokeMock(): void {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (commandMocks.has(cmd)) {
      const response = commandMocks.get(cmd);
      if (response instanceof Error) throw response;
      return response;
    }
    throw new Error(`Unmocked Tauri command: ${cmd}`);
  });
}
```

**Setup in test config:**

```typescript
// src/test/setup.ts
import { vi, beforeEach } from 'vitest';
import { clearCommandMocks, setupInvokeMock } from './mocks/tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// Set up the mock handler once
setupInvokeMock();

// Clear mocks between tests
beforeEach(() => {
  clearCommandMocks();
  vi.clearAllMocks();
});
```

**Usage in tests:**

```typescript
import { mockCommand, mockCommands } from '@/test/mocks/tauri'

describe('FileViewer', () => {
  it('should display file content', async () => {
    // Mock single command
    mockCommand('read_file', { content: 'Hello World', path: '/test.txt' })

    render(<FileViewer path="/test.txt" />)

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })

  it('should handle multiple commands', async () => {
    // Mock multiple commands - they accumulate, don't overwrite
    mockCommands({
      list_files: ['a.ts', 'b.ts'],
      read_file: { content: 'content', path: '/a.ts' },
    })

    render(<FileBrowser />)

    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument()
    })
  })

  it('should show error on failure', async () => {
    mockCommand('read_file', new Error('File not found'))

    render(<FileViewer path="/missing.txt" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('File not found')
    })
  })
})
```

---

## Sequential Mock Responses

When a command is called multiple times with different expected results.

```typescript
// src/test/mocks/tauri.ts (add to existing file)

const sequentialMocks = new Map<string, { responses: unknown[]; index: number }>();

/**
 * Mock a command to return different responses on successive calls.
 */
export function mockCommandSequence<T extends CommandName>(
  command: T,
  responses: (CommandResponses[T] | Error)[]
): void {
  sequentialMocks.set(command, { responses, index: 0 });
}

// Update setupInvokeMock to handle sequences:
export function setupInvokeMock(): void {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    // Check sequential mocks first
    const sequence = sequentialMocks.get(cmd);
    if (sequence) {
      const response = sequence.responses[sequence.index] ?? sequence.responses.at(-1);
      sequence.index++;
      if (response instanceof Error) throw response;
      return response;
    }

    // Then check regular mocks
    if (commandMocks.has(cmd)) {
      const response = commandMocks.get(cmd);
      if (response instanceof Error) throw response;
      return response;
    }

    throw new Error(`Unmocked Tauri command: ${cmd}`);
  });
}

export function clearCommandMocks(): void {
  commandMocks.clear();
  sequentialMocks.clear();
}
```

**Usage:**

```typescript
it('should retry on failure then succeed', async () => {
  mockCommandSequence('read_file', [
    new Error('Network error'),
    new Error('Network error'),
    { content: 'Success', path: '/test.txt' },
  ])

  render(<FileViewer path="/test.txt" retries={3} />)

  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument()
  })
  expect(invoke).toHaveBeenCalledTimes(3)
})
```

---

## Event Mocking

Mock Tauri event listeners for real-time updates.

```typescript
// src/test/mocks/tauri-events.ts
import { vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';

type EventCallback = (event: { payload: unknown }) => void;
const eventListeners = new Map<string, EventCallback[]>();

vi.mocked(listen).mockImplementation(async (event, callback) => {
  const listeners = eventListeners.get(event) ?? [];
  listeners.push(callback);
  eventListeners.set(event, listeners);

  // Return unlisten function
  return () => {
    const current = eventListeners.get(event) ?? [];
    eventListeners.set(
      event,
      current.filter((cb) => cb !== callback)
    );
  };
});

/**
 * Emit a mock event to all registered listeners.
 */
export function emitMockEvent(event: string, payload: unknown): void {
  const listeners = eventListeners.get(event) ?? [];
  for (const callback of listeners) {
    callback({ payload });
  }
}

/**
 * Clear all event listeners. Call in beforeEach.
 */
export function clearEventListeners(): void {
  eventListeners.clear();
}
```

**Usage:**

```typescript
import { emitMockEvent } from '@/test/mocks/tauri-events'
import { mockCommand } from '@/test/mocks/tauri'

it('should update when file changes', async () => {
  mockCommand('read_file', { content: 'Initial', path: '/test.txt' })

  render(<FileViewer path="/test.txt" />)

  await waitFor(() => {
    expect(screen.getByText('Initial')).toBeInTheDocument()
  })

  // Update mock and emit event
  mockCommand('read_file', { content: 'Updated', path: '/test.txt' })
  emitMockEvent('file-changed', { path: '/test.txt' })

  await waitFor(() => {
    expect(screen.getByText('Updated')).toBeInTheDocument()
  })
})
```

---

## Dialog Mocking

Mock file dialogs for open/save operations.

```typescript
import { open, save } from '@tauri-apps/plugin-dialog'
import { mockCommand } from '@/test/mocks/tauri'

it('should open selected file', async () => {
  vi.mocked(open).mockResolvedValue('/selected/file.txt')
  mockCommand('read_file', { content: 'File content', path: '/selected/file.txt' })

  render(<FileOpener />)

  await userEvent.click(screen.getByRole('button', { name: 'Open File' }))

  await waitFor(() => {
    expect(screen.getByText('File content')).toBeInTheDocument()
  })
})

it('should handle dialog cancellation', async () => {
  vi.mocked(open).mockResolvedValue(null) // User cancelled

  render(<FileOpener />)

  await userEvent.click(screen.getByRole('button', { name: 'Open File' }))

  expect(invoke).not.toHaveBeenCalled()
})
```

---

## Zustand + Tauri Integration

```typescript
import { useFileStore } from '@/stores/file-store';
import { mockCommand, clearCommandMocks } from '@/test/mocks/tauri';

describe('fileStore with Tauri', () => {
  beforeEach(() => {
    useFileStore.getState().reset?.();
    clearCommandMocks();
    vi.clearAllMocks();
  });

  it('should load files from Tauri backend', async () => {
    mockCommand('list_files', ['a.ts', 'b.ts', 'c.ts']);

    await useFileStore.getState().loadFiles('/project');

    expect(useFileStore.getState().files).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(invoke).toHaveBeenCalledWith('list_files', { path: '/project' });
  });

  it('should set error state on Tauri failure', async () => {
    mockCommand('list_files', new Error('Permission denied'));

    await useFileStore.getState().loadFiles('/protected');

    expect(useFileStore.getState().error).toBe('Permission denied');
    expect(useFileStore.getState().files).toEqual([]);
  });

  it('should handle race conditions', async () => {
    // First call is slow, second is fast
    let resolveFirst: (value: string[]) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          })
      )
      .mockImplementationOnce(() => Promise.resolve(['second.ts']));

    // Start first request
    const first = useFileStore.getState().loadFiles('/slow');
    // Start second request immediately
    const second = useFileStore.getState().loadFiles('/fast');

    await second;
    // First resolves after second
    resolveFirst!(['first.ts']);
    await first;

    // Should have second result (last request wins)
    expect(useFileStore.getState().files).toEqual(['second.ts']);
  });
});
```

---

## Verify Mock Was Called Correctly

```typescript
it('should call invoke with correct arguments', async () => {
  mockCommand('write_file', { success: true });

  await saveFile('/test.txt', 'content');

  expect(invoke).toHaveBeenCalledWith('write_file', {
    path: '/test.txt',
    content: 'content',
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});

// For partial matching
expect(invoke).toHaveBeenCalledWith('write_file', expect.objectContaining({ path: '/test.txt' }));
```

---

## Common Pitfalls

### 1. Forgetting to clear mocks

```typescript
// BAD: Mocks leak between tests
it('test 1', () => {
  mockCommand('read_file', { content: 'A' });
});

it('test 2', () => {
  // Still has 'read_file' mock from test 1!
});

// GOOD: Clear in beforeEach (handled by setup.ts)
```

### 2. Mocking when not needed

```typescript
// BAD: Store doesn't call invoke, but test mocks it
import { useUIStore } from './ui-store'; // No invoke import!

vi.mock('@tauri-apps/api/core'); // Unnecessary!

it('should toggle sidebar', () => {
  useUIStore.getState().toggleSidebar();
  expect(useUIStore.getState().sidebarOpen).toBe(true);
});
```

### 3. Not testing the error path

```typescript
// BAD: Only test success
it('should load file', async () => {
  mockCommand('read_file', { content: 'data' });
  // ...
});

// GOOD: Also test failure
it('should handle file not found', async () => {
  mockCommand('read_file', new Error('ENOENT: no such file'));
  // ...
});
```
