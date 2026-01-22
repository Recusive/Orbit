# Test Templates

## Test Setup File

If the repo already has a Vitest setup file (common in monorepos), add to it.
Otherwise create `src/test/setup.ts` and reference in `vitest.config.ts`:

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock Tauri core (only if needed)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
```

Note: If Tauri is already mocked globally (e.g., `vitest.setup.ts`), do not
re-mock it in individual test files. Override with `vi.mocked(invoke)` or
use shared helpers instead.

## Custom Render with Providers

Most components need providers. Create once, use everywhere:

```typescript
// src/test/utils.tsx
import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@/providers/theme-provider'

interface AllProvidersProps {
  readonly children: ReactNode
}

const AllProviders = ({ children }: AllProvidersProps): ReactElement => (
  <ThemeProvider>
    {children}
  </ThemeProvider>
)

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options })

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }
```

---

## Zustand Store

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStoreName } from './store-name';

describe('storeName', () => {
  beforeEach(() => {
    // Prefer reset() if available
    const store = useStoreName;
    const state = store.getState();
    if ('reset' in state && typeof state.reset === 'function') {
      state.reset();
    } else if (typeof store.getInitialState === 'function') {
      store.setState(store.getInitialState(), true);
    } else {
      // Fallback: reset known fields without replace
      store.setState({
        items: [],
        isLoading: false,
        error: null,
      });
    }
    vi.clearAllMocks();
  });

  describe('actionName', () => {
    it('should update state when called with valid input', () => {
      // Arrange
      const input = { id: '1', name: 'test' };

      // Act
      useStoreName.getState().actionName(input);

      // Assert
      const state = useStoreName.getState();
      expect(state.items).toContainEqual(expect.objectContaining({ id: '1' }));
    });

    it('should handle empty input', () => {
      useStoreName.getState().actionName(null);

      expect(useStoreName.getState().items).toEqual([]);
    });
  });

  describe('computed getters', () => {
    it('should calculate derived value correctly', () => {
      // Set up known state
      useStoreName.setState(
        {
          items: [{ price: 10 }, { price: 20 }],
        },
        true
      );

      // Test the computed getter
      expect(useStoreName.getState().getTotal()).toBe(30);
    });
  });
});
```

## Zustand Store with Tauri

Only mock invoke if the store actually calls it:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from './file-store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() })); // Only if not globally mocked

describe('fileStore', () => {
  beforeEach(() => {
    useFileStore.getState().reset?.();
    vi.clearAllMocks();
  });

  it('should load files from backend', async () => {
    vi.mocked(invoke).mockResolvedValue(['a.ts', 'b.ts']);

    await useFileStore.getState().loadFiles('/project');

    expect(useFileStore.getState().files).toEqual(['a.ts', 'b.ts']);
    expect(invoke).toHaveBeenCalledWith('list_files', { path: '/project' });
  });

  it('should set error on backend failure', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Permission denied'));

    await useFileStore.getState().loadFiles('/protected');

    expect(useFileStore.getState().error).toBe('Permission denied');
  });
});
```

## Zustand Store with Persist Middleware

Test the persistence callbacks:

```typescript
import { describe, it, expect } from 'vitest';

// Test partialize (what gets saved to localStorage)
describe('persistence', () => {
  it('should only persist specified fields', () => {
    // Get the persist config from the store
    const persistConfig = useStoreName.persist;

    const fullState = {
      items: [{ id: '1' }],
      isLoading: true,
      error: 'some error',
      _internal: { cache: {} },
    };

    // Test partialize
    const persisted = persistConfig.getOptions().partialize?.(fullState);

    expect(persisted).toHaveProperty('items');
    expect(persisted).not.toHaveProperty('isLoading');
    expect(persisted).not.toHaveProperty('_internal');
  });

  it('should handle corrupted localStorage gracefully', () => {
    const persistConfig = useStoreName.persist;
    const merge = persistConfig.getOptions().merge;

    const currentState = { items: [], isLoading: false };

    // Simulate corrupted data
    const corruptedData = null;
    const result = merge?.(corruptedData, currentState);

    // Should return current state, not crash
    expect(result).toEqual(currentState);
  });
});
```

---

## React Component

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils' // Custom render
import userEvent from '@testing-library/user-event'
import { ComponentName } from './ComponentName'

describe('ComponentName', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render with required props', () => {
    render(<ComponentName title="Test" />)

    expect(screen.getByRole('heading', { name: 'Test' })).toBeInTheDocument()
  })

  it('should call onSubmit when form is submitted', async () => {
    const onSubmit = vi.fn()
    render(<ComponentName onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Name'), 'John')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'John' })
  })

  it('should show loading state while fetching', () => {
    render(<ComponentName isLoading />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should display error message on failure', async () => {
    render(<ComponentName error="Failed to load" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load')
  })

  it('should handle keyboard navigation', async () => {
    const onSelect = vi.fn()
    render(<ComponentName onSelect={onSelect} />)

    const item = screen.getByRole('option', { name: 'First' })
    item.focus()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith('first')
  })
})
```

