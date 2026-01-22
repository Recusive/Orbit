# Test Examples and Mock Patterns

Code templates for all test types. Copy and adapt these patterns.

---

## Component Tests

### Base Setup — UNIT Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock stores with selector support
vi.mock('@/stores/fileStore', () => ({
  useFileStore: vi.fn((selector) => {
    const state = {
      files: [{ id: '1', name: 'test.txt' }],
      activeFileId: null,
      setActiveFile: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

// Mock Tauri
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

// Mock child components
vi.mock('./FileListItem', () => ({
  FileListItem: ({ id, onSelect }: any) => (
    <div data-testid={`mock-item-${id}`} onClick={() => onSelect(id)} />
  ),
}))

describe('Component (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders from props/store', () => {
    render(<Component />)
    expect(screen.getByTestId('mock-item-1')).toBeInTheDocument()
  })
})
```

### Base Setup — INTEGRATION Tests

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFileStore } from '@/stores/fileStore';
import { invoke } from '@tauri-apps/api/core';

// Only mock Tauri
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('Component (integration)', () => {
  beforeEach(() => {
    useFileStore.setState(useFileStore.getInitialState(), true);
    vi.clearAllMocks();

    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'list_directory') {
        return [{ id: '1', name: 'test.txt', is_dir: false }];
      }
      throw new Error(`Unmocked: ${cmd}`);
    });
  });

  afterEach(() => {
    useFileStore.destroy?.();
  });
});
```

---

## Custom Hook Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileOperations } from '../useFileOperations';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/stores/fileStore');

describe('useFileOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useFileOperations());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.files).toEqual([]);
  });

  it('loads files and updates state', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: '1', name: 'test.txt' }]);

    const { result } = renderHook(() => useFileOperations());

    act(() => {
      result.current.loadFiles('/path');
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.files).toHaveLength(1);
    });
  });

  it('handles errors', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed'));

    const { result } = renderHook(() => useFileOperations());

    act(() => {
      result.current.loadFiles('/path');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('cleans up on unmount', async () => {
    const { result, unmount } = renderHook(() => useFileOperations());

    act(() => {
      result.current.loadFiles('/path');
    });

    unmount();

    // Verify no state updates after unmount (no warnings)
  });

  // Edge case: rapid calls
  it('cancels previous request on new call', async () => {
    let resolveFirst: (v: any) => void;
    let resolveSecond: (v: any) => void;

    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveSecond = r;
          })
      );

    const { result } = renderHook(() => useFileOperations());

    act(() => {
      result.current.loadFiles('/first');
    });
    act(() => {
      result.current.loadFiles('/second');
    });

    resolveSecond!([{ id: '2', name: 'second.txt' }]);
    resolveFirst!([{ id: '1', name: 'first.txt' }]);

    await waitFor(() => {
      expect(result.current.files[0].name).toBe('second.txt');
    });
  });
});
```

---

## Context Provider Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '../ThemeContext'

describe('ThemeContext', () => {
  describe('useTheme hook', () => {
    it('throws when used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useTheme())
      }).toThrow('useTheme must be used within ThemeProvider')

      spy.mockRestore()
    })

    it('returns context value when inside provider', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider>{children}</ThemeProvider>
      )

      const { result } = renderHook(() => useTheme(), { wrapper })

      expect(result.current.theme).toBe('light')
      expect(typeof result.current.setTheme).toBe('function')
    })
  })

  describe('ThemeProvider', () => {
    it('provides default theme', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('light')
    })

    it('allows theme changes', async () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      await userEvent.click(screen.getByRole('button', { name: /toggle/i }))

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    })

    it('persists theme to localStorage', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      await userEvent.click(screen.getByRole('button', { name: /toggle/i }))

      expect(setItemSpy).toHaveBeenCalledWith('theme', 'dark')
    })

    it('reads initial theme from localStorage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    })
  })
})

// Test helper component
function TestConsumer() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle
      </button>
    </div>
  )
}
```

---

## Accessibility Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

