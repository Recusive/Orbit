# Plan: Port Agent Skills Reference Implementation to TypeScript

## Context

Anthropic published an open-source Agent Skills specification (`github.com/agentskills/agentskills`) with a Python reference implementation (~210 lines) providing skill validation, parsing, and prompt XML generation. Orbit already has a skills system (discovery in `skill-definitions.ts`, marketplace in Rust, UI in `SkillsDialog.tsx`), but lacks spec-compliant validation and linting. Porting this reference implementation gives Orbit a differentiator over vanilla Claude Code: skills created by the agent are automatically validated against the official spec, with inline feedback in the UI.

**What we're building**: A TypeScript validator/parser/prompt-generator that validates SKILL.md files against the Agent Skills spec, integrated into Orbit's existing skills infrastructure with visual validation badges.

**What we're NOT building**: A skills runtime, a new discovery system, or changes to how Claude Code executes skills.

---

## Phase 1: Zod Schemas (`packages/shared-schemas/src/skills/`)

### Files to create:

- `packages/shared-schemas/src/skills/skill-properties.ts`
- `packages/shared-schemas/src/skills/skill-validation.ts`
- `packages/shared-schemas/src/skills/index.ts`

### Details:

**`skill-properties.ts`** — Zod schema matching the Python `SkillProperties` dataclass:

```typescript
import { z } from 'zod/v4';

export const SkillPropertiesSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    license: z.string().optional(),
    compatibility: z.string().optional(),
    allowedTools: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type SkillProperties = z.infer<typeof SkillPropertiesSchema>;
```

**`skill-validation.ts`** — Validation result type:

```typescript
import { z } from 'zod/v4';

export const SkillValidationResultSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    skillDir: z.string(),
  })
  .strict();

export type SkillValidationResult = z.infer<typeof SkillValidationResultSchema>;
```

**`index.ts`** — Barrel export both schemas and types.

Update `packages/shared-schemas/src/index.ts` to re-export from `./skills/index.ts`.

### Constants (matching Python reference):

```
MAX_SKILL_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024
MAX_COMPATIBILITY_LENGTH = 500
ALLOWED_FIELDS = ['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']
```

---

## Phase 2: Parser Module (`apps/agent/src/lib/skills/parser.ts`)

Port `parser.py` functions to TypeScript. No external YAML dependency — use regex-based frontmatter extraction (matching the existing pattern in `skill-definitions.ts:parseSkillMd`).

### Functions:

```typescript
export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
};
```

- Split on `---` delimiters (must start with `---`)
- Parse YAML frontmatter via regex key-value extraction (same approach as existing `parseSkillMd` in `agent-bridge/src/agent/definitions/skill-definitions.ts:108-145`)
- Handle multi-line description values (indented continuation lines)
- Handle `metadata:` as nested key-value block
- Throw `SkillParseError` for missing/malformed frontmatter

```typescript
export function readProperties(content: string): SkillProperties;
```

- Call `parseFrontmatter`, validate required fields exist (name, description)
- Return typed `SkillProperties` object
- Throw `SkillValidationError` for missing required fields

### Error classes:

```typescript
export class SkillParseError extends Error {}
export class SkillValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
  }
}
```

### Key reference:

- **Existing parser to reuse**: `agent-bridge/src/agent/definitions/skill-definitions.ts` lines 108-145 (`parseSkillMd`) — already parses YAML frontmatter with regex. Adapt this pattern rather than writing from scratch.
- **Python source**: `skills-ref/src/skills_ref/parser.py`

---

## Phase 3: Validator Module (`apps/agent/src/lib/skills/validator.ts`)

Port `validator.py` validation rules to TypeScript. This is the core differentiator.

### Functions:

```typescript
export function validateName(name: string, dirName?: string): string[];
```

Rules (from Python reference `_validate_name`):

1. Must be non-empty string
2. NFKC Unicode normalization (`name.normalize('NFKC')`)
3. Max 64 characters
4. Must be lowercase (`name === name.toLowerCase()`)
5. Cannot start or end with hyphen
6. No consecutive hyphens (`--`)
7. Only alphanumeric + hyphens (`/^[a-z0-9\-]+$/` after normalization — Python allows Unicode letters but we match the stricter regex)
8. Must match directory name (if `dirName` provided)

```typescript
export function validateDescription(description: string): string[];
```

Rules: non-empty string, max 1024 chars.

