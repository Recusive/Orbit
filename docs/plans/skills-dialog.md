# Plan: Skills Dialog

## Context

The sidebar Powers section has a "Skills" button with no functionality. Skills are filesystem artifacts (`SKILL.md` files with YAML frontmatter) discovered from project (`.claude/skills/`) and user (`~/.claude/skills/`) directories. The user wants a standalone read-only dialog (like Settings) that lists all available skills with their name, description, and source.

## Approach

Follow the existing **Subagents listing** pattern end-to-end: bridge reads disk → Rust command → frontend API → handler → dialog. This keeps the codebase consistent even though skills are read-only.

## Audit Fixes Applied

Fixes from `reviews/audit-plan.md` (2026-02-17):

1. **Dual scan pattern** — Scan both `*/SKILL.md` (subdirectory skills) AND `*.md` (root-level skills) to catch all skill files
2. **No-frontmatter fallback** — Files without YAML frontmatter use filename as `name` and empty `description` (matches `parseAgentFile` behavior)
3. **Dropped `'plugin'` source** — No plugin infrastructure exists; union is now `'project' | 'user'` only
4. **Local `useState` instead of UIStore** — Dialog only opens from one place (PowersSection button), so local state in PrimarySidebar avoids UIStore bloat
5. **Error state in dialog** — Handler sends `skills:error` on failure; dialog renders error message
6. **Optional metadata fields** — Added `triggers?: string[]` and `filePath?: string` for richer display

## Files to Create/Modify

### 1. Bridge: Skill definitions reader

**Create:** `agent-bridge/src/agent/definitions/skill-definitions.ts`

- `SkillDefinition` interface: `{ name, description, source: 'project' | 'user', triggers?, filePath? }`
- `listSkills(workspacePath: string)` — dual-pattern scan:
  - For each skills directory (project + user):
    - Subdirectories containing `SKILL.md` → parse as skill
    - Root-level `*.md` files → parse as skill (catches standalone skill files)
  - Excludes non-skill subdirectory files (e.g., `rules/*.md`, `references/*.md` inside a skill folder)
- Parse YAML frontmatter (`---\nname: ...\ndescription: ...\n---`) using same regex as `agent-definitions.ts:58`
- **No-frontmatter fallback**: files without `---` block get `name: filename` (sans `.md`), `description: ''`
- Returns `SkillDefinition[]` sorted by source then name
- Handles missing directories gracefully (return `[]`)
- Home dir via `process.env.HOME ?? os.homedir()`

**Modify:** `agent-bridge/src/agent/definitions/index.ts` — re-export `listSkills`, `SkillDefinition`

### 2. Bridge: Protocol & handler

**Modify:** `agent-bridge/src/protocol/protocol.ts` — add `list_skills` request type + `skill_list` response type
**Modify:** `agent-bridge/src/protocol/schemas.ts` — add Zod schemas for skill types
**Modify:** `agent-bridge/src/index.ts` — handle `list_skills` request, call `listSkills()`, return `skill_list` response

### 3. Rust: Tauri command

**Modify:** `src-tauri/src/commands/agent/agent.rs` (or `lifecycle.rs`) — add `agent_list_skills` command (thin wrapper like `agent_list_agents`)
**Modify:** `src-tauri/src/lib.rs` — register the new command

### 4. Frontend: API function

**Modify:** `apps/agent/src/lib/api/agent.ts` — add:

```ts
export interface SkillDefinition {
  name: string;
  description: string;
  source: 'project' | 'user';
  triggers?: string[];
  filePath?: string;
}

export async function listSkills(workspacePath: string): Promise<SkillDefinition[]> {
  return invoke<SkillDefinition[]>('agent_list_skills', { workspacePath });
}
```

### 5. Frontend: Protocol types

**Modify:** `apps/agent/src/types/protocol/protocol.ts` — add:

- `SkillDefinitionSchema` — Zod schema (name, description, source, optional triggers/filePath)
- `SkillsListSchema` — `{ type: 'skills:list', uuid }` WebviewMessage
- `SkillsListResponseSchema` — `{ type: 'skills:list:response', uuid, skills }` ExtensionMessage
- `SkillsErrorSchema` — `{ type: 'skills:error', uuid, error }` ExtensionMessage
- Add to union types

### 6. Frontend: Handler

**Create:** `apps/agent/src/hooks/agent/handlers/skill-handlers.ts`

