# CLAUDE.md - Shared Frontend Code

> **Parent:** See [`../../CLAUDE.md`](../../CLAUDE.md) for monorepo-wide guidance.

## Overview

Shared frontend utilities used by all apps (agent, Canvas-UI-Builder, editor). This is a **real Bun workspace package** (`@orbit/common`) with explicit exports — not just a directory.

## Exports

| Path                         | Exports                                                                            | Used By                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@orbit/common/lib`          | `createLogger`, `Logger`, log levels                                               | **Everywhere** — stores, hooks, components, services, stress tests |
| `@orbit/common/utils`        | `cn()` (clsx + tailwind-merge)                                                     | Any component with conditional class names                         |
| `@orbit/common/testing`      | `createMockInvoke()`, `mockTauriCommand()`, `resetTauriMocks()`                    | Vitest test setup (`vitest.setup.ts`)                              |
| `@orbit/common/hooks/canvas` | `useCanvas()`                                                                      | Canvas-UI-Builder app (Tauri canvas agent integration)             |
| `@orbit/common/types/canvas` | `CanvasPositionSchema`, `CanvasNodeTypeSchema`, `PageLayoutSchema`, viewport enums | Canvas types and Zod schemas                                       |

## Logger

The structured logger is the most heavily used export. Every app uses it instead of `console.*`:

```typescript
import { createLogger } from '@orbit/common/lib';
const logger = createLogger('MyComponent');

logger.debug('Dev-only', { data: 42 }); // Filtered in production
logger.info('Operational message'); // Always shown
logger.warn('Potential issue'); // Always shown
logger.error('Failed', new Error('x')); // Stack trace included
```

Output format: `[MyComponent] message` with structured JSON metadata.

## Sentry Integration

`@orbit/common/lib` also exports Sentry configuration:

- `SENTRY_DSN` — DSN string
- `getSentryConfig()` — environment-aware config
- `isDev` / `getAppVersion()` — runtime detection helpers

## Testing Utilities

`@orbit/common/testing` provides Tauri mock helpers used in `vitest.setup.ts`:

```typescript
import { createMockInvoke, resetTauriMocks } from '@orbit/common/testing';

beforeEach(() => resetTauriMocks());
```

These mock `@tauri-apps/api/core` invoke calls so frontend tests run without a Tauri backend.

## Adding New Shared Code

1. Add to appropriate subdirectory (`lib/`, `utils/`, `hooks/`, `types/`, `testing/`)
2. Export from subdirectory's `index.ts`
3. Add export path mapping in `package.json` `exports` field
4. Import using `@orbit/common/<path>` from any app