## React Component with Async Data

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/utils'
import { invoke } from '@tauri-apps/api/core'
import { FileViewer } from './FileViewer'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('FileViewer', () => {
  it('should show loading then content', async () => {
    // Delay response to test loading state
    vi.mocked(invoke).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ content: 'Done' }), 50))
    )

    render(<FileViewer path="/test.txt" />)

    // Loading state appears first
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Content appears after load
    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    // Loading state is gone
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('should show error on failure', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Not found'))

    render(<FileViewer path="/missing.txt" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Not found')
    })
  })
})
```

---

## Custom Hook

> **Note:** Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeEach`) are available without import when `globals: true` is set in vitest.config.ts. The imports below are shown for clarity.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should initialize with default value', () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);
  });

  it('should initialize with provided value', () => {
    const { result } = renderHook(() => useCounter(10));

    expect(result.current.count).toBe(10);
  });

  it('should increment count', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('should handle async operations', async () => {
    const { result } = renderHook(() => useAsyncData());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });
});
```

## Custom Hook with Tauri Backend

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useFileContent } from './useFileContent';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load file content on mount', async () => {
    vi.mocked(invoke).mockResolvedValue({ content: 'Hello World' });

    const { result } = renderHook(() => useFileContent('/test.txt'));

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.content).toBeNull();

    // After load completes
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.content).toBe('Hello World');
    expect(invoke).toHaveBeenCalledWith('read_file', { path: '/test.txt' });
  });

  it('should reload when path changes', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ content: 'File A' })
      .mockResolvedValueOnce({ content: 'File B' });

    const { result, rerender } = renderHook(({ path }) => useFileContent(path), {
      initialProps: { path: '/a.txt' },
    });

    await waitFor(() => {
      expect(result.current.content).toBe('File A');
    });

    // Change the path prop
    rerender({ path: '/b.txt' });

    await waitFor(() => {
      expect(result.current.content).toBe('File B');
    });
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('File not found'));

    const { result } = renderHook(() => useFileContent('/missing.txt'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('File not found');
    expect(result.current.content).toBeNull();
  });
});
```

---

## Zod Schema

```typescript
import { describe, it, expect } from 'vitest';
import { schemaName, type SchemaType } from './schema-name';

describe('schemaName', () => {
  // Factory for valid base data
  const createValid = (overrides: Partial<SchemaType> = {}): SchemaType => ({
    id: 'test-id',
    name: 'Test Name',
    email: 'test@example.com',
    ...overrides,
  });

  describe('valid inputs', () => {
    it('should accept minimal valid input', () => {
      const result = schemaName.safeParse(createValid());
      expect(result.success).toBe(true);
    });

    it('should accept optional fields when provided', () => {
      const result = schemaName.safeParse(createValid({ description: 'optional' }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('optional');
      }
    });
  });

  describe('required fields', () => {
    it('should reject missing id', () => {
      const { id, ...withoutId } = createValid();
      const result = schemaName.safeParse(withoutId);
      expect(result.success).toBe(false);
    });

    it('should reject missing name', () => {
      const { name, ...withoutName } = createValid();
      const result = schemaName.safeParse(withoutName);
      expect(result.success).toBe(false);
    });
  });

  describe('field validation', () => {
    it('should reject invalid email format', () => {
      const result = schemaName.safeParse(createValid({ email: 'not-an-email' }));
      expect(result.success).toBe(false);
    });

    it('should reject empty string for name', () => {
      const result = schemaName.safeParse(createValid({ name: '' }));
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode in name', () => {
      const result = schemaName.safeParse(createValid({ name: '日本語テスト' }));
      expect(result.success).toBe(true);
    });

    it('should handle maximum length boundary', () => {
      const result = schemaName.safeParse(createValid({ name: 'a'.repeat(255) }));
      expect(result.success).toBe(true);
    });

    it('should reject exceeding maximum length', () => {
      const result = schemaName.safeParse(createValid({ name: 'a'.repeat(256) }));
      expect(result.success).toBe(false);
    });
  });
});
```

---

## Rust Unit Test

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn function_name_returns_expected_value() {
        let result = function_name("input");
        assert_eq!(result, "expected");
    }

    #[test]
    fn function_name_handles_empty_input() {
        let result = function_name("");
        assert_eq!(result, "default");
    }

    #[test]
    fn function_name_returns_error_for_invalid_input() {
        let result = function_name("invalid");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("invalid input"));
    }

    #[test]
    #[should_panic(expected = "cannot be negative")]
    fn function_panics_on_negative_input() {
        function_that_panics(-1);
    }
}
```

## Rust with Filesystem (tempfile)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::{TempDir, NamedTempFile};

    #[test]
    fn read_file_returns_content() {
        // Arrange
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "test content").unwrap();

        // Act
        let result = read_file(file.path().to_str().unwrap());

        // Assert
        assert!(result.is_ok());
        assert!(result.unwrap().contains("test content"));
    }

    #[test]
    fn read_file_returns_error_for_missing_file() {
        let result = read_file("/nonexistent/path/file.txt");

        assert!(result.is_err());
    }

    #[test]
    fn write_file_creates_file_with_content() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        let result = write_file(file_path.to_str().unwrap(), "hello");

        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "hello");
    }

    #[test]
    fn list_files_returns_all_files_in_directory() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("a.txt"), "").unwrap();
        fs::write(temp_dir.path().join("b.txt"), "").unwrap();

        let result = list_files(temp_dir.path().to_str().unwrap()).unwrap();

        assert_eq!(result.len(), 2);
        assert!(result.contains(&"a.txt".to_string()));
        assert!(result.contains(&"b.txt".to_string()));
    }
}
```

## Tauri Async Command

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn command_returns_success_for_valid_input() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("test.txt");
        std::fs::write(&path, "content").unwrap();

        let result = read_file_command(path.to_str().unwrap().to_string()).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "content");
    }

    #[tokio::test]
    async fn command_returns_error_for_missing_file() {
        let result = read_file_command("/nonexistent".to_string()).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn command_handles_concurrent_calls() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("test.txt");
        std::fs::write(&path, "content").unwrap();

        let path_str = path.to_str().unwrap().to_string();
        let futures: Vec<_> = (0..10)
            .map(|_| read_file_command(path_str.clone()))
            .collect();

        let results = futures::future::join_all(futures).await;

        assert!(results.iter().all(|r| r.is_ok()));
    }
}
```
