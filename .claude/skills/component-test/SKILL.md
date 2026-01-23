---
name: component-test
description: Generate production-grade Vitest tests from HTML elements captured in DevTools. Two-phase workflow (analysis → generation) with edge case discovery.
---

# Component Test Generator

Generate tests for React components, hooks, and contexts by analyzing source code. This skill locates targets, discovers edge cases, and produces production-grade Vitest tests.

**Usage:** `/component-test` then provide one of:

- HTML element from DevTools
- Hook name (e.g., `useFileOperations`)
- Context name (e.g., `ThemeContext`)
- File path (e.g., `src/components/FileExplorer/index.tsx`)

## Technology Stack

- **Testing:** Vitest + React Testing Library
- **State:** Zustand for state management
- **Backend:** Tauri 2 for commands, events, and system APIs
- **Types:** TypeScript throughout
- **Routing:** React Router or TanStack Router (detect from imports)
- **Possible:** ReactFlow, dnd-kit, react-window, Framer Motion

## Two-Phase Workflow

### Phase 1: Analysis

Identify target, read code, classify, discover edge cases, plan tests.
**Output analysis and wait for user to reply "proceed".**

### Phase 2: Generation

Write test files based on approved plan, including edge case coverage.

---

## Phase 1: Analysis Instructions

### Step 1: Identify the Test Target

Determine what you're testing based on input:

| Input Type   | Target Type      | Search Strategy                                      |
| ------------ | ---------------- | ---------------------------------------------------- |
| HTML element | Component        | data-testid → id → unique text                       |
| Hook name    | Custom Hook      | grep for `export function use` or `export const use` |
| Context name | Context/Provider | grep for `createContext`                             |
| File path    | Direct           | Read file directly                                   |

If multiple files match or no match found, request clarification.

### Step 2: Read and Quote Behavior Code

Read the target file and its direct dependencies (custom hooks from `src/`, Zustand stores, contexts).

**Quote behavior-proving code based on target type:**

| Target Type | Quote                                                   |
| ----------- | ------------------------------------------------------- |
| Component   | useState, useEffect, store selector, conditional render |
| Hook        | Return value, internal state, effect dependencies       |
| Context     | Default value, Provider value computation               |
| Provider    | Children rendering, value memoization                   |

Skip third-party hooks and utility hooks (`useDebounce`, `useLocalStorage`).

### Step 3: Discover Edge Cases

**Read `references/edge-case-patterns.md` for comprehensive edge case lists by category.**

Analyze the code for edge cases. Check all applicable categories:

**Data Edge Cases:**

- Empty arrays/objects, null, undefined
- Single item vs multiple items
- Maximum lengths, large datasets
- Special characters (unicode, spaces, path separators)
- Numeric boundaries (0, negative, MAX_SAFE_INTEGER, NaN)
- Invalid/malformed data from backend

**State Edge Cases:**

- Initial state before data loads
- Loading states and transitions
- Error states and recovery
- Rapid state changes (double-clicks, debounce)
- Stale state after unmount

**Async Edge Cases:**

- Network failures / Tauri command rejections
- Slow responses (loading indicators, timeouts)
- Out-of-order responses
- Retry logic

**Interaction Edge Cases:**

- Disabled states
- Keyboard navigation boundaries
- Repeated rapid interactions
- Interaction during loading
- Touch vs mouse (if applicable)

**Accessibility Edge Cases:**

- Focus management (trap, restore, initial)
- Screen reader announcements
- Keyboard-only navigation
- Reduced motion preferences

**Router Edge Cases:**

- Direct URL access (deep linking)
- Back/forward navigation
- Route params (missing, malformed)
- Protected route redirects
- Concurrent navigation

**Drag and Drop Edge Cases:**

- Drop on invalid target
- Cancel mid-drag (Escape)
- Drag outside container
- Keyboard drag mode

**Virtualization Edge Cases:**

