# Fix: Slash command picker not refreshed after marketplace install

## Context

After installing a marketplace skill, it appears in the Skills dialog's Installed tab immediately, but does NOT appear in the slash command picker (`/` popover) until the app is restarted.

**Root cause**: The slash command popover reads from `useCommandsStore` which has two cached lists: `commands` and `skills`. Both are fetched once at startup and guarded by `hasFetched` / `hasSkillsFetched` flags. After a marketplace install, the `onInstalled` callback in `SkillsDialog.tsx` only bumps `installedRefreshToken` (which re-queries the InstalledSkillsPane via `skills:list`). It never tells `commandsStore` to re-scan.

The store already has a `refreshCommands()` method (bypasses `hasFetched`) but no equivalent `refreshSkills()`. And neither is called after install.

## Fix

### 1. Add `refreshSkills` to commands store

**File**: `apps/agent/src/stores/agent/commands-store.ts`

Add a `refreshSkills` action that mirrors `refreshCommands` — including `isLoading` toggle and **request sequencing** to prevent stale responses from overwriting newer data during rapid installs.

Interface addition:

```typescript
/** Force refresh skills (ignores cache, sequenced to prevent stale overwrites) */
refreshSkills: () => Promise<void>;
```

New state field:

```typescript
/** Monotonic counter — only the latest refresh response can commit */
skillsRefreshSeq: 0,
```

Implementation:

```typescript
refreshSkills: async () => {
  const refreshSeq = get().skillsRefreshSeq + 1;
  set((draft) => {
    draft.skillsRefreshSeq = refreshSeq;
    draft.isLoading = true;
    draft.error = null;
  });

  try {
    const workspacePath = await getWorkspacePathSafe();
    const skills = await fetchSkillsFromBackend(workspacePath);

    logger.info(`Skills refreshed successfully (${String(skills.length)} skills)`);

    set((draft) => {
      // Only commit if no newer refresh was issued while we awaited
      if (draft.skillsRefreshSeq !== refreshSeq) return;
      draft.skills = skills;
      draft.isLoading = false;
      draft.hasSkillsFetched = true;
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to refresh skills';
    logger.warn(`Failed to refresh skills: ${errorMessage}`);

    set((draft) => {
      if (draft.skillsRefreshSeq !== refreshSeq) return;
      draft.isLoading = false;
      // Skills are non-critical — don't set error to avoid blocking command UI
    });
  }
},
```

> **Why request sequencing?** Rapid sequential installs (install A → install B) each
> trigger `refreshSkills()`. Without sequencing, the slower response from A can finish
> last and overwrite B's newer result. The `skillsRefreshSeq` counter (modeled after
> `MarketplacePane.tsx:47-75`'s `requestSequenceRef` pattern) ensures only the latest
> response commits.

Add `refreshSkills` and `skillsRefreshSeq` to `CommandsState` interface.

### 2. Call `refreshSkills` after marketplace install

**File**: `apps/agent/src/components/modals/skills/SkillsDialog.tsx`

In the `onInstalled` callback (line 173):

```typescript
onInstalled={() => {
  setInstalledRefreshToken((current) => current + 1);
  void useCommandsStore.getState().refreshSkills();
}}
```

Add import for `useCommandsStore`.

> **Note**: Only `refreshSkills()` is needed — marketplace installs add skill files
> (`.claude/skills/` SKILL.md), not slash command definitions (`.claude/commands/`).
> Calling `refreshCommands()` would trigger an unnecessary IPC roundtrip returning
> identical data.

### 3. Add regression tests

Two test files covering both layers: store-level refresh + sequencing, and callback wiring from the install flow.

#### 3a. Store-level: `refreshSkills` + sequencing

**File**: `apps/agent/src/__tests__/unit/stores/agent/commands-store-refresh.test.ts` (new)

Tests the store action directly: refresh populates `useSlashCommands()`, and stale responses are dropped.

```typescript
import { act, renderHook } from '@testing-library/react';

import type { SkillDefinition } from '@/lib/api';

import { useCommandsStore, useSlashCommands } from '@/stores/agent';

const { mockListSkills, mockGetWorkspacePath } = vi.hoisted(() => ({
  mockListSkills: vi.fn<[string], Promise<SkillDefinition[]>>(),
  mockGetWorkspacePath: vi.fn<[], Promise<string | null>>().mockResolvedValue('/test'),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listSkills: mockListSkills,
    getWorkspacePath: mockGetWorkspacePath,
  };
});

describe('refreshSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommandsStore.setState({
      commands: [],
      skills: [],
      hasSkillsFetched: true,
      skillsRefreshSeq: 0,
      isLoading: false,
      error: null,
    });
  });

  it('updates useSlashCommands after refresh', async () => {
    const newSkill: SkillDefinition = {
      name: 'new-skill',
      description: 'A marketplace skill',
      source: 'user',
    };
    mockListSkills.mockResolvedValueOnce([newSkill]);

    const { result } = renderHook(() => useSlashCommands());
    expect(result.current.find((c) => c.name === 'new-skill')).toBeUndefined();

    await act(async () => {
      await useCommandsStore.getState().refreshSkills();
    });

    expect(result.current.find((c) => c.name === 'new-skill')).toBeDefined();
    expect(result.current.find((c) => c.name === 'new-skill')?.kind).toBe('skill');
  });

  it('drops stale response when a newer refresh is issued', async () => {
    const skillA: SkillDefinition = { name: 'skill-a', description: 'A', source: 'user' };
    const skillB: SkillDefinition = { name: 'skill-b', description: 'B', source: 'user' };

    // First call is slow (manually controlled), second resolves immediately
    let resolveFirst = (_v: SkillDefinition[]): void => {};
    const firstPromise = new Promise<SkillDefinition[]>((resolve) => {
      resolveFirst = resolve;
    });
    mockListSkills.mockReturnValueOnce(firstPromise).mockResolvedValueOnce([skillB]);

    // Fire both refreshes — second overtakes first
    const first = useCommandsStore.getState().refreshSkills();
    const second = useCommandsStore.getState().refreshSkills();

    // Second resolves first
    await second;

    // First resolves later with older data
    resolveFirst([skillA]);
    await first;

    // Store should have skill-b (latest), not skill-a (stale)
    const { skills } = useCommandsStore.getState();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('skill-b');
  });
});
```

