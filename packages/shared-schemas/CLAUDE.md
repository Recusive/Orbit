# CLAUDE.md - Shared Schemas

> **Parent:** See [`../../CLAUDE.md`](../../CLAUDE.md) for monorepo-wide guidance.

## Overview

Centralized Zod schemas shared between the agent-bridge sidecar and all frontend apps. This is a **real Bun workspace package** (`@orbit/shared-schemas`) — changes here affect every consumer.

## Schema Domains

| Directory     | Key Schemas                                                                                                             | Purpose                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **agent/**    | `ModelSchema`, `ThinkingModeSchema`, `EffortLevelSchema`, `InputModeSchema`, `AgentPhaseSchema`, `TaskStatusSchema`     | AI model selection, thinking modes, agent lifecycle states  |
| **sdk/**      | `SDKUsageSchema`, `SDKTextBlockSchema`, `SDKThinkingBlockSchema`, `SDKToolUseBlockSchema`, stream events, message types | Claude Agent SDK message validation (15+ schemas)           |
| **settings/** | `EditorSettingsSchema`, `TerminalSettingsSchema`, `UIPreferencesSchema`, `AgentSettingsSchema`                          | App configuration (font, theme, scrollback, approval modes) |
| **file/**     | `FilePathSchema` (security-refined), `FileStatusSchema`, `FileDataSchema`                                               | Path validation, file status tracking                       |
| **terminal/** | `ShellTypeSchema`, `TerminalCapabilitiesSchema`                                                                         | Shell detection, terminal feature flags                     |
| **common/**   | `formatZodError()`, `getFieldErrors()`                                                                                  | Error formatting utilities                                  |

## Import Pattern

```typescript
import { ModelSchema, type Model } from '@orbit/shared-schemas';
import { FilePathSchema } from '@orbit/shared-schemas';
```

All schemas are re-exported from `src/index.ts`.

## Rules

- Use `.strict()` for all schemas — this is enforced project-wide for type safety
- Use `z.infer<typeof Schema>` to derive TypeScript types — never duplicate types manually
- Exception: use `.passthrough()` or `.loose()` for external API responses that may have extra fields
- `FilePathSchema` includes security refinements (path traversal prevention) — don't relax these

## Consumers

| Consumer                   | What it uses                                               |
| -------------------------- | ---------------------------------------------------------- |
| **agent-bridge**           | SDK schemas for message validation, model/thinking schemas |
| **apps/agent**             | Settings schemas, file schemas, agent phase/status         |
| **apps/Canvas-UI-Builder** | Agent schemas for canvas AI integration                    |

## Adding a New Schema

1. Create schema in the appropriate domain folder (or create a new folder)
2. Export from `src/index.ts`
3. Run `bun run typecheck` from root to verify all consumers still compile
4. If the schema validates data crossing the Rust boundary, ensure the Rust `serde` struct matches