describe('Component accessibility', () => {
  describe('axe automated checks', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<Component />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no violations in error state', async () => {
      const { container } = render(<Component error="Something went wrong" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('keyboard navigation', () => {
    it('supports tab navigation through interactive elements', async () => {
      render(<Component />)

      await userEvent.tab()
      expect(screen.getByRole('button', { name: /first/i })).toHaveFocus()

      await userEvent.tab()
      expect(screen.getByRole('button', { name: /second/i })).toHaveFocus()
    })

    it('supports arrow key navigation in list', async () => {
      render(<FileList files={mockFiles} />)

      await userEvent.tab()
      expect(screen.getByRole('option', { name: /file1/i })).toHaveFocus()

      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('option', { name: /file2/i })).toHaveFocus()

      await userEvent.keyboard('{ArrowUp}')
      expect(screen.getByRole('option', { name: /file1/i })).toHaveFocus()
    })

    it('supports Enter/Space activation', async () => {
      const onSelect = vi.fn()
      render(<FileList files={mockFiles} onSelect={onSelect} />)

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')

      expect(onSelect).toHaveBeenCalledWith('1')
    })
  })

  describe('focus management', () => {
    it('moves focus to modal when opened', async () => {
      render(<ModalTrigger />)

      await userEvent.click(screen.getByRole('button', { name: /open/i }))

      expect(screen.getByRole('dialog')).toHaveFocus()
    })

    it('traps focus within modal', async () => {
      render(
        <Modal isOpen>
          <button>First</button>
          <button>Last</button>
        </Modal>
      )

      const modal = screen.getByRole('dialog')
      const firstButton = within(modal).getByRole('button', { name: /first/i })
      const lastButton = within(modal).getByRole('button', { name: /last/i })

      firstButton.focus()

      await userEvent.tab()
      expect(lastButton).toHaveFocus()

      await userEvent.tab()
      expect(firstButton).toHaveFocus()

      await userEvent.tab({ shift: true })
      expect(lastButton).toHaveFocus()
    })

    it('restores focus when modal closes', async () => {
      render(<ModalTrigger />)

      const trigger = screen.getByRole('button', { name: /open/i })
      await userEvent.click(trigger)

      await userEvent.keyboard('{Escape}')

      expect(trigger).toHaveFocus()
    })

    it('moves focus to first error on form submission', async () => {
      render(<Form />)

      await userEvent.click(screen.getByRole('button', { name: /submit/i }))

      expect(screen.getByLabelText(/name/i)).toHaveFocus()
      expect(screen.getByLabelText(/name/i)).toHaveAccessibleDescription(/required/i)
    })
  })

  describe('ARIA attributes', () => {
    it('has correct role and label', () => {
      render(<FileList files={mockFiles} />)

      expect(screen.getByRole('listbox')).toHaveAccessibleName(/files/i)
    })

    it('marks selected item', () => {
      render(<FileList files={mockFiles} selectedId="1" />)

      expect(screen.getByRole('option', { name: /file1/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })

    it('announces loading state', () => {
      render(<FileList isLoading />)

      expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    })

    it('announces errors', () => {
      render(<FileList error="Failed to load" />)

      expect(screen.getByRole('alert')).toHaveTextContent(/failed/i)
    })

    it('associates error message with input', () => {
      render(<Input error="Invalid email" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAccessibleDescription(/invalid email/i)
    })
  })

  describe('screen reader announcements', () => {
    it('announces dynamic content changes', async () => {
      render(<Notifications />)

      await userEvent.click(screen.getByRole('button', { name: /save/i }))

      const liveRegion = screen.getByRole('status')
      expect(liveRegion).toHaveTextContent(/saved successfully/i)
    })
  })

  describe('reduced motion', () => {
    it('respects prefers-reduced-motion', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))

      render(<AnimatedComponent />)

      expect(screen.getByTestId('animated')).toHaveStyle({
        animation: 'none',
      })
    })
  })
})
```

---

## Router Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../routes'

function renderWithRouter(initialEntries = ['/']) {
  const router = createMemoryRouter(routes, { initialEntries })
  render(<RouterProvider router={router} />)
  return router
}

describe('Route: FileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('routing', () => {
    it('renders at /files/:id', async () => {
      vi.mocked(invoke).mockResolvedValueOnce({ id: '1', name: 'test.txt', content: 'Hello' })

      renderWithRouter(['/files/1'])

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument()
      })
    })

    it('handles missing file (404)', async () => {
      vi.mocked(invoke).mockRejectedValueOnce({ code: 404, message: 'Not found' })

      renderWithRouter(['/files/nonexistent'])

      await waitFor(() => {
        expect(screen.getByText(/not found/i)).toBeInTheDocument()
      })
    })

    it('redirects unauthenticated users', async () => {
      vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false })

      const router = renderWithRouter(['/files/1'])

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/login')
      })
    })
  })

  describe('navigation', () => {
    it('navigates to file on click', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([
        { id: '1', name: 'file1.txt' },
        { id: '2', name: 'file2.txt' },
      ])

      const router = renderWithRouter(['/files'])

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByText('file2.txt'))

      expect(router.state.location.pathname).toBe('/files/2')
    })

    it('preserves state on back navigation', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce([{ id: '1', name: 'file1.txt' }])
        .mockResolvedValueOnce({ id: '1', content: 'Hello' })

      const router = renderWithRouter(['/files'])

      await userEvent.click(screen.getByText('file1.txt'))

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/files/1')
      })

      router.navigate(-1)

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/files')
        expect(screen.getByText('file1.txt')).toBeInTheDocument()
      })
    })
  })

  describe('route params', () => {
    it('uses route param for data fetching', async () => {
      renderWithRouter(['/files/abc-123'])

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('get_file', { id: 'abc-123' })
      })
    })

    it('refetches when param changes', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ id: '1', name: 'first.txt' })
        .mockResolvedValueOnce({ id: '2', name: 'second.txt' })

      const router = renderWithRouter(['/files/1'])

      await waitFor(() => {
        expect(screen.getByText('first.txt')).toBeInTheDocument()
      })

      router.navigate('/files/2')

      await waitFor(() => {
        expect(screen.getByText('second.txt')).toBeInTheDocument()
      })
    })
  })

  describe('search params', () => {
    it('reads filter from search params', async () => {
      renderWithRouter(['/files?filter=txt'])

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('list_files', { filter: 'txt' })
      })
    })

    it('updates search params on filter change', async () => {
      const router = renderWithRouter(['/files'])

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /filter/i }),
        'txt'
      )

      expect(router.state.location.search).toBe('?filter=txt')
    })
  })

  describe('edge cases', () => {
    it('handles malformed route params', async () => {
      renderWithRouter(['/files/invalid<script>'])

      await waitFor(() => {
        expect(screen.getByText(/invalid file id/i)).toBeInTheDocument()
      })
    })

    it('handles concurrent navigation', async () => {
      const router = renderWithRouter(['/files'])

      router.navigate('/files/1')
      router.navigate('/files/2')
      router.navigate('/files/3')

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/files/3')
      })
    })
  })
})
```

---

## Drag and Drop Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

function fireDragEvents(source: HTMLElement, target: HTMLElement) {
  fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn() } })
  fireEvent.dragEnter(target)
  fireEvent.dragOver(target)
  fireEvent.drop(target)
  fireEvent.dragEnd(source)
}