```typescript
export function validateCompatibility(compatibility: string): string[];
```

Rules: must be string, max 500 chars.

```typescript
export function validateMetadataFields(metadata: Record<string, unknown>): string[];
```

Rules: only `ALLOWED_FIELDS` keys present. Report unexpected fields.

```typescript
export function validateSkill(
  metadata: Record<string, unknown>,
  dirName?: string
): SkillValidationResult;
```

Orchestrator: calls all validators, aggregates errors, returns `SkillValidationResult`.

### Key reference:

- **Python source**: `skills-ref/src/skills_ref/validator.py` (all rules transcribed above)

---

## Phase 4: Prompt XML Generator (`apps/agent/src/lib/skills/prompt.ts`)

Port `prompt.py` — generates `<available_skills>` XML for agent system prompts.

### Function:

```typescript
export function toPromptXml(
  skills: Array<{ name: string; description: string; location: string }>
): string;
```

- Generates XML matching Anthropic's recommended format
- HTML-escapes name and description values
- Wraps each skill in `<skill>` with `<name>`, `<description>`, `<location>` children
- Returns empty `<available_skills></available_skills>` for empty input

### Key reference:

- **Python source**: `skills-ref/src/skills_ref/prompt.py`
- **Note**: This is useful for Orbit's prompt construction but may not be immediately integrated if the Claude Agent SDK handles prompt injection. Include as a utility.

---

## Phase 5: Barrel Exports (`apps/agent/src/lib/skills/index.ts`)

```typescript
export { parseFrontmatter, readProperties, SkillParseError, SkillValidationError } from './parser';
export {
  validateSkill,
  validateName,
  validateDescription,
  validateCompatibility,
  validateMetadataFields,
} from './validator';
export { toPromptXml } from './prompt';
```

---

## Phase 6: Store Integration (`apps/agent/src/stores/agent/commands-store.ts`)

Add validation results alongside existing skill definitions.

### Changes:

1. **New state field**:

   ```typescript
   skillValidationResults: Map<string, SkillValidationResult>;
   ```

2. **New action**:

   ```typescript
   validateSkillDefinition: (skillName: string, content: string, dirName: string) =>
     SkillValidationResult;
   ```

   - Calls `parseFrontmatter` + `validateSkill`
   - Stores result in `skillValidationResults` map
   - Returns result for immediate use

3. **Trigger validation on skill refresh**: In the existing `refreshSkills` flow (or wherever `skills:discovered` events are handled), validate each discovered skill's SKILL.md content. This requires the file content — which `skill-definitions.ts` already reads during discovery.

4. **Integration point**: `skill-definitions.ts` in agent-bridge already reads SKILL.md content (`fs.readFileSync`). Add a `rawContent` field to the skill definition passed back via IPC, so the frontend can validate without re-reading files.

### Key files to modify:

- `apps/agent/src/stores/agent/commands-store.ts` — add validation state + action
- `agent-bridge/src/agent/definitions/skill-definitions.ts` — include `rawContent` in discovered skill data
- `apps/agent/src/types/protocol/protocol.ts` — add `rawContent: z.string().optional()` to `SkillDefinitionSchema`

---

## Phase 7: UI Integration

### 7a: Validation Badge Component

**Create**: `apps/agent/src/components/modals/skills/SkillValidationBadge.tsx`

Small inline badge showing validation status:

- Green checkmark + "Valid" for passing skills
- Yellow warning + error count for failing skills
- Tooltip with specific error messages on hover
- Uses existing `Tooltip` from `@/components/ui/tooltip`

### 7b: InstalledSkillsPane Integration

**Modify**: `apps/agent/src/components/modals/skills/InstalledSkillsPane.tsx`

- Import `SkillValidationBadge`
- Render badge next to each skill name in the list
- Read validation result from `commands-store` via selector
- Trigger validation on pane mount if not already validated

### 7c: Post-Install Validation

**Modify**: `apps/agent/src/components/modals/skills/MarketplacePane.tsx`

- After successful `skills_marketplace_install`, trigger validation of the newly installed skill
- Show validation result inline (toast or badge update)

---

## Phase 8: Tests

### 8a: Parser Tests (`apps/agent/src/__tests__/unit/lib/skills/parser.test.ts`)

~12 test cases:

- Valid frontmatter parsing (name + description)
- All optional fields (license, compatibility, allowed-tools, metadata)
- Multi-line description values
- Missing opening `---` → SkillParseError
- Unclosed frontmatter → SkillParseError
- Missing `name` → SkillValidationError
- Missing `description` → SkillValidationError
- Empty name/description → SkillValidationError
- Metadata as nested key-value pairs
- Content body extraction (text after closing `---`)

### 8b: Validator Tests (`apps/agent/src/__tests__/unit/lib/skills/validator.test.ts`)

~18 test cases:

- Valid name passes
- Name too long (>64 chars) → error
- Uppercase name → error
- Name starting/ending with hyphen → error
- Consecutive hyphens → error
- Invalid characters in name → error
- Name ≠ directory name → error
- Unicode NFKC normalization
- Valid description passes
- Description too long (>1024) → error
- Valid compatibility passes
- Compatibility too long (>500) → error
- Unexpected frontmatter fields → error
- Full `validateSkill` with all valid fields → `{ valid: true, errors: [] }`
- Full `validateSkill` with multiple errors → all reported
- Missing required fields reported

### 8c: Prompt Tests (`apps/agent/src/__tests__/unit/lib/skills/prompt.test.ts`)

~5 test cases:

- Empty input → empty `<available_skills>` block
- Single skill → correct XML structure
- Multiple skills → all present
- HTML special characters escaped in name/description
- Location paths rendered correctly

**Test runner**: Vitest (per project testing architecture — `bun run test`)

---

## File Summary

### New files (8):

| File                                                               | Purpose                           |
| ------------------------------------------------------------------ | --------------------------------- |
| `packages/shared-schemas/src/skills/skill-properties.ts`           | Zod schema for SkillProperties    |
| `packages/shared-schemas/src/skills/skill-validation.ts`           | Zod schema for validation results |
| `packages/shared-schemas/src/skills/index.ts`                      | Barrel export                     |
| `apps/agent/src/lib/skills/parser.ts`                              | Frontmatter parser                |
| `apps/agent/src/lib/skills/validator.ts`                           | Spec-compliant validator          |
| `apps/agent/src/lib/skills/prompt.ts`                              | Prompt XML generator              |
| `apps/agent/src/lib/skills/index.ts`                               | Barrel export                     |
| `apps/agent/src/components/modals/skills/SkillValidationBadge.tsx` | Validation badge UI               |

### Modified files (5):

| File                                                              | Change                                    |
| ----------------------------------------------------------------- | ----------------------------------------- |
| `packages/shared-schemas/src/index.ts`                            | Re-export skills schemas                  |
| `apps/agent/src/stores/agent/commands-store.ts`                   | Add validation state + action             |
| `apps/agent/src/types/protocol/protocol.ts`                       | Add `rawContent` to SkillDefinitionSchema |
| `agent-bridge/src/agent/definitions/skill-definitions.ts`         | Include rawContent in discovery           |
| `apps/agent/src/components/modals/skills/InstalledSkillsPane.tsx` | Render validation badges                  |

### Test files (3):

| File                                                         | Cases |
| ------------------------------------------------------------ | ----- |
| `apps/agent/src/__tests__/unit/lib/skills/parser.test.ts`    | ~12   |
| `apps/agent/src/__tests__/unit/lib/skills/validator.test.ts` | ~18   |
| `apps/agent/src/__tests__/unit/lib/skills/prompt.test.ts`    | ~5    |

---

## Verification

1. **Unit tests**: `bun run test` — all ~35 test cases pass
2. **Type check**: `bun run typecheck` — no errors
3. **Lint**: `bun run lint` — no warnings
4. **Manual test**: Create a skill with intentional errors (uppercase name, missing description), open Skills dialog, verify validation badge shows errors with correct messages
5. **Manual test**: Install a skill from marketplace, verify it gets validated automatically
6. **Integration**: `bunx tauri dev` — full app starts, skills panel works, validation badges render

---

## Implementation Order

1. Schemas (Phase 1) — no dependencies
2. Parser (Phase 2) — depends on schemas
3. Validator (Phase 3) — depends on schemas
4. Prompt generator (Phase 4) — depends on schemas
5. Barrel exports (Phase 5) — depends on 2-4
6. Tests (Phase 8) — write alongside phases 2-4, run to verify
7. Store integration (Phase 6) — depends on 2-3, modifies protocol
8. UI integration (Phase 7) — depends on 6, final step