- Scroll to specific item
- Dynamic item heights
- Empty list, single item
- Rapid scrolling

**Animation Edge Cases:**

- Reduced motion preference
- Animation interrupt
- Unmount during animation

For each edge case found, note the relevant code line that handles it (or mark as unhandled).

### Step 4: Check Testability

Flag for refactoring if:

- Component >400 lines WITH `useEffect` calling external APIs AND >5 return statements
- `useEffect` with no dependency array that calls `setState`
- Store action called in render body (outside handler/effect)
- Imports from >3 different Zustand stores
- Hook does both data fetching AND UI state management
- Context Provider has >200 lines of logic

If flagged, output the specific `file:line` and suggest a concrete refactor.

### Step 5: Classify and Select Test Types

**Target Classifications:**

| Classification     | Criteria                                            |
| ------------------ | --------------------------------------------------- |
| PRESENTATIONAL     | No effects, no stores, no Tauri, props-only         |
| STATEFUL-SIMPLE    | Local state + effects, no Tauri/stores              |
| STATEFUL-CONNECTED | Uses Zustand stores, Tauri, or subscriptions        |
| CUSTOM-HOOK        | Exported hook (not component)                       |
| CONTEXT-PROVIDER   | createContext + Provider component                  |
| ROUTE-COMPONENT    | Rendered by router, uses route params/navigation    |
| VIRTUALIZED        | Uses react-window, tanstack-virtual, or similar     |
| DND-COMPONENT      | Uses dnd-kit, react-beautiful-dnd, or similar       |
| ANIMATED           | Uses Framer Motion, react-spring, or CSS animations |

**Test Type Selection:**

| Classification     | Default Tests  | Add When                                         |
| ------------------ | -------------- | ------------------------------------------------ |
| PRESENTATIONAL     | UNIT           | Add A11Y if interactive                          |
| STATEFUL-SIMPLE    | UNIT           | Add INTEGRATION for multi-step flows             |
| STATEFUL-CONNECTED | INTEGRATION    | Add UNIT for complex logic; TYPE SHAPE for Tauri |
| CUSTOM-HOOK        | HOOK           | Always                                           |
| CONTEXT-PROVIDER   | CONTEXT        | Add INTEGRATION if Provider has side effects     |
| ROUTE-COMPONENT    | ROUTE          | Add INTEGRATION for data loading                 |
| VIRTUALIZED        | VIRTUALIZATION | Add INTEGRATION for data                         |
| DND-COMPONENT      | DND            | Add INTEGRATION for state updates                |
| ANIMATED           | ANIMATION      | Add UNIT for non-animated logic                  |

**Additional Test Types (add when applicable):**

| Test Type    | Add When                                              |
| ------------ | ----------------------------------------------------- |
| A11Y         | Interactive elements, forms, modals, focus management |
| SNAPSHOT     | Stable UI components, design system components        |
| PERFORMANCE  | Components with frequent re-renders, large lists      |
| TAURI-SYSTEM | Uses dialog, fs, clipboard, shell, or window APIs     |

### Step 6: List Testable Behaviors

Format: `[Trigger] → [Expected outcome] → [Pattern: sync/async/cleanup/error/a11y]`

**Organize into groups:**

1. **Core Behaviors** — Primary happy-path functionality
2. **Edge Cases** — Boundary conditions by category
3. **Accessibility** — Focus, ARIA, keyboard navigation
4. **Performance** — Render counts, memoization (if applicable)

Mark edge cases with category: `[EDGE: data]`, `[EDGE: async]`, `[EDGE: a11y]`, etc.

**Fast Path:** For PRESENTATIONAL components <50 lines with ≤3 conditional renders, skip detailed analysis.

---

## Phase 2: Generate Tests

**Read `references/test-examples.md` for code templates and mock patterns for all test types.**

### File Locations