describe('DraggableList', () => {
  const items = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('core drag functionality', () => {
    it('reorders items on drag and drop', () => {
      const onReorder = vi.fn()
      render(<DraggableList items={items} onReorder={onReorder} />)

      const firstItem = screen.getByText('Item 1')
      const thirdItem = screen.getByText('Item 3')

      fireDragEvents(firstItem, thirdItem)

      expect(onReorder).toHaveBeenCalledWith(['2', '3', '1'])
    })

    it('shows drag preview', () => {
      render(<DraggableList items={items} />)

      const item = screen.getByText('Item 1')
      fireEvent.dragStart(item)

      expect(screen.getByTestId('drag-overlay')).toHaveTextContent('Item 1')
    })

    it('highlights drop target', () => {
      render(<DraggableList items={items} />)

      const source = screen.getByText('Item 1')
      const target = screen.getByText('Item 2')

      fireEvent.dragStart(source)
      fireEvent.dragEnter(target)

      expect(target.closest('[data-droppable]')).toHaveClass('drop-target')
    })
  })

  describe('keyboard drag mode', () => {
    it('enters drag mode with Space', async () => {
      render(<DraggableList items={items} />)

      const item = screen.getByText('Item 1')
      item.focus()

      await userEvent.keyboard(' ')

      expect(item).toHaveAttribute('aria-grabbed', 'true')
      expect(screen.getByRole('status')).toHaveTextContent(/dragging item 1/i)
    })

    it('moves item with arrow keys in drag mode', async () => {
      const onReorder = vi.fn()
      render(<DraggableList items={items} onReorder={onReorder} />)

      const item = screen.getByText('Item 1')
      item.focus()

      await userEvent.keyboard(' ')
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard(' ')

      expect(onReorder).toHaveBeenCalledWith(['2', '1', '3'])
    })

    it('cancels drag with Escape', async () => {
      const onReorder = vi.fn()
      render(<DraggableList items={items} onReorder={onReorder} />)

      const item = screen.getByText('Item 1')
      item.focus()

      await userEvent.keyboard(' ')
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{Escape}')

      expect(onReorder).not.toHaveBeenCalled()
      expect(item).toHaveAttribute('aria-grabbed', 'false')
    })
  })

  describe('edge cases', () => {
    it('prevents drop on invalid target', () => {
      const onReorder = vi.fn()
      render(
        <>
          <DraggableList items={items} onReorder={onReorder} />
          <div data-testid="invalid-target">Invalid</div>
        </>
      )

      const source = screen.getByText('Item 1')
      const invalidTarget = screen.getByTestId('invalid-target')

      fireDragEvents(source, invalidTarget)

      expect(onReorder).not.toHaveBeenCalled()
    })

    it('handles drop on same position', () => {
      const onReorder = vi.fn()
      render(<DraggableList items={items} onReorder={onReorder} />)

      const item = screen.getByText('Item 1')

      fireDragEvents(item, item)

      expect(onReorder).not.toHaveBeenCalled()
    })

    it('handles drag outside container', () => {
      const onReorder = vi.fn()
      render(<DraggableList items={items} onReorder={onReorder} />)

      const item = screen.getByText('Item 1')

      fireEvent.dragStart(item)
      fireEvent.dragLeave(item.closest('[data-droppable]')!)
      fireEvent.dragEnd(item)

      expect(onReorder).not.toHaveBeenCalled()
    })

    it('cleans up drag state on unmount', () => {
      const { unmount } = render(<DraggableList items={items} />)

      const item = screen.getByText('Item 1')
      fireEvent.dragStart(item)

      unmount()
      // No errors, cleanup happened
    })
  })

  describe('accessibility', () => {
    it('has accessible drag handles', () => {
      render(<DraggableList items={items} />)

      const handles = screen.getAllByRole('button', { name: /drag handle/i })
      expect(handles).toHaveLength(3)
    })

    it('announces drag operations', async () => {
      render(<DraggableList items={items} />)

      const item = screen.getByText('Item 1')
      item.focus()

      await userEvent.keyboard(' ')

      expect(screen.getByRole('status')).toHaveTextContent(/picked up item 1/i)
    })
  })
})
```

---

## Virtualized List Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock react-window
vi.mock('react-window', () => ({
  FixedSizeList: ({ children, itemCount, height, itemSize }: any) => {
    const items = []
    const visibleCount = Math.ceil(height / itemSize)
    for (let i = 0; i < Math.min(itemCount, visibleCount + 2); i++) {
      items.push(children({ index: i, style: { height: itemSize } }))
    }
    return <div data-testid="virtual-list">{items}</div>
  },
  VariableSizeList: ({ children, itemCount, height, getItemSize }: any) => {
    const items = []
    let totalHeight = 0
    for (let i = 0; i < itemCount && totalHeight < height + 100; i++) {
      const size = getItemSize(i)
      items.push(children({ index: i, style: { height: size } }))
      totalHeight += size
    }
    return <div data-testid="virtual-list">{items}</div>
  },
}))

describe('VirtualFileList', () => {
  const generateFiles = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${i}`,
      name: `file-${i}.txt`,
    }))

  describe('core functionality', () => {
    it('renders visible items only', () => {
      const files = generateFiles(1000)
      render(<VirtualFileList files={files} height={400} itemSize={40} />)

      const items = screen.getAllByRole('option')
      expect(items.length).toBeLessThan(20)
    })

    it('renders correct items for scroll position', () => {
      const files = generateFiles(100)
      const { container } = render(
        <VirtualFileList files={files} height={400} itemSize={40} />
      )

      const list = container.querySelector('[data-testid="virtual-list"]')!
      fireEvent.scroll(list, { target: { scrollTop: 800 } })

      expect(screen.getByText('file-20.txt')).toBeInTheDocument()
    })
  })

  describe('scroll to item', () => {
    it('scrolls to specific item by id', async () => {
      const files = generateFiles(100)
      const ref = { current: null }

      render(<VirtualFileList ref={ref} files={files} height={400} itemSize={40} />)

      act(() => {
        ref.current?.scrollToItem('50')
      })

      await waitFor(() => {
        expect(screen.getByText('file-50.txt')).toBeInTheDocument()
      })
    })

    it('scrolls to first item', async () => {
      const files = generateFiles(100)
      const ref = { current: null }

      render(<VirtualFileList ref={ref} files={files} height={400} itemSize={40} />)

      act(() => { ref.current?.scrollToItem('50') })
      act(() => { ref.current?.scrollToItem('0') })

      await waitFor(() => {
        expect(screen.getByText('file-0.txt')).toBeInTheDocument()
      })
    })

    it('scrolls to last item', async () => {
      const files = generateFiles(100)
      const ref = { current: null }

      render(<VirtualFileList ref={ref} files={files} height={400} itemSize={40} />)

      act(() => { ref.current?.scrollToItem('99') })

      await waitFor(() => {
        expect(screen.getByText('file-99.txt')).toBeInTheDocument()
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty list', () => {
      render(<VirtualFileList files={[]} height={400} itemSize={40} />)

      expect(screen.getByText(/no files/i)).toBeInTheDocument()
    })

    it('handles single item', () => {
      render(<VirtualFileList files={generateFiles(1)} height={400} itemSize={40} />)

      expect(screen.getByText('file-0.txt')).toBeInTheDocument()
    })

    it('handles list smaller than viewport', () => {
      const files = generateFiles(3)
      render(<VirtualFileList files={files} height={400} itemSize={40} />)

      expect(screen.getByText('file-0.txt')).toBeInTheDocument()
      expect(screen.getByText('file-1.txt')).toBeInTheDocument()
      expect(screen.getByText('file-2.txt')).toBeInTheDocument()
    })

    it('handles dynamic item heights', () => {
      const files = generateFiles(100).map((f, i) => ({
        ...f,
        height: i % 2 === 0 ? 40 : 80,
      }))

      render(
        <VirtualFileList
          files={files}
          height={400}
          getItemSize={(i) => files[i].height}
        />
      )

      expect(screen.getByTestId('virtual-list')).toBeInTheDocument()
    })

    it('handles rapid scrolling', async () => {
      const files = generateFiles(1000)
      const { container } = render(
        <VirtualFileList files={files} height={400} itemSize={40} />
      )

      const list = container.querySelector('[data-testid="virtual-list"]')!

      for (let i = 0; i < 10; i++) {
        fireEvent.scroll(list, { target: { scrollTop: i * 1000 } })
      }

      await waitFor(() => {
        expect(screen.getByText(/file-9\d\d/)).toBeInTheDocument()
      })
    })

    it('updates when files change', () => {
      const { rerender } = render(
        <VirtualFileList files={generateFiles(10)} height={400} itemSize={40} />
      )

      expect(screen.getByText('file-0.txt')).toBeInTheDocument()

      rerender(
        <VirtualFileList files={generateFiles(20)} height={400} itemSize={40} />
      )

      expect(screen.queryByText('file-15.txt')).toBeInTheDocument()
    })
  })

  describe('keyboard navigation', () => {
    it('supports arrow key navigation', async () => {
      const files = generateFiles(100)
      render(<VirtualFileList files={files} height={400} itemSize={40} />)

      await userEvent.tab()
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{ArrowDown}')

      expect(screen.getByText('file-2.txt').closest('[role="option"]')).toHaveFocus()
    })

    it('scrolls viewport when navigating to off-screen item', async () => {
      const files = generateFiles(100)
      render(<VirtualFileList files={files} height={400} itemSize={40} />)

      await userEvent.tab()

      for (let i = 0; i < 15; i++) {
        await userEvent.keyboard('{ArrowDown}')
      }

      expect(screen.getByText('file-15.txt')).toBeInTheDocument()
    })
  })
})
```

---

## Animation Tests

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'

// Mock Framer Motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, animate, initial, exit, ...props }: any) => (
      <div
        data-testid="motion-div"
        data-animate={JSON.stringify(animate)}
        data-initial={JSON.stringify(initial)}
        {...props}
      >
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
  useAnimation: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    set: vi.fn(),
  }),
  useReducedMotion: vi.fn(() => false),
}))

describe('AnimatedPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('core animations', () => {
    it('applies enter animation', () => {
      render(<AnimatedPanel isOpen />)

      const panel = screen.getByTestId('motion-div')
      expect(JSON.parse(panel.dataset.animate!)).toEqual({
        opacity: 1,
        x: 0,
      })
    })

    it('applies exit animation', () => {
      const { rerender } = render(<AnimatedPanel isOpen />)

      rerender(<AnimatedPanel isOpen={false} />)

      const panel = screen.getByTestId('motion-div')
      expect(JSON.parse(panel.dataset.animate!)).toEqual({
        opacity: 0,
        x: -100,
      })
    })

    it('calls onAnimationComplete after animation', () => {
      const onComplete = vi.fn()
      render(<AnimatedPanel isOpen onAnimationComplete={onComplete} />)

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(onComplete).toHaveBeenCalled()
    })
  })

  describe('reduced motion', () => {
    it('disables animations when prefers-reduced-motion', () => {
      vi.mocked(useReducedMotion).mockReturnValue(true)

      render(<AnimatedPanel isOpen />)

      const panel = screen.getByTestId('motion-div')
      expect(JSON.parse(panel.dataset.animate!)).toEqual({
        opacity: 1,
        x: 0,
      })
      expect(panel.dataset.transition).toBeUndefined()
    })

    it('respects system preference via matchMedia', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))

      render(<AnimatedPanel isOpen />)

      expect(screen.getByTestId('animated-panel')).toHaveAttribute(
        'data-reduced-motion',
        'true'
      )
    })
  })

  describe('edge cases', () => {
    it('handles rapid open/close', () => {
      const { rerender } = render(<AnimatedPanel isOpen={false} />)

      rerender(<AnimatedPanel isOpen />)
      rerender(<AnimatedPanel isOpen={false} />)
      rerender(<AnimatedPanel isOpen />)

      const panel = screen.getByTestId('motion-div')
      expect(JSON.parse(panel.dataset.animate!)).toEqual({
        opacity: 1,
        x: 0,
      })
    })

    it('handles unmount during animation', () => {
      const { unmount } = render(<AnimatedPanel isOpen />)

      act(() => {
        vi.advanceTimersByTime(100)
      })

      unmount()
      // No errors should occur
    })

    it('handles animation interrupt', () => {
      const { rerender } = render(<AnimatedPanel isOpen />)

      rerender(<AnimatedPanel isOpen={false} />)

      act(() => {
        vi.advanceTimersByTime(100)
      })

      rerender(<AnimatedPanel isOpen />)

      const panel = screen.getByTestId('motion-div')
      expect(JSON.parse(panel.dataset.animate!)).toEqual({
        opacity: 1,
        x: 0,
      })
    })
  })

  describe('CSS animations', () => {
    it('applies animation class', () => {
      render(<CSSAnimatedComponent animate />)

      expect(screen.getByTestId('animated')).toHaveClass('animate-slide-in')
    })

    it('removes animation class after completion', () => {
      render(<CSSAnimatedComponent animate />)

      const element = screen.getByTestId('animated')

      fireEvent.animationEnd(element)

      expect(element).not.toHaveClass('animate-slide-in')
    })
  })
})
```