- `handleSkillsList(message)` — calls `listSkills(workspacePath)`, postMessages `skills:list:response`
- Error handling: catches errors, postMessages `skills:error` (matches subagent-handlers pattern)
- Pattern: identical to `subagent-handlers.ts:handleSubagentsList`

**Modify:** `apps/agent/src/hooks/agent/handlers/index.ts` — export + route `skills:list` messages

### 7. PowersSection: Wire button

**Modify:** `apps/agent/src/components/layout/primary-sidebar/components/PowersSection.tsx`

- Add `onSkillsClick?: () => void` callback prop
- Add `onClick` to Skills button item → calls `onSkillsClick`

### 8. SkillsDialog component

**Create:** `apps/agent/src/components/modals/skills/SkillsDialog.tsx`

Layout (mirrors SettingsDialog dimensions: `w-[720px] max-w-[90vw] h-[600px] max-h-[85vh]`):

- Title bar: Skills icon + "Skills" + close button
- Fetches skills on open via `handleSkillsList` pattern (postMessage + listener)
- **Loading skeleton state** — pulse animations (like SubagentsSettings)
- **Error state** — red error banner (like SubagentsSettings error display)
- **Empty state** — skill icon + "No skills found" + hint to create `.claude/skills/`
- **Grouped by source**: **Project Skills**, **Personal Skills**
  - Each group has a colored dot + label (green for project, orange for personal — matches SlashCommandsSettings)
  - Each skill card shows: name, description, source badge, optional triggers chips
- Info section at bottom explaining how skills work and directory locations

**Create:** `apps/agent/src/components/modals/skills/index.ts` — barrel export + types

### 9. PrimarySidebar: Mount dialog

**Modify:** `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`

- Add local `useState<boolean>` for `skillsDialogOpen` (NOT UIStore — dialog only opens from one place)
- Lazy-load `SkillsDialog` (same pattern as `LazySettingsDialog`)
- Pass `onSkillsClick={() => setSkillsDialogOpen(true)}` to PowersSection
- Mount `<SkillsDialog open={skillsDialogOpen} onOpenChange={setSkillsDialogOpen} />`

## Existing Code to Reuse

| What                          | From                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| YAML frontmatter parser regex | `agent-bridge/src/agent/definitions/agent-definitions.ts:59`                        |
| No-frontmatter fallback logic | `agent-bridge/src/agent/definitions/agent-definitions.ts:62-67`                     |
| Subagent list handler pattern | `apps/agent/src/hooks/agent/handlers/subagent-handlers.ts`                          |
| Scope-grouped card layout     | `apps/agent/src/components/modals/settings/pages/SlashCommandsSettings.tsx:680-844` |
| Dialog structure + animations | `apps/agent/src/components/modals/settings/SettingsDialog.tsx`                      |
| Lazy dialog loading pattern   | `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx:58-67`         |
| Icon: `IconSkills`            | `apps/agent/src/components/layout/primary-sidebar/components/IconSkills.tsx`        |
| Error display pattern         | `apps/agent/src/components/modals/settings/pages/SubagentsSettings.tsx:591-595`     |
| Loading skeleton pattern      | `apps/agent/src/components/modals/settings/pages/SubagentsSettings.tsx:557-581`     |

## Edge Cases

- **Missing `.claude/skills/` directory** → return empty array (`fs.existsSync` guard)
- **Missing `~/.claude/skills/` directory** → return empty array (same guard)
- **Duplicate skill names across scopes** → both appear, distinguished by source badge
- **Deeply nested files** (e.g., `skills/test-engineer/rules/*.md`) → NOT scanned as separate skills; only `SKILL.md` in direct subdirectories and `*.md` at root level
- **Malformed YAML frontmatter** → falls back to filename-as-name with empty description
- **Files without frontmatter** → same fallback (filename-as-name)
- **Symlinked directories** → `fs.readdirSync` follows symlinks by default; works transparently
- **Bridge call failure** → `skills:error` message → dialog shows error banner

## Verification

1. `bun run typecheck` — no TS errors
2. `bun run lint` — no lint warnings
3. `cargo check` — Rust compiles
4. `bunx tauri dev` — app starts
5. Click Powers > Skills → dialog opens with loading skeleton → skills appear
6. Dialog shows project skills from `.claude/skills/` (6+ skills including root-level `.md` files)
7. Dialog shows "No personal skills" section or omits it if `~/.claude/skills/` is empty
8. Close dialog via X button or click outside overlay
9. Re-open → skills re-fetched (no stale data)