| Test Type   | Location                                                   |
| ----------- | ---------------------------------------------------------- |
| Unit        | `src/components/[path]/__tests__/[Name].unit.test.tsx`     |
| Integration | `src/components/[path]/__tests__/[Name].test.tsx`          |
| Hook        | `src/hooks/__tests__/[hookName].test.ts`                   |
| Context     | `src/contexts/__tests__/[Name].test.tsx`                   |
| A11y        | `src/components/[path]/__tests__/[Name].a11y.test.tsx`     |
| Route       | `src/routes/__tests__/[Name].test.tsx`                     |
| Type Shape  | `src/components/[path]/__tests__/[Name].types.test.tsx`    |
| Snapshot    | `src/components/[path]/__tests__/[Name].snapshot.test.tsx` |
| Performance | `src/components/[path]/__tests__/[Name].perf.test.tsx`     |

### Test Organization

```typescript
describe('TargetName', () => {
  describe('core functionality', () => {
    // happy path tests
  });

  describe('edge cases: [category]', () => {
    // boundary tests
  });

  describe('accessibility', () => {
    // a11y tests
  });

  describe('performance', () => {
    // render count, memoization tests
  });
});
```

### Validation Pass

Validate each test:

- [ ] Test type matches mocking strategy
- [ ] Classification rules followed
- [ ] Edge cases target specific documented boundaries
- [ ] A11y tests use correct queries and assertions
- [ ] Performance tests have clear thresholds

---

## Classification Enforcement

| Classification     | Must Use                     | Must Avoid                                  |
| ------------------ | ---------------------------- | ------------------------------------------- |
| PRESENTATIONAL     | getBy\*, sync assertions     | waitFor, findBy\*, store mocks, Tauri mocks |
| STATEFUL-SIMPLE    | Local state testing          | Tauri mocks, race condition tests           |
| STATEFUL-CONNECTED | Real stores, Tauri mocks     | Mocking stores                              |
| CUSTOM-HOOK        | renderHook, act              | Component rendering                         |
| CONTEXT-PROVIDER   | Provider wrapper, useContext | Direct state access                         |
| ROUTE-COMPONENT    | Memory router, navigation    | Direct component render                     |

---

## Required Imports

```typescript
// Core
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hooks
import { renderHook } from '@testing-library/react';

// Routing
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

// Accessibility
import { axe, toHaveNoViolations } from 'jest-axe';

// Performance
import { Profiler } from 'react';
```

---

## Phase 1 Output Format

```markdown
## Target Identified

[Type]: [Name] at [path]

## Behavior Code
```

├── file:line — "quoted code"
└── file:line — "quoted code"

```

## Dependencies
- Tauri: [commands/events or "None"]
- Stores: [stores or "None"]
- Contexts: [contexts or "None"]
- Router: [yes/no]

## Edge Cases Identified

| Category | Edge Case | Code Reference | Handled? |
|----------|-----------|----------------|----------|
| [cat] | [description] | [file:line or —] | ✓/? |

## Classification
[TYPE] — [justification]

## Test Types
[list with justification]

## Planned Files
[list with test type]

## Mock Requirements
[structured by category]

## Behaviors

### [TEST TYPE] — Core
1. [trigger] → [outcome] → [pattern]

### [TEST TYPE] — Edge Cases
N. [EDGE: category] [trigger] → [outcome] → [pattern]

### Accessibility (if applicable)
N. [trigger] → [outcome] → [a11y]

---
Phase 1 complete. Reply "proceed" to generate tests.
```

## Phase 2 Output Format

````markdown
## Validation

[✓/✗ for each test]

## Test Files

### [filename]

```typescript
[full code with organized describe blocks]
```
````

```

---

## References

- `references/edge-case-patterns.md` — Comprehensive edge cases by component/category type
- `references/test-examples.md` — Code templates for all test types (unit, integration, hook, context, a11y, router, DnD, virtualization, animation, performance, snapshot, Tauri system)
```