---

## Performance Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, ProfilerOnRenderCallback } from 'react'

describe('Component performance', () => {
  let renderCount: number
  let renderPhases: string[]

  const onRender: ProfilerOnRenderCallback = (
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  ) => {
    renderCount++
    renderPhases.push(phase)
  }

  beforeEach(() => {
    renderCount = 0
    renderPhases = []
  })

  describe('render count', () => {
    it('renders once on mount', () => {
      render(
        <Profiler id="test" onRender={onRender}>
          <FileList files={mockFiles} />
        </Profiler>
      )

      expect(renderCount).toBe(1)
      expect(renderPhases).toEqual(['mount'])
    })

    it('does not re-render when unrelated props change', () => {
      const { rerender } = render(
        <Profiler id="test" onRender={onRender}>
          <FileList files={mockFiles} className="old" />
        </Profiler>
      )

      renderCount = 0
      renderPhases = []

      rerender(
        <Profiler id="test" onRender={onRender}>
          <FileList files={mockFiles} className="new" />
        </Profiler>
      )

      expect(renderCount).toBe(1)
    })

    it('re-renders only affected items when selection changes', async () => {
      const itemRenderCounts = new Map<string, number>()

      const TrackedFileItem = ({ file, isSelected }: any) => {
        itemRenderCounts.set(
          file.id,
          (itemRenderCounts.get(file.id) || 0) + 1
        )
        return <div>{file.name}</div>
      }

      render(<FileList files={mockFiles} ItemComponent={TrackedFileItem} />)

      itemRenderCounts.clear()

      await userEvent.click(screen.getByText('file1.txt'))

      expect(itemRenderCounts.get('1')).toBe(1)
      expect(itemRenderCounts.get('2')).toBeUndefined()
    })
  })

  describe('memoization', () => {
    it('memoizes expensive computations', () => {
      const expensiveCalc = vi.fn(() => mockFiles.map((f) => f.name.toUpperCase()))

      const { rerender } = render(
        <FileList files={mockFiles} transform={expensiveCalc} />
      )

      expect(expensiveCalc).toHaveBeenCalledTimes(1)

      rerender(<FileList files={mockFiles} transform={expensiveCalc} />)

      expect(expensiveCalc).toHaveBeenCalledTimes(1)
    })

    it('recalculates when dependencies change', () => {
      const expensiveCalc = vi.fn(() => mockFiles.map((f) => f.name.toUpperCase()))

      const { rerender } = render(
        <FileList files={mockFiles} transform={expensiveCalc} />
      )

      const newFiles = [...mockFiles, { id: '3', name: 'file3.txt' }]

      rerender(<FileList files={newFiles} transform={expensiveCalc} />)

      expect(expensiveCalc).toHaveBeenCalledTimes(2)
    })

    it('memoizes callbacks', async () => {
      const handleSelect = vi.fn()
      const callbackRefs: Function[] = []

      const TrackingItem = ({ onSelect }: any) => {
        callbackRefs.push(onSelect)
        return <button onClick={onSelect}>Select</button>
      }

      const { rerender } = render(
        <FileList
          files={mockFiles}
          onSelect={handleSelect}
          ItemComponent={TrackingItem}
        />
      )

      rerender(
        <FileList
          files={mockFiles}
          onSelect={handleSelect}
          ItemComponent={TrackingItem}
        />
      )

      expect(callbackRefs[0]).toBe(callbackRefs[1])
    })
  })

  describe('large datasets', () => {
    it('handles 1000 items without performance degradation', () => {
      const largeFiles = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        name: `file-${i}.txt`,
      }))

      const startTime = performance.now()

      render(<VirtualFileList files={largeFiles} />)

      const renderTime = performance.now() - startTime

      expect(renderTime).toBeLessThan(100)
    })

    it('handles rapid filtering without lag', async () => {
      const largeFiles = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        name: `file-${i}.txt`,
      }))

      render(<FilterableFileList files={largeFiles} />)

      const input = screen.getByRole('searchbox')

      const startTime = performance.now()

      await userEvent.type(input, 'file-50')

      const typeTime = performance.now() - startTime

      expect(typeTime / 7).toBeLessThan(50)
    })
  })
})
```

---

## Snapshot Tests

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

describe('Component snapshots', () => {
  describe('visual states', () => {
    it('matches default state snapshot', () => {
      const { container } = render(<Button>Click me</Button>)
      expect(container).toMatchSnapshot()
    })

    it('matches disabled state snapshot', () => {
      const { container } = render(<Button disabled>Click me</Button>)
      expect(container).toMatchSnapshot()
    })

    it('matches loading state snapshot', () => {
      const { container } = render(<Button loading>Click me</Button>)
      expect(container).toMatchSnapshot()
    })

    it('matches error state snapshot', () => {
      const { container } = render(<Input error="Invalid input" />)
      expect(container).toMatchSnapshot()
    })
  })

  describe('variants', () => {
    it.each(['primary', 'secondary', 'danger'] as const)(
      'matches %s variant snapshot',
      (variant) => {
        const { container } = render(<Button variant={variant}>Click</Button>)
        expect(container).toMatchSnapshot()
      }
    )

    it.each(['sm', 'md', 'lg'] as const)('matches %s size snapshot', (size) => {
      const { container } = render(<Button size={size}>Click</Button>)
      expect(container).toMatchSnapshot()
    })
  })

  describe('compositions', () => {
    it('matches complex form snapshot', () => {
      const { container } = render(
        <Form>
          <Input label="Name" />
          <Input label="Email" type="email" />
          <Button type="submit">Submit</Button>
        </Form>
      )
      expect(container).toMatchSnapshot()
    })
  })

  describe('inline snapshots', () => {
    it('renders correct structure', () => {
      const { container } = render(<IconButton icon="save" />)
      expect(container.innerHTML).toMatchInlineSnapshot()
    })
  })
})
```

