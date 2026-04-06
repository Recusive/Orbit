# Mission Brief Template

Use this exact structure for every brief. Every section is required.

## File Naming

- Location: `docs/production/NN-kebab-case-title.md`
- Numbering: Check `INDEX.md` for the next available number
- Example: `docs/production/11-css-animation-audit.md`

## Template

```markdown
# Mission NN: Title — Subtitle

> **One-liner:** Single sentence explaining what this achieves for the user.

## Why This Matters

Explain the user-facing impact in concrete terms. Not "performance could improve" but
"when the user opens 5 terminals and the agent is streaming, FPS drops to 30 because
terminal output triggers 1000 state updates per second."

2-3 paragraphs max. Lead with the worst-case scenario.

## Current State

### What Exists (Good)

| Pattern              | Location      | Status       |
| -------------------- | ------------- | ------------ |
| Something that works | `file.ts:123` | Working well |

### What's Missing (Problems)

For each problem:

**Problem Title**
```

File: exact/path/to/file.ts:line-number

// The actual code snippet showing the issue
problematicFunction() {
// annotate what's wrong
}

````
- **Why it's a problem:** Concrete explanation
- **At scale:** What happens with 10x input (10k files, 1000 messages, etc.)
- **Frame budget impact:** How many ms this costs

## What To Replace / Add

### Fix 1: Title

**Currently:** `file.ts:123` does X.

**Replace with:**
```typescript
// Concrete code example of the fix
````

**Files to modify:**

- `exact/path/to/file.ts` — Description of change
- `exact/path/to/other.ts` — Description of change

### Fix 2: Title

(repeat pattern)

## What We Get

| Metric              | Before                 | After                   |
| ------------------- | ---------------------- | ----------------------- |
| Specific measurable | Current value/behavior | Expected value/behavior |
| Another metric      | ...                    | ...                     |

## Estimated Complexity

**Size** (Small/Medium/Large) — N days.

- Day 1: What to do
- Day 2: What to do

## Dependencies

- Mission #N (title) — why it matters for this mission
- Or: "None — this mission is independent"

## Risks

- **Risk 1:** What could go wrong, how to mitigate
- **Risk 2:** Another risk

```

## Quality Checklist

Before saving the brief, verify:

- [ ] Every file path exists in the codebase (you Read it)
- [ ] Every line number is accurate (you confirmed it)
- [ ] Code snippets are from the actual codebase, not invented
- [ ] "What We Get" has specific numbers, not vague improvements
- [ ] Fixes include actual code patterns, not just descriptions
- [ ] No overlap with existing briefs in INDEX.md
- [ ] Brief is >100 lines (if shorter, the finding isn't substantial enough)
- [ ] Complexity estimate accounts for testing time
```