#### 3b. Callback wiring: `SkillsDialog` → `refreshSkills`

**File**: `apps/agent/src/__tests__/unit/components/modals/skills/SkillsDialog-refresh.test.tsx` (new)

Renders `SkillsDialog` with mocked child panes, captures the `onInstalled` prop passed to `MarketplacePane`, invokes it, and asserts `refreshSkills()` was called on the commands store. This tests the actual JSX wiring — not a manual reproduction of the callback body.

```typescript
import { render, waitFor } from '@testing-library/react';

import type { FC } from 'react';

import { useCommandsStore } from '@/stores/agent';

// ── Capture the onInstalled prop passed to MarketplacePane ──────────

interface CapturedMarketplaceProps {
  active: boolean;
  search: string;
  onInstalled: () => void;
}

let capturedOnInstalled: (() => void) | undefined;

const { mockRefreshSkills } = vi.hoisted(() => ({
  mockRefreshSkills: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
}));

// Mock MarketplacePane — captures onInstalled prop for later invocation
vi.mock('@/components/modals/skills/MarketplacePane', () => ({
  MarketplacePane: ((props: CapturedMarketplaceProps) => {
    capturedOnInstalled = props.onInstalled;
    return <div data-testid="marketplace-pane" />;
  }) as FC<CapturedMarketplaceProps>,
}));

// Mock InstalledSkillsPane — lightweight stub
vi.mock('@/components/modals/skills/InstalledSkillsPane', () => ({
  InstalledSkillsPane: (() => <div data-testid="installed-pane" />) as FC,
}));

// Mock Radix Dialog to render children without portal/overlay complexity
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContentGlass: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/lib/events/chat-context-events', () => ({
  dispatchAddContextChip: vi.fn(),
}));

import { SkillsDialog } from '@/components/modals/skills/SkillsDialog';

describe('SkillsDialog onInstalled wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnInstalled = undefined;

    // Inject spy into store
    useCommandsStore.setState({ refreshSkills: mockRefreshSkills });
  });

  it('calls refreshSkills on the commands store when MarketplacePane fires onInstalled', async () => {
    render(<SkillsDialog open onOpenChange={vi.fn()} />);

    // MarketplacePane was rendered (hidden, but mounted) — prop should be captured
    expect(capturedOnInstalled).toBeDefined();

    // Invoke the callback as MarketplacePane would after a successful install
    capturedOnInstalled?.();

    await waitFor(() => {
      expect(mockRefreshSkills).toHaveBeenCalledTimes(1);
    });
  });
});
```

> **Why this works**: `SkillsDialog` mounts both panes simultaneously (hidden via CSS
> `display: none`, not conditional rendering). So even though the Installed tab is
> active by default, `MarketplacePane` is rendered and our mock captures `onInstalled`.
> Invoking it exercises the real callback closure from `SkillsDialog.tsx:173`.

### Reactive chain

`refreshSkills` updates `draft.skills` → Zustand emits new reference → `useSlashCommands()` selector recomputes via `useMemo([commands, skills])` → slash popover re-renders with new skill.

## Files to Modify

| File                                                                                   | Change                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/agent/src/stores/agent/commands-store.ts`                                        | Add `refreshSkills` action + `skillsRefreshSeq` state + types          |
| `apps/agent/src/components/modals/skills/SkillsDialog.tsx`                             | Call `refreshSkills()` in `onInstalled`, add `useCommandsStore` import |
| `apps/agent/src/__tests__/unit/stores/agent/commands-store-refresh.test.ts`            | New: store-level refresh + sequencing test                             |
| `apps/agent/src/__tests__/unit/components/modals/skills/SkillsDialog-refresh.test.tsx` | New: callback wiring test (install → refreshSkills)                    |

## Edge Cases

- **Rapid sequential installs (ADDRESSED)**: Request sequencing via `skillsRefreshSeq` ensures only the latest response commits, matching `MarketplacePane`'s proven `requestSequenceRef` pattern.
- **Filesystem write vs. read timing**: `onInstalled` fires after `installMarketplaceSkill` resolves, but `agent_list_skills` must do a fresh directory scan (not a cached listing) to pick up the new file.
- **Dialog closed mid-refresh**: The `void` fire-and-forget is safe — Zustand stores are global singletons, so the update persists regardless of component lifecycle.
- **Duplicate skill names across sources**: Slash picker keys by `skill-${cmd.name}` — same-name project + personal skills can collide. Out of scope for this fix; tracked as follow-up.
- **No-workspace fallback mismatch**: `skill-handlers.ts` falls back to `'/'` while `commands-store.ts` uses `''`. Non-blocking for this fix but should be standardized in a follow-up.
- **Workspace switch after initial fetch**: `hasSkillsFetched` is global with no invalidation on workspace change. Out of scope; tracked as follow-up.

## Verification

1. `bun run typecheck` — TypeScript passes
2. `bun run lint` — ESLint passes
3. `bun run test` — New regression test passes (including stale-response sequencing test)
4. **Manual test**: Install marketplace skill → slash command picker should immediately show the new skill without restart
