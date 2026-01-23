---
name: test-engineer
description: Write meaningful tests for TypeScript/React (Vitest) and Rust (cargo test) code.
---

# Test Engineer Skill

Write tests that fail when implementation breaks. No placeholders, no `expect(true).toBe(true)`.

## Process

### Step 1: Read the File

Use `Read` tool to read the entire file. Identify:

- **Type**: React component, Zustand store, Zod schema, Rust module, Tauri command
- **Public API**: Exported functions, actions, props, methods
- **Dependencies**: Imports, external calls (Tauri invoke, APIs)
- **Middleware**: persist, immer, devtools (for Zustand stores)
- **Side effects**: API calls, state mutations, filesystem operations

### Step 2: Output Analysis (MANDATORY)

Before writing ANY test code, output:

```
## Analysis: [filename]

**Type:** [React Component | Zustand Store | Zod Schema | Rust Module | Tauri Command]
**Purpose:** [1-2 sentences]
**Middleware:** [persist | immer | none] (if Zustand)

**Public API:**
- `functionName`: [what it does]

**Test Scenarios:**
1. [Happy path]
2. [Edge case]
3. [Error case]

**Skip Testing:**
- [Any pass-through functions or trivial code]
```

### Step 3: Write Tests

See `references/templates.md` for framework-specific templates.

## Framework Selection

| File Type                        | Framework        | Mock Strategy                                     |
| -------------------------------- | ---------------- | ------------------------------------------------- |
| Zustand Store (`/stores/*.ts`)   | Vitest           | Mock `@tauri-apps/api/core` if store calls invoke |
| Zustand + persist                | Vitest           | Test `partialize` and `merge` callbacks           |
| React Component (`*.tsx`)        | Vitest + RTL     | Custom render with providers                      |
| Zod Schema (`/schemas/*.ts`)     | Vitest           | None needed                                       |
| Rust Module (`*.rs`)             | `cargo test`     | `tempfile` for filesystem                         |
| Tauri Command (`/commands/*.rs`) | `#[tokio::test]` | `tempfile`, real backend                          |

## Critical Rules

### 1. Every Assertion Must Be Meaningful

Before writing any assertion, ask: **"If I delete the implementation, will this fail?"**

- No → Delete the test or rewrite it
- Yes → Keep it

### 2. What NOT to Test

Skip these entirely:

