# Skills Marketplace — Implementation Plan

## Context

Orbit's messaging framework (v4) lists "Skills marketplace integration (fork of skills.sh, browsable inside Orbit)" as a roadmap item. Currently the SkillsDialog only shows skills already installed on disk. This plan adds a **Marketplace tab** where users browse the full skills.sh directory, search by keyword, and install skills with one click — choosing project or personal scope.

**Data source discovered:** `https://skills.sh/api/search?q=<query>&limit=<n>` returns JSON:

```json
{
  "query": "react",
  "searchType": "fuzzy",
  "count": 50,
  "duration_ms": 18,
  "results": [
    {
      "id": "vercel-labs/agent-skills/vercel-react-best-practices",
      "skillId": "vercel-react-best-practices",
      "name": "vercel-react-best-practices",
      "installs": 190466,
      "source": "vercel-labs/agent-skills"
    }
  ]
}
```

**Install command:** `bunx skills add <source> --skill <skillId> -a claude-code -y [-g]`

- No `-g` → project scope (`.claude/skills/`)
- `-g` → personal/global scope (`~/.claude/skills/`)

**Key data model constraint:** Installed skills on disk (`SkillDefinition`) have `{name, description, source, triggers, filePath}` — NO marketplace `id` field. The marketplace API returns `{id, skillId, name, installs, source}`. These schemas do not overlap on a unique identifier, so an **install manifest** is needed to track which marketplace skills are installed.

**Manifest path (canonical):** `.claude/marketplace-installs.json` — co-located with skills themselves (`.claude/skills/`), consistent across both scopes:

- Project: `<workspace>/.claude/marketplace-installs.json`
- Personal: `~/.claude/marketplace-installs.json`

---

## Architecture

```
User clicks "Skills" → SkillsDialog opens → Two tabs: "Installed" | "Marketplace"

Marketplace tab:
  React → Tauri invoke('skills_marketplace_search') → Rust reqwest → skills.sh/api/search
  React → Tauri invoke('skills_marketplace_install') → Rust tokio::process::Command → bunx skills add

Install manifest:
  On successful install → Rust writes entry to .claude/marketplace-installs.json (per scope)
  On Marketplace tab load → Rust reads manifest → frontend shows "Installed" badges
```

Fetching happens in **Rust** (not frontend fetch) because:

- CSP `connect-src` doesn't include `skills.sh` — Rust's `reqwest` bypasses CSP entirely (CSP only governs WebView JS, not native code), so no CSP changes needed
- `reqwest` is already a dependency (used by canvas `download.rs`)
- Install command must run server-side anyway

---

## Files to Create

### 1. `src-tauri/src/commands/agent/marketplace.rs` — Rust Tauri commands

Three commands + managed state + input validation:

**`MarketplaceCache` — Tauri managed state**

- Struct wrapping `tokio::sync::RwLock<HashMap<String, CacheEntry>>` for search result caching
- Each `CacheEntry` holds `Vec<MarketplaceSkill>` + `Instant` created timestamp
- 5-minute TTL, keyed by `"{query}:{limit}"`
- Max 50 cache entries; evict oldest by insertion time on overflow (FIFO eviction, not true LRU)
- Registered via `.manage(MarketplaceCache::new())` in `lib.rs`
- Also holds a `Mutex<()>` install lock to serialize concurrent installs

**Input validation (all commands)**