---

## Type Shape Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

/**
 * Type definitions for Tauri commands
 *
 * VERIFIED against: src-tauri/src/commands.rs:45-80
 * Last verified: 2024-01-15
 */

interface FileEntry {
  id: string
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: string
  permissions?: {
    read: boolean
    write: boolean
    execute: boolean
  }
}

interface TauriError {
  error: string
  code: number
  details?: Record<string, unknown>
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

describe('Type Shape: Tauri Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('list_directory', () => {
    it('handles FileEntry[] response', async () => {
      const response: FileEntry[] = [
        {
          id: 'uuid-1',
          name: 'document.txt',
          path: '/home/user/document.txt',
          is_dir: false,
          size: 1024,
          modified: '2024-01-15T10:30:00Z',
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument()
        expect(screen.getByText('1 KB')).toBeInTheDocument()
      })
    })

    it('handles optional permissions field', async () => {
      const response: FileEntry[] = [
        {
          id: 'uuid-1',
          name: 'readonly.txt',
          path: '/readonly.txt',
          is_dir: false,
          size: 100,
          modified: '2024-01-15T10:30:00Z',
          permissions: { read: true, write: false, execute: false },
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByTestId('file-readonly.txt')).toHaveAttribute(
          'data-readonly',
          'true'
        )
      })
    })

