# Test Organization

This directory contains all tests for the Agent app, organized by **test type first**, then by **source folder structure**.

## Directory Structure

```text
__tests__/
├── unit/           # Isolated tests with mocked dependencies
│   ├── components/ # React component tests
│   ├── hooks/      # Custom hook tests
│   └── stores/     # Zustand store tests
│
├── integration/    # Tests verifying multiple modules work together
│   └── hooks/      # Hook integration tests
│
└── e2e/            # End-to-end tests (future)
```

## Test Types

### Unit Tests (`unit/`)

**Purpose:** Test a single module in isolation with all dependencies mocked.

**Characteristics:**

- Fast execution (< 100ms per test)
- No external dependencies (file system, network, etc.)
- Mock everything except the unit under test
- Run on every commit

**Example:** Store tests that mock localStorage, component tests with mocked props.

```typescript
// unit/stores/ui/ui-store.test.ts
// Mocks localStorage, tests store logic in isolation
```

### Integration Tests (`integration/`)

**Purpose:** Test how multiple modules work together.

**Characteristics:**

- Uses real implementations where possible
- Mocks only external boundaries (Tauri, network)
- Tests full behavior flows
- Slower than unit tests

**Example:** Hook tests that use real stores but mock Tauri communication.

```typescript
// integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx
// Uses real UIStore, mocks Tauri postMessage
```

### E2E Tests (`e2e/`)

**Purpose:** Test complete user workflows through the actual application.

**Characteristics:**

- Tests real user scenarios
- May use real backend (Tauri)
- Slowest to execute
- Run on PRs and before release

## Naming Conventions

| Source File                 | Test File                             |
| --------------------------- | ------------------------------------- |
| `components/chat/Input.tsx` | `unit/components/chat/Input.test.tsx` |
| `hooks/ui/use-search.ts`    | `unit/hooks/ui/use-search.test.ts`    |
| `stores/ui/ui-store.ts`     | `unit/stores/ui/ui-store.test.ts`     |

## File Structure Rules

1. **Mirror source structure** - Test paths should mirror the source paths under `unit/` or `integration/`
2. **One test file per source file** - Keep tests focused
3. **Collocate test utils** - Put test helpers in `__tests__/utils/` if shared

## Running Tests

```bash
# Run all tests
bun run test

# Run only unit tests
bun run test unit/

# Run only integration tests
bun run test integration/

# Run tests in watch mode
bun run test:watch

# Run with coverage
bun run test:coverage
```

## Adding New Tests

### Where to put a new test?

Ask yourself:

1. **Does it test a single function/component in isolation?** → `unit/`
2. **Does it test how multiple modules work together?** → `integration/`
3. **Does it test a complete user workflow?** → `e2e/`

### Creating a new test file

1. Create the file mirroring the source structure:

   ```text
   src/stores/git/git-store.ts
   → __tests__/unit/stores/git/git-store.test.ts
   ```

2. Add the test type marker in the docstring:

   ```typescript
   /**
    * Unit tests for git-store.ts
    *
    * Tests: Git state management, branch operations
    * Mocks: localStorage, Tauri commands
    */
   ```

## Common Patterns

### Mocking Tauri

```typescript
vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: vi.fn(),
    isConnected: true,
    isMockMode: true,
  }),
}));
```

### Testing Zustand Stores

```typescript
import { useUIStore } from '@/stores/ui/ui-store';

beforeEach(() => {
  // Reset store between tests
  useUIStore.getState().reset();
});
```

### Testing Components with Context

```typescript
function TestWrapper({ children }: { readonly children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

render(<MyComponent />, { wrapper: TestWrapper });
```