- Pure re-exports or pass-through functions
- Type definitions and interfaces
- Constants (unless they affect behavior)
- Auto-generated code
- Private/internal functions (test through public API)
- **Logging statements** (don't test `logger.debug` was called)
- **Simple getters/setters** with no logic
- **Selector hooks** that just re-export store slices (e.g., `useInputMode = () => useStore(s => s.inputMode)`)
- **Third-party library wrappers** that add no logic

### 3. Test Behaviors, Not Implementation

```typescript
// BAD: Testing internal state shape
expect(store.getState()._internal.cache).toHaveLength(3);

// GOOD: Testing observable behavior
expect(store.getState().items).toHaveLength(3);
```

### 4. Coverage Requirements

For each public function, test:

- **Happy path**: Valid input → expected output
- **Edge cases**: Empty, null, undefined, boundaries, deduplication
- **Error cases**: Invalid input, failures, exceptions
- **Async** (if applicable): Loading states, error states, race conditions

For Zustand stores with middleware:

- **persist**: Test `partialize` returns correct subset, `merge` handles corruption
- **Computed getters**: Test functions like `getContextPercentage()` with known inputs

### 5. Test Independence

- Reset state in `beforeEach`
- No shared mutable state between tests
- Each test must pass when run alone

**Zustand Reset Pattern:**

```typescript
beforeEach(() => {
  // Prefer reset() if the store exports it
  const store = useStore;
  const state = store.getState();
  if ('reset' in state && typeof state.reset === 'function') {
    state.reset();
  } else if (typeof store.getInitialState === 'function') {
    // Zustand v5: restores full initial state including actions
    store.setState(store.getInitialState(), true);
  } else {
    // Last resort: reset known fields WITHOUT replace (avoid dropping actions)
    store.setState({
      items: [],
      isLoading: false,
      error: null,
    });
  }
  vi.clearAllMocks();
});
```

**Important:** Do NOT use `setState(partial, true)` unless you're passing the full
initial state including actions. Replacing with a partial object will drop
actions and break the store.

**Immer + Set/Map:** If the store uses `Set` or `Map` with immer middleware, add at top of test file:

```typescript
import { enableMapSet } from 'immer';
enableMapSet();
```

## Anti-Patterns (Never Do These)

See `references/anti-patterns.md` for detailed examples.

```typescript
// NEVER: Always-passing assertion
it('should work', () => {
  const store = useStore.getState();
  expect(store).toBeDefined(); // Passes even if store is broken
});

// NEVER: Testing implementation details
it('should set internal flag', () => {
  action();
  expect(store.getState()._hasLoaded).toBe(true);
});

// NEVER: Placeholder test
it('should handle edge cases', () => {
  // TODO: implement
});
```

## Tauri-Specific Patterns

See `references/tauri-mocks.md` for composable mock patterns.

**Key principle:** Only mock Tauri if the code under test calls `invoke` directly. Many Zustand stores don't.

**Composable invoke mock (accumulates, doesn't overwrite):**

```typescript
import { vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// In test setup file - creates composable mock
const commandMocks = new Map<string, unknown>();

export function mockCommand(cmd: string, response: unknown | Error) {
  commandMocks.set(cmd, response);
}

export function clearCommandMocks() {
  commandMocks.clear();
}

// Set up once globally
vi.mocked(invoke).mockImplementation(async (cmd: string) => {
  if (commandMocks.has(cmd)) {
    const response = commandMocks.get(cmd);
    if (response instanceof Error) throw response;
    return response;
  }
  throw new Error(`Unmocked command: ${cmd}`);
});
```

## React Testing Library Query Guide

Use the right query for the situation:

| Query Type | When to Use               | Throws if Missing?  |
| ---------- | ------------------------- | ------------------- |
| `getBy*`   | Element should exist NOW  | Yes                 |
| `findBy*`  | Element will appear ASYNC | Yes (after timeout) |
| `queryBy*` | Element might NOT exist   | No (returns null)   |

```typescript
// Element exists synchronously
expect(screen.getByRole('button')).toBeInTheDocument();

// Element appears after async operation
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
// OR
const button = await screen.findByRole('button', { name: 'Submit' });

// Assert element does NOT exist
expect(screen.queryByText('Error')).not.toBeInTheDocument();
```

## Custom Render with Providers

Most components need providers. Create a custom render:

```typescript
// src/test/utils.tsx
import { render, type RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@/providers/theme-provider'

const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    {children}
  </ThemeProvider>
)

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }
```

## Self-Check Before Finishing

- [ ] Every test has meaningful assertion that tests real behavior
- [ ] No `expect(true).toBe(true)` or `expect(x).toBeDefined()` without follow-up
- [ ] No placeholder/TODO tests
- [ ] All public API covered
- [ ] Edge cases tested (empty, null, boundaries, deduplication)
- [ ] Error cases tested
- [ ] State reset in `beforeEach` (using `reset()` or manual setState)
- [ ] Tests independent (no shared mutable state)
- [ ] Middleware tested if applicable (persist partialize/merge)
- [ ] Computed getters tested if they have logic

## Running Tests

**Frontend Apps (Vitest):**

```bash
bun run test                                 # Run all frontend tests
bun run test apps/agent/src/path/to/test.ts  # Run specific file
bun run test:watch                           # Watch mode
bun run test:coverage                        # With coverage report
```

> **Note:** Uses Vitest with jsdom for DOM/React testing. Config: `vitest.config.ts`

**agent-bridge (Bun Test):**

```bash
cd agent-bridge && bun test                  # Bun runtime tests (no jsdom)
```

**Rust Backend (Cargo):**

```bash
cargo test                                   # Run all Rust tests
cargo test test_function_name                # Run specific test
cargo test -- --nocapture                    # Show println! output
```