    it('handles TauriError response', async () => {
      const error: TauriError = {
        error: 'Permission denied',
        code: 403,
        details: { path: '/root' },
      }

      vi.mocked(invoke).mockRejectedValueOnce(error)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
      })
    })

    it('handles empty array (vs null/undefined)', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([])
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText(/empty|no files/i)).toBeInTheDocument()
      })
    })
  })

  describe('paginated responses', () => {
    it('handles PaginatedResponse shape', async () => {
      const response: PaginatedResponse<FileEntry> = {
        items: [
          {
            id: '1',
            name: 'file.txt',
            path: '/file.txt',
            is_dir: false,
            size: 100,
            modified: '2024-01-15T10:30:00Z',
          },
        ],
        total: 100,
        page: 1,
        page_size: 20,
        has_more: true,
      }

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<PaginatedFileList />)

      await waitFor(() => {
        expect(screen.getByText('file.txt')).toBeInTheDocument()
        expect(screen.getByText(/1 of 100/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
      })
    })

    it('handles last page (has_more: false)', async () => {
      const response: PaginatedResponse<FileEntry> = {
        items: [
          {
            id: '1',
            name: 'last.txt',
            path: '/last.txt',
            is_dir: false,
            size: 100,
            modified: '2024-01-15T10:30:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        has_more: false,
      }

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<PaginatedFileList />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
      })
    })
  })

  describe('edge case shapes', () => {
    it('handles large file sizes (BigInt boundary)', async () => {
      const response: FileEntry[] = [
        {
          id: '1',
          name: 'huge.bin',
          path: '/huge.bin',
          is_dir: false,
          size: 9007199254740991,
          modified: '2024-01-15T10:30:00Z',
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText(/8 PB|8192 TB/)).toBeInTheDocument()
      })
    })

    it('handles unicode in string fields', async () => {
      const response: FileEntry[] = [
        {
          id: '1',
          name: '文档-émoji-🎉.txt',
          path: '/文档-émoji-🎉.txt',
          is_dir: false,
          size: 100,
          modified: '2024-01-15T10:30:00Z',
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(screen.getByText('文档-émoji-🎉.txt')).toBeInTheDocument()
      })
    })

    it('handles null optional fields', async () => {
      const response: FileEntry[] = [
        {
          id: '1',
          name: 'file.txt',
          path: '/file.txt',
          is_dir: false,
          size: 100,
          modified: '2024-01-15T10:30:00Z',
          permissions: undefined,
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(response)
      render(<FileExplorer />)

      await waitFor(() => {
        expect(
          screen.queryByTestId('permissions-indicator')
        ).not.toBeInTheDocument()
      })
    })
  })
})
```

---

## Tauri System API Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Tauri system APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
  readText: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
  Command: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    center: vi.fn(),
    onCloseRequested: vi.fn(),
  })),
  Window: vi.fn(),
}))

import { open, save, message, ask } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { getCurrentWindow } from '@tauri-apps/api/window'

describe('Tauri Dialog API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('file picker', () => {
    it('opens file picker and loads selected file', async () => {
      vi.mocked(open).mockResolvedValueOnce('/path/to/file.txt')
      vi.mocked(readTextFile).mockResolvedValueOnce('File content')

      render(<FileOpener />)

      await userEvent.click(screen.getByRole('button', { name: /open file/i }))

      expect(open).toHaveBeenCalledWith({
        multiple: false,
        filters: [{ name: 'Text', extensions: ['txt', 'md'] }],
      })

      await waitFor(() => {
        expect(screen.getByText('File content')).toBeInTheDocument()
      })
    })

    it('handles cancelled file picker', async () => {
      vi.mocked(open).mockResolvedValueOnce(null)

      render(<FileOpener />)

      await userEvent.click(screen.getByRole('button', { name: /open file/i }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('handles multiple file selection', async () => {
      vi.mocked(open).mockResolvedValueOnce(['/file1.txt', '/file2.txt'])

      render(<MultiFileOpener />)

      await userEvent.click(screen.getByRole('button', { name: /open files/i }))

      expect(open).toHaveBeenCalledWith({
        multiple: true,
        filters: expect.any(Array),
      })
    })
  })

  describe('save dialog', () => {
    it('saves file to selected location', async () => {
      vi.mocked(save).mockResolvedValueOnce('/path/to/saved.txt')
      vi.mocked(writeTextFile).mockResolvedValueOnce(undefined)

      render(<FileSaver content="Test content" />)

      await userEvent.click(screen.getByRole('button', { name: /save as/i }))

      expect(save).toHaveBeenCalledWith({
        defaultPath: expect.any(String),
        filters: expect.any(Array),
      })

      await waitFor(() => {
        expect(writeTextFile).toHaveBeenCalledWith(
          '/path/to/saved.txt',
          'Test content'
        )
      })
    })

    it('handles save cancellation', async () => {
      vi.mocked(save).mockResolvedValueOnce(null)

      render(<FileSaver content="Test" />)

      await userEvent.click(screen.getByRole('button', { name: /save as/i }))

      expect(writeTextFile).not.toHaveBeenCalled()
    })
  })

  describe('message dialogs', () => {
    it('shows confirmation dialog before delete', async () => {
      vi.mocked(ask).mockResolvedValueOnce(true)
      const onDelete = vi.fn()

      render(<DeleteButton onDelete={onDelete} />)

      await userEvent.click(screen.getByRole('button', { name: /delete/i }))

      expect(ask).toHaveBeenCalledWith(
        'Are you sure you want to delete this file?',
        { title: 'Confirm Delete', kind: 'warning' }
      )

      expect(onDelete).toHaveBeenCalled()
    })

    it('cancels delete when user declines', async () => {
      vi.mocked(ask).mockResolvedValueOnce(false)
      const onDelete = vi.fn()

      render(<DeleteButton onDelete={onDelete} />)

      await userEvent.click(screen.getByRole('button', { name: /delete/i }))

      expect(onDelete).not.toHaveBeenCalled()
    })

    it('shows error message dialog', async () => {
      vi.mocked(writeTextFile).mockRejectedValueOnce(new Error('Disk full'))

      render(<FileSaver content="Test" path="/file.txt" />)

      await userEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(message).toHaveBeenCalledWith('Failed to save: Disk full', {
          title: 'Error',
          kind: 'error',
        })
      })
    })
  })
})

describe('Tauri FS API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('file operations', () => {
    it('reads file content', async () => {
      vi.mocked(readTextFile).mockResolvedValueOnce('Hello World')

      render(<FileViewer path="/test.txt" />)

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument()
      })
    })

    it('handles file not found', async () => {
      vi.mocked(readTextFile).mockRejectedValueOnce({ code: 'NOT_FOUND' })

      render(<FileViewer path="/missing.txt" />)

      await waitFor(() => {
        expect(screen.getByText(/file not found/i)).toBeInTheDocument()
      })
    })

    it('writes file content', async () => {
      vi.mocked(writeTextFile).mockResolvedValueOnce(undefined)

      render(<FileEditor path="/test.txt" />)

      await userEvent.type(screen.getByRole('textbox'), 'New content')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))

      expect(writeTextFile).toHaveBeenCalledWith('/test.txt', 'New content')
    })

    it('checks if file exists before overwrite', async () => {
      vi.mocked(exists).mockResolvedValueOnce(true)
      vi.mocked(ask).mockResolvedValueOnce(true)
      vi.mocked(writeTextFile).mockResolvedValueOnce(undefined)

      render(<FileCreator />)

      await userEvent.type(screen.getByLabelText(/filename/i), 'existing.txt')
      await userEvent.click(screen.getByRole('button', { name: /create/i }))

      expect(exists).toHaveBeenCalledWith('existing.txt')
      expect(ask).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        expect.any(Object)
      )
    })
  })
})

describe('Tauri Clipboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies text to clipboard', async () => {
    vi.mocked(writeText).mockResolvedValueOnce(undefined)

    render(<CopyButton text="Copy me" />)

    await userEvent.click(screen.getByRole('button', { name: /copy/i }))

    expect(writeText).toHaveBeenCalledWith('Copy me')
    expect(screen.getByText(/copied/i)).toBeInTheDocument()
  })

  it('reads from clipboard', async () => {
    vi.mocked(readText).mockResolvedValueOnce('Pasted content')

    render(<PasteButton />)

    await userEvent.click(screen.getByRole('button', { name: /paste/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Pasted content')).toBeInTheDocument()
    })
  })

  it('handles empty clipboard', async () => {
    vi.mocked(readText).mockResolvedValueOnce('')

    render(<PasteButton />)

    await userEvent.click(screen.getByRole('button', { name: /paste/i }))

    await waitFor(() => {
      expect(screen.getByText(/clipboard empty/i)).toBeInTheDocument()
    })
  })
})

describe('Tauri Shell API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens URL in browser', async () => {
    vi.mocked(shellOpen).mockResolvedValueOnce(undefined)

    render(<ExternalLink href="https://example.com">Visit</ExternalLink>)

    await userEvent.click(screen.getByRole('link', { name: /visit/i }))

    expect(shellOpen).toHaveBeenCalledWith('https://example.com')
  })

  it('opens file in default application', async () => {
    vi.mocked(shellOpen).mockResolvedValueOnce(undefined)

    render(<OpenInApp path="/document.pdf" />)

    await userEvent.click(screen.getByRole('button', { name: /open in/i }))

    expect(shellOpen).toHaveBeenCalledWith('/document.pdf')
  })
})

describe('Tauri Window API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates window title', async () => {
    const mockWindow = getCurrentWindow()

    render(<TitleUpdater title="New Title" />)

    await waitFor(() => {
      expect(mockWindow.setTitle).toHaveBeenCalledWith('New Title')
    })
  })

  it('handles close request with unsaved changes', async () => {
    const mockWindow = getCurrentWindow()
    let closeHandler: Function

    vi.mocked(mockWindow.onCloseRequested).mockImplementation((handler) => {
      closeHandler = handler
      return Promise.resolve(() => {})
    })

    vi.mocked(ask).mockResolvedValueOnce(false)

    render(<EditorWithUnsavedChanges />)

    await closeHandler!({ preventDefault: vi.fn() })

    expect(ask).toHaveBeenCalledWith(
      expect.stringContaining('unsaved changes'),
      expect.any(Object)
    )
  })
})
```