- `scope`: strict enum match — only `"project"` or `"personal"`, reject all others
- `source`: regex `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` (owner/repo format)
- `skill_id`: regex `^[A-Za-z0-9_.-]+$`
- `limit`: clamped to `1..=100`, defaults to `50`
- Project scope with `None` workspace path → hard error (don't rely on UI disable state)

**`skills_marketplace_search(cache: State<'_, MarketplaceCache>, query: String, limit: Option<u32>)`**

- Validates and clamps `limit`
- Checks cache first; returns cached results if within TTL
- Calls `https://skills.sh/api/search?q={query}&limit={limit}` via `reqwest`
- Validates response JSON structure before deserializing (handle malformed/partial responses)
- Returns `Vec<MarketplaceSkill>` where each has: `id`, `skill_id`, `name`, `installs`, `source`
- Uses existing `reqwest::Client` pattern from `canvas/download.rs`

**`skills_marketplace_install(cache: State<'_, MarketplaceCache>, source: String, skill_id: String, scope: String, workspace_path: Option<String>)`**

- Validates `scope`, `source`, `skill_id` before proceeding
- For project scope: validates `workspace_path` is `Some`, exists, and is a directory
- Acquires install lock from `MarketplaceCache` to serialize concurrent installs
- Uses `augmented_bun_path()` shared utility for Bun-friendly PATH (see File to Modify #15)
- Resolves `bunx` only — **no `npx` fallback** (Bun-only policy per CLAUDE.md)
- Spawns via `tokio::process::Command` with `.env("PATH", augmented_bun_path())` and args passed as separate `.arg()` calls (no shell string interpolation)
- `-g` appended when `scope == "personal"`
- `cwd` set to `workspace_path` for project scope
- Returns `InstallResult { success: bool, error: Option<String>, installed_id: Option<String>, warnings: Option<Vec<String>> }`
- On success: writes `{marketplace_id, skill_id, source, scope, installed_at}` to install manifest
- If `bunx skills add` succeeds but manifest write fails: returns `success: true` with a warning in `warnings` (e.g. `"Skill installed but manifest update failed — badge may not appear until next install"`). UI shows a toast for warnings.
- 60-second timeout via `tokio::time::timeout`

**`skills_marketplace_installed(workspace_path: Option<String>)`**

- Reads install manifest(s) and returns `Vec<String>` of installed marketplace IDs
- Reads from project manifest (`<workspace>/.claude/marketplace-installs.json`) + personal manifest (`~/.claude/marketplace-installs.json`)
- Used by MarketplacePane to show "Installed" badges

> **Note on PATH resolution:** Tauri desktop apps on macOS inherit a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`). The existing function in `canvas/preview.rs:160-191` solves this but uses `":"` string joining which is Unix-only. Extract to a shared `pub(crate)` utility `augmented_bun_path()` in `path_utils.rs`, using `std::env::split_paths()` / `std::env::join_paths()` for platform-correct PATH separators. Both `preview.rs` and `marketplace.rs` import `augmented_bun_path()` from this shared utility.

> **Note on Bun-only policy:** Per CLAUDE.md and AGENTS.md, this project uses Bun exclusively. No `npx` fallback. If `bunx` is not found, return a clear error directing the user to install Bun.

### 2. `apps/agent/src/lib/api/marketplace.ts` — Frontend API layer + types

Thin Tauri invoke wrappers + `MarketplaceSkill` type definition:

```typescript
// Type defined here (not protocol.ts — this is an invoke return type, not a protocol message)
export interface MarketplaceSkill {
  readonly id: string;
  readonly skillId: string;
  readonly name: string;
  readonly installs: number;
  readonly source: string;
}

export interface MarketplaceInstallResult {
  readonly success: boolean;
  readonly error?: string;
  readonly installedId?: string;
  readonly warnings?: string[];
}

export function searchMarketplaceSkills(query: string, limit?: number): Promise<MarketplaceSkill[]>;
export function installMarketplaceSkill(
  source: string,
  skillId: string,
  scope: 'project' | 'personal',
  workspacePath?: string
): Promise<MarketplaceInstallResult>;
export function getInstalledMarketplaceIds(workspacePath?: string): Promise<string[]>;
```

### 3. `apps/agent/src/lib/utils/facehash-utils.ts` — Shared Facehash utilities

Extract duplicated Facehash animation code from `SkillsDialog.tsx` and `ProjectsDialog.tsx`:

- `OCTAGON_CLIP` constant
- `REST_FLAT` and `REST_TILT` transform constants
- `setFaceHover(e: React.MouseEvent, hovered: boolean)` function

Both dialogs and the new `MarketplaceSkillCard` import from here instead of duplicating.

### 4. `apps/agent/src/components/modals/skills/MarketplacePane.tsx` — Marketplace tab content

- Search input (debounced 300ms) that calls `searchMarketplaceSkills`
- Request sequencing via monotonic counter or `AbortController` — only the latest response mutates state (prevents stale-response overwrites from earlier, slower requests)
- Initial load: separate `useEffect` fires empty-query fetch on mount (not through debounce, to avoid wasted request if user types immediately)
- Marketplace effects gated on `activeTab === 'marketplace'` — prevents fetches when Installed tab is active
- Grid of `MarketplaceSkillCard` components
- Loading skeleton (reuse `SkillsSkeleton` pattern — extracted to shared location)
- Empty state for no results
- Error state with retry button for network failures (distinguishes "no results" from "network error")
- Cross-references installed skills via install manifest (`getInstalledMarketplaceIds()`) to show "Installed" badge — NOT by name matching (installed `SkillDefinition` has no marketplace `id`)
- Tracks `installingIds: Set<string>` in state to disable "Add" buttons during concurrent installs
- Mock mode guard: when `!IS_TAURI`, shows "Marketplace requires the desktop app" message instead of crashing

### 5. `apps/agent/src/components/modals/skills/MarketplaceSkillCard.tsx` — Individual skill card

- Facehash icon (octagon clip via shared `facehash-utils.ts`, seeded by skill name)
- Skill name (bold, `truncate` for overflow)
- Source repo (muted, `owner/repo`, `truncate` for overflow)
- Install count badge (formatted: "190.5K", "1.2M")
- "Add" button → opens scope popover (disabled when `installingIds` contains this skill)
- "Installed" badge (green, disabled) if already on disk
- Spinner state on button while installing

### 6. `apps/agent/src/components/modals/skills/ScopePopover.tsx` — Project vs Personal picker

- Radix Popover anchored to the "Add" button
- Two options: "Project" (folder icon) and "Personal" (user icon)
- Project disabled with tooltip when no workspace open
- Clicking an option triggers install + closes popover
- Shows spinner on the button while installing

### 7. `apps/agent/src/components/modals/skills/InstalledSkillsPane.tsx` — Extracted from current dialog

Move existing SkillRow + grouping + empty state logic out of SkillsDialog into this pane component. Same behavior, just extracted for the tab structure.

---

## Files to Modify

### 8. `src-tauri/src/commands/agent/mod.rs`

- Add `pub mod marketplace;`

### 9. `src-tauri/src/lib.rs`

- Import marketplace commands and `MarketplaceCache`
- Register `MarketplaceCache::new()` via `.manage()`
- Register `skills_marketplace_search`, `skills_marketplace_install`, and `skills_marketplace_installed` in `generate_handler![]`

### 10. `apps/agent/src/components/modals/skills/SkillsDialog.tsx` — Redesign with tabs

Transform current dialog into tabbed layout:

- Add tab switcher: "Installed" | "Marketplace" (pill-style, matching app aesthetic)
- "Installed" tab renders `<InstalledSkillsPane>` (extracted current content)
- "Marketplace" tab renders `<MarketplacePane>`
- Search bar per-tab (Installed filters locally; Marketplace triggers API debounce)
- Dialog width: 640px → 720px
- Footer changes per tab (skill hints vs marketplace attribution)

### 11. `apps/agent/src/components/modals/skills/index.ts`

- Update barrel exports for new components

### 12. `apps/agent/src/lib/api/index.ts`

- Add `export * from './marketplace';` to the API barrel

### 13. `apps/agent/src/components/modals/skills/SkillsDialog.tsx` + `apps/agent/src/components/modals/projects/ProjectsDialog.tsx`

- Replace inline `OCTAGON_CLIP`, `REST_FLAT`, `REST_TILT`, `setFaceHover` with imports from `@/lib/utils/facehash-utils`

### 14. `apps/agent/src/hooks/agent/use-tauri-mock.ts`

- Add deterministic mock response for `skills:list` (currently a no-op `break` that leaves Installed tab loading forever in `bun run dev`)
- Return 1-2 mock `SkillDefinition` entries so both tabs are testable in mock mode

### 15. `src-tauri/src/commands/common/path_utils.rs` (new) + `src-tauri/src/commands/canvas/preview.rs`

- Extract `augmented_path()` from `preview.rs` into new `path_utils.rs` as `pub(crate) fn augmented_bun_path() -> OsString`
- Rewrite using `std::env::split_paths()` / `std::env::join_paths()` for platform-correct PATH separators (`:` on Unix, `;` on Windows)
- Update `preview.rs` to import from `path_utils` instead of using its inline copy
- Add `pub mod path_utils;` to `src-tauri/src/commands/common/mod.rs`

---

## Existing Code to Reuse

| What                                        | Where                                              | How                                                                                   |
| ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `reqwest::Client` pattern                   | `src-tauri/src/commands/canvas/download.rs`        | Same HTTP client setup with timeout                                                   |
| `augmented_path()` → `augmented_bun_path()` | `src-tauri/src/commands/canvas/preview.rs:160-191` | Extract to `path_utils.rs` as `augmented_bun_path()` using `split_paths`/`join_paths` |
| `tokio::process::Command` pattern           | `src-tauri/src/commands/common/providers.rs`       | Reference for subprocess spawning                                                     |
| `DialogContentGlass`                        | `apps/agent/src/components/ui/dialog.tsx`          | Dialog container                                                                      |
| `Facehash`                                  | `facehash` package                                 | Skill avatars                                                                         |
| `useSmoothScroll`                           | `apps/agent/src/hooks/ui/`                         | Scrollable content                                                                    |
| `SkillsSkeleton`                            | Current `SkillsDialog.tsx`                         | Loading state                                                                         |
| `SOURCE_CONFIG` + grouping                  | Current `SkillsDialog.tsx`                         | Installed tab                                                                         |
| `dispatchAddContextChip`                    | `apps/agent/src/lib/events/chat-context-events.ts` | Click-to-add skill                                                                    |
| `useTauri` + `postMessage`                  | `apps/agent/src/hooks/agent/use-tauri.ts`          | Installed skills fetch                                                                |
| `Popover`                                   | `apps/agent/src/components/ui/popover.tsx`         | Scope picker                                                                          |
| `cn()` utility                              | `apps/agent/src/lib/utils`                         | Class merging                                                                         |
| `invoke()` wrapper                          | `apps/agent/src/lib/api/core.ts`                   | Tauri invoke with Sentry spans                                                        |

---

## Build Sequence

1. **Extract shared utilities** — Create `facehash-utils.ts`, update `SkillsDialog.tsx` and `ProjectsDialog.tsx` to import from it. Visual parity check.
2. **Shared PATH utility** — Extract `augmented_path()` from `preview.rs` into `path_utils.rs` using `split_paths`/`join_paths`. Update `preview.rs` to import. `cargo check`.
3. **Rust backend** — Create `marketplace.rs` with `MarketplaceCache`, input validators, all three commands, install manifest logic (atomic writes), and `augmented_bun_path()` integration. `cargo check` to verify.
4. **Register commands + state** — Wire into `mod.rs` + `lib.rs` (including `.manage(MarketplaceCache::new())`). `cargo build` to verify.
5. **Rust tests** — Unit tests for input validation, cache eviction, manifest read/write + corrupted JSON recovery, `augmented_bun_path()`.
6. **API layer + types** — Create `marketplace.ts` in `lib/api/` with `MarketplaceSkill` type + `MarketplaceInstallResult` (including `warnings`). Add barrel export to `lib/api/index.ts`. `bun run typecheck`.
7. **Fix mock handler** — Add deterministic `skills:list` mock response in `use-tauri-mock.ts`.
8. **Extract InstalledSkillsPane** — Pull existing code out of SkillsDialog. Visual parity check.
9. **Build MarketplaceSkillCard + ScopePopover** — Standalone components.
10. **Build MarketplacePane** — Wire search → API → card grid, with error state, warning toasts, mock mode guard, request sequencing, tab gating, and install concurrency tracking.
11. **Redesign SkillsDialog** — Add tabs, per-tab search, integrate both panes.
12. **Component tests** — MarketplacePane state transitions (loading/error/empty/success/installing/warnings).
13. **End-to-end test** — `bunx tauri dev`, open Skills, browse marketplace, install a skill.

---

## Verification

1. **Rust compiles**: `cargo check` passes with new commands
2. **Rust tests pass**: `cargo test -p orbit-app -- marketplace` passes validation + timeout tests. Backup: run `cargo test -p orbit-app` unfiltered to catch any tests whose names don't include "marketplace". (Package name is `orbit-app` per `src-tauri/Cargo.toml`.)
3. **TypeScript compiles**: `bun run typecheck` passes
4. **Lint passes**: `bun run lint` zero warnings
5. **Mock mode** (bun run dev): Open SkillsDialog → "Installed" tab shows mock skills → "Marketplace" tab shows "requires desktop app" message
6. **Install flow** (bunx tauri dev): Click "Add" on a marketplace skill → scope popover → select "Project" → button shows spinner → skill appears in "Installed" tab after refresh
7. **Search**: Type "react" in marketplace tab → results filter to react-related skills
8. **Already installed**: Skills present in install manifest show "Installed" badge instead of "Add" button
9. **Error handling**: Disconnect network → marketplace shows error state with retry button
10. **No workspace**: "Project" option disabled in scope popover when no workspace open
11. **Concurrent installs**: Click "Add" on two skills rapidly → second button shows disabled state while first installs
12. **PATH resolution**: Install works in production build (bunx resolved via `augmented_bun_path()`, not bare PATH)
13. **Facehash dedup**: `SkillsDialog.tsx` and `ProjectsDialog.tsx` import from `facehash-utils.ts` — no inline OCTAGON_CLIP/setFaceHover
14. **Input validation**: Invalid scope/source/skillId returns error from Rust, doesn't spawn subprocess
15. **Stale response**: Type quickly → only final search results displayed, no flicker from old responses
16. **Tab gating**: Switching to Installed tab does not trigger marketplace API call

---

## Edge Cases

| Scenario                                         | Handling                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| skills.sh API down                               | MarketplacePane shows error state with "Retry" button; cached results still served if within TTL                                                                                                                                                                                                                                                                                                                    |
| Empty query (`?q=`) on initial load              | Verify API returns popular skills; if empty/error, show "Browse skills by searching above"                                                                                                                                                                                                                                                                                                                          |
| User installs then switches to Installed tab     | Installed tab re-fetches on mount; may need short delay or manual refresh button for filesystem sync                                                                                                                                                                                                                                                                                                                |
| `bunx` found but `skills` package not installed  | `bunx skills add` downloads the package first — adds latency. 60s timeout covers this.                                                                                                                                                                                                                                                                                                                              |
| `bunx` not found at all                          | Clear error: "bunx not found. Install Bun: https://bun.sh" — no npx fallback                                                                                                                                                                                                                                                                                                                                        |
| Read-only workspace directory                    | Surface subprocess stderr in `error` field of install response                                                                                                                                                                                                                                                                                                                                                      |
| Very long skill names/sources                    | `truncate` CSS class on card text elements                                                                                                                                                                                                                                                                                                                                                                          |
| No internet + Marketplace tab                    | `reqwest` fails after timeout; cache (if populated from previous search) still shows results                                                                                                                                                                                                                                                                                                                        |
| Workspace path with spaces/special chars         | Args passed as separate `.arg()` calls to `tokio::process::Command` — no shell expansion                                                                                                                                                                                                                                                                                                                            |
| `limit` is 0 or extremely high                   | Backend clamps to `1..=100`                                                                                                                                                                                                                                                                                                                                                                                         |
| `scope` is not "project" or "personal"           | Backend rejects with validation error                                                                                                                                                                                                                                                                                                                                                                               |
| `source` or `skill_id` contain invalid chars     | Backend rejects with regex validation error                                                                                                                                                                                                                                                                                                                                                                         |
| Project scope with null/deleted workspace        | Backend checks path existence before spawning subprocess                                                                                                                                                                                                                                                                                                                                                            |
| Malformed JSON from skills.sh API                | `reqwest` deserialization fails gracefully; error surfaced to frontend                                                                                                                                                                                                                                                                                                                                              |
| Stale search responses (slow network)            | Request sequencing ensures only latest response updates state                                                                                                                                                                                                                                                                                                                                                       |
| Cache grows unbounded over long session          | Max 50 entries with oldest-eviction                                                                                                                                                                                                                                                                                                                                                                                 |
| Install succeeds but manifest write fails        | Return `success: true` with `warnings: ["manifest update failed"]`; UI shows toast; badge may not show until next manifest read                                                                                                                                                                                                                                                                                     |
| Same skill name across different sources         | Install manifest keyed by full marketplace `id` (e.g. `owner/repo/skill-id`), not name                                                                                                                                                                                                                                                                                                                              |
| Mock mode (`bun run dev`)                        | Installed tab shows mock data; Marketplace tab shows guard message                                                                                                                                                                                                                                                                                                                                                  |
| Corrupted manifest JSON                          | `serde_json::from_str` fails → treat as empty manifest (log warning), don't crash. Write overwrites with valid JSON.                                                                                                                                                                                                                                                                                                |
| Concurrent Orbit instances writing manifest      | Use atomic write pattern: write to `.claude/marketplace-installs.json.tmp` then replace final path. On POSIX, `std::fs::rename()` is atomic. On Windows, `rename()` fails if target exists — use `std::fs::remove_file()` (ignore if missing) then `std::fs::rename()`, or use `tempfile::NamedTempFile::persist()` which handles this cross-platform. Add tests for both "final exists" and "final missing" cases. |
| Manual skill deletion (manifest drift)           | Manifest says "installed" but skill file is gone. Badge shows "Installed" — acceptable; user can re-install. Future: validate manifest entries against disk on read.                                                                                                                                                                                                                                                |
| Same skill installed in both scopes, one removed | Manifest is per-scope (project + personal files). Each is independent. Badge shows "Installed" if present in either.                                                                                                                                                                                                                                                                                                |
| Windows PATH separators                          | `augmented_bun_path()` uses `std::env::join_paths()` which uses `;` on Windows, `:` on Unix — platform-correct                                                                                                                                                                                                                                                                                                      |

---

## Testing Strategy

| Layer           | What                                                                                              | Runner           | Location                                             |
| --------------- | ------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| Rust unit       | Input validation (scope, source, skillId, limit)                                                  | `cargo test`     | `marketplace.rs` `#[cfg(test)]`                      |
| Rust unit       | Cache TTL + eviction                                                                              | `cargo test`     | `marketplace.rs` `#[cfg(test)]`                      |
| Rust unit       | Manifest read/write + corrupted JSON recovery + atomic overwrite (target exists vs missing)       | `cargo test`     | `marketplace.rs` `#[cfg(test)]`                      |
| Rust unit       | `augmented_bun_path()` platform correctness                                                       | `cargo test`     | `path_utils.rs` `#[cfg(test)]`                       |
| React component | MarketplacePane state transitions (loading → success, loading → error, empty results, installing) | Vitest           | `apps/agent/src/__tests__/components/modals/skills/` |
| React component | ScopePopover disabled state when no workspace                                                     | Vitest           | Same directory                                       |
| E2E manual      | Full install flow across tabs                                                                     | `bunx tauri dev` | —                                                    |

---

## Sources

- [skills.sh](https://skills.sh/) — The open agent skills directory
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — CLI source code (find.ts reveals the search API)
- [skills.sh/docs](https://skills.sh/docs) — Documentation
- [Vercel changelog](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem) — Launch announcement

---

## Audit History

| Date       | Verdict              | Auditor | Document                     |
| ---------- | -------------------- | ------- | ---------------------------- |
| 2026-03-04 | APPROVE WITH CHANGES | Claude  | `reviews/audit-plan.md` (v1) |
| 2026-03-04 | APPROVE WITH CHANGES | Codex   | `reviews/audit-plan.md` (v2) |
| 2026-03-04 | APPROVE WITH CHANGES | Codex   | `reviews/audit-plan.md` (v3) |
| 2026-03-04 | APPROVE WITH CHANGES | Codex   | `reviews/audit-plan.md` (v4) |
| 2026-03-04 | APPROVE WITH CHANGES | Codex   | `reviews/audit-plan.md` (v5) |

### Changes from Claude audit (v1):

- Added `MarketplaceCache` as Tauri managed state (Critical #1)
- Added `resolve_bunx_path()` for macOS PATH resolution (Critical #2)
- Added `lib/api/index.ts` to Files to Modify (Critical #3)
- Moved `MarketplaceSkill` type from `protocol.ts` to `lib/api/marketplace.ts`
- Added mock mode guard for `bun run dev`
- Separated initial load from debounced search
- Extracted `facehash-utils.ts` to deduplicate across 3 files
- Added install concurrency guard via `installingIds` state
- Added Edge Cases section
- Added `truncate` on card text elements

### Changes from Codex audit (v2):

- Added install manifest system for marketplace ID tracking (Critical #1) — installed `SkillDefinition` has no marketplace `id` field, so a separate manifest is needed
- Removed `npx` fallback to comply with Bun-only policy (Critical #2) — switched to `augmented_path()` from `preview.rs:160-191`
- Added backend input validation: scope enum, source/skillId regex, limit clamping, workspace existence check (Critical #3)
- Fixed mock mode for Installed tab too — added deterministic `skills:list` mock response (Critical #4)
- Added request sequencing / AbortController for stale response prevention (Recommended #1)
- Added cache max entries (50) with oldest-eviction (Recommended #2)
- Changed PATH reference from `providers.rs` to `preview.rs:augmented_path()` (Recommended #3)
- Made search per-tab instead of shared — marketplace effects gated on active tab (Recommended #4)
- Added Testing Strategy section with Rust unit tests and React component tests (Recommended #5)
- Added `MarketplaceInstallResult` type with `installedId` field
- Added third command `skills_marketplace_installed` for manifest reads

### Changes from Codex audit (v3):

- Fixed manifest path inconsistency: canonical path is `.claude/marketplace-installs.json` for both scopes (Critical #1)
- Extracted `augmented_path()` to shared `path_utils.rs` using `std::env::split_paths()`/`join_paths()` for cross-platform PATH separators (Critical #2)
- Added `warnings: Option<Vec<String>>` to `InstallResult` for partial-success cases (manifest write failure) (Critical #3)
- Added atomic manifest writes (write to `.tmp` then `rename()`)
- Added edge cases: corrupted manifest JSON, concurrent Orbit instances, manual deletion drift, dual-scope removal, Windows PATH
- Added Rust tests for manifest read/write recovery and `augmented_bun_path()` platform correctness

### Changes from Codex audit (v4):

- Normalized all PATH helper references to `augmented_bun_path()` — removed residual `augmented_path()` in command spec, notes, and verification (Critical #1)

### Changes from Codex audit (v5):

- Fixed `cargo test` package name from `orbit-tauri` to `orbit-app` (matches `src-tauri/Cargo.toml` `[package] name`) (Critical #1)
- Added Windows-safe manifest replacement strategy: `remove_file` + `rename` (or `tempfile::persist()`) with tests for "final exists" and "final missing" cases (Critical #2)
- Clarified cache eviction as FIFO (oldest by insertion time), not true LRU (Recommended #2)
- Fixed `cargo test` filter to use `-p orbit-app -- marketplace` for guaranteed test matching (Recommended #1, corrected package name in v5)
- Added `AGENTS.md` reference alongside `CLAUDE.md` in Bun-only policy note (Recommended #3)