---

## Tauri Event Listener Mock

```typescript
import type { Event, EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import { act } from '@testing-library/react';

type Handler<T> = EventCallback<T>;

const eventHandlers = new Map<string, Set<Handler<unknown>>>();

vi.mocked(listen).mockImplementation(
  async <T>(event: string, handler: Handler<T>): Promise<UnlistenFn> => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event)!.add(handler as Handler<unknown>);

    return () => {
      eventHandlers.get(event)?.delete(handler as Handler<unknown>);
    };
  }
);

export async function triggerTauriEvent<T>(event: string, payload: T): Promise<void> {
  await act(async () => {
    const handlers = eventHandlers.get(event);
    if (handlers) {
      const eventData: Event<T> = {
        payload,
        id: Date.now(),
        event,
      };
      handlers.forEach((h) => h(eventData as Event<unknown>));
    }
  });
}
```

---

## Composable Tauri Invoke Mock

```typescript
import { vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const commandMocks = new Map<string, unknown>();

export function mockCommand(cmd: string, response: unknown | Error): void {
  commandMocks.set(cmd, response);
}

export function clearCommandMocks(): void {
  commandMocks.clear();
}

vi.mocked(invoke).mockImplementation(async (cmd: string) => {
  if (commandMocks.has(cmd)) {
    const response = commandMocks.get(cmd);
    if (response instanceof Error) throw response;
    return response;
  }
  throw new Error(`Unmocked command: ${cmd}`);
});
```
