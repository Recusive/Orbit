---
name: audit-spec
description: Audit behavioral specification documents for completeness, correctness, internal consistency, plan alignment, codebase drift, and testability before implementation begins. Use when asked to review a feature spec, spec sheet, requirements document, or acceptance criteria document against the companion plan and the existing Tauri 2 + React 19 + Rust codebase.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(wc:*)
  - Bash(date:*)
  - Agent
---

# Spec Audit

Perform a rigorous audit of a behavioral specification document before implementation begins.

Treat the spec as the source of truth for behavior and the companion plan as the source of truth
for implementation strategy. Read both critically. Find every gap, contradiction, outdated codebase
claim, and untestable acceptance criterion.

## Input and validation

Require a spec document path.

If the path argument is missing, output exactly:

```text
Usage: /audit-spec <path-to-spec-doc>
Example: /audit-spec docs/specs/agent-browser-integration-spec.md
```

Stop execution.

If the spec path does not exist, output exactly:

```text
Spec document not found at `<path-to-spec-doc>`
```

Stop execution.

Derive the output filename from the spec path. Example: docs/specs/agent-browser-integration-spec.md produces
reviews/audit-agent-browser-integration-spec.md.

Write the audit report to reviews/audit-{spec-base-name}.md.

If `reviews/audit-spec.md` already exists, read it first and increment the `Pass` number by 1.
Otherwise set `Pass` to `1`.

## Context

Collect these baseline facts before auditing:

- Current branch: `git branch --show-current`
- Current date: use the local system date
- System assumptions: production Tauri 2 + React 19 desktop app, strict TypeScript, Rust backend,
  and user projects at risk if the spec is wrong

If the spec references a companion plan, read that plan completely before making any judgments about
coverage or contradictions.

## Critical Rules

These override everything else. Internalize before proceeding.

1. Read the actual source code. Do not trust the spec's claims about existing code. Verify every
   one.
2. Be adversarial. Your job is to find what's wrong, not to confirm it's right. Assume the spec
   has errors until proven otherwise.
3. No rubber-stamping. APPROVED means you verified every claim and found no critical issues. If
   you can't verify something, flag it as a gap.
4. Be concrete. Every finding must reference specific sections, line numbers, or file paths. "The
   error handling seems incomplete" is not a finding.

## Severity definitions

| Severity        | Meaning                                                                                               | Action                                |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `CRITICAL`      | Spec is wrong, contradicts plan, contradicts codebase, or leaves likely production behavior undefined | Must fix before implementation begins |
| `INCONSISTENCY` | Spec contradicts itself, or numbers/names do not match between sections                               | Must fix before implementation        |
| `GAP`           | Behavior is undefined for a scenario likely to occur in production                                    | Must define before implementation     |
| `UNVERIFIABLE`  | Acceptance criterion or requirement cannot be tested as written                                       | Must rewrite to be testable           |
| `DRIFT`         | Spec claims something about the current codebase that is false or outdated                            | Must correct to match reality         |
| `WARNING`       | Ambiguity could lead to misinterpretation, but there is a plausible default                           | Should clarify                        |
| `NOTE`          | Observation worth surfacing, but not a defect                                                         | Informational                         |

## Audit workflow

### Step 0: Read the spec completely

Read the spec document from top to bottom before auditing any single section in isolation.

Extract and verify:

1. Companion plan path, if referenced
2. Feature scope and explicitly stated goals
3. Major section list and overall structure
4. Acceptance criteria count, including any priority breakdown
5. Explicit out-of-scope items

If the spec references a companion plan, read it completely. Use the plan as the implementation
strategy source of truth and the spec as the behavior source of truth. Flag contradictions between
them later in the audit.

### Step 1: Verify codebase ground truth

Do not trust any claim in the spec about the current codebase.

For every claim about existing code:

1. Locate the actual source file
2. Read the relevant code
3. Compare the code to the spec claim
4. Record any mismatch as `DRIFT`

Minimum verification scope:

- Every file path named in the spec
- Every API, function, type, schema, or command the spec says already exists
- Every current-state or baseline claim
- Every tool count, transport detail, timeout, size limit, or capability inventory tied to existing
  code

Stop only when you can answer both questions confidently:

- Does the spec accurately describe the current codebase state?
- Are all file paths, function names, and API surfaces correct?

If a referenced file does not exist, flag it as DRIFT. Search for the functionality elsewhere and
note the correct path in the finding.

If the companion plan does not exist or is not referenced, proceed without plan cross-validation
(Step 2). Note in the audit report that plan alignment was not verified and mark the Plan Alignment
grade as N/A.

### Step 2: Cross-validate the spec against the plan

Compare the behavior spec to its companion plan section by section.

#### 2.1 Coverage check

- Map every plan phase to at least one acceptance criterion or explicit behavior section
- Verify every file the plan creates or modifies has behavior defined in the spec
- Verify every edge case called out in the plan has expected behavior in the spec

Flag:

- `GAP` for any plan phase or edge case with no corresponding spec coverage
- `CRITICAL` for any acceptance criterion or behavior definition that contradicts the plan’s stated
  implementation approach

#### 2.2 Numerical consistency

Cross-check all counts, limits, and thresholds:

- Tool inventories
- File counts
- Timeout values
- Retry counts
- Payload caps
- Token or size limits

Flag any mismatch as `INCONSISTENCY`.

#### 2.3 Naming consistency

Cross-check names exactly:

- Tool names
- Command names
- Type and schema names
- Field names
- Enum values
- State names
- File paths

Flag any mismatch as `INCONSISTENCY`.

### Step 3: Audit internal consistency

Cross-reference every major section against the rest of the document.

#### 3.1 Acceptance criteria vs expected behavior

For every acceptance criterion:

- Verify the behavior it tests is actually defined elsewhere in the spec
- Verify the criterion does not contradict the behavior sections
- Verify a test could be written from the spec alone

Flag:

- `UNVERIFIABLE` when the criterion lacks a clear input, action, or expected output
- `INCONSISTENCY` when the criterion contradicts stated behavior

#### 3.2 Error taxonomy vs expected behavior

Cross-check error handling in both directions:

- Every listed error should correspond to a concrete trigger scenario
- Every failure mode in the behavior sections should map to an error or explicit surfaced outcome
- Error names and messages should match between sections

Flag `GAP` for orphan errors, missing failure outcomes, or missing user-visible error behavior.

#### 3.3 Data contracts vs usage

For every data contract, schema, or payload:

- Verify every field is referenced somewhere meaningful in behavior, validation, error handling, or
  acceptance criteria
- Verify field types are consistent everywhere in the spec
- Verify required vs optional semantics are consistent

Flag `WARNING` for orphan fields, weakly specified fields, or type mismatches that could mislead
implementation.

#### 3.4 Constraints vs all other sections

Check that every constraint is enforceable and not violated elsewhere:

- Performance constraints
- Safety constraints
- Ordering constraints
- Size limits
- Transport constraints
- Persistence or cleanup constraints

Flag `CRITICAL` if an acceptance criterion or behavior definition violates a stated constraint.

#### 3.5 Out-of-scope vs in-scope behavior

Verify the document respects its own scope boundaries:

- No expected behavior should require an out-of-scope item
- No acceptance criterion should implicitly force an out-of-scope implementation
- No out-of-scope item should be contradicted by an in-scope requirement

Flag any scope contradiction as `CRITICAL`.

### Step 4: Audit completeness

#### 4.1 Happy path coverage

For every primary use case:

- Verify the flow is specified from trigger to final state
- Verify intermediate states are defined
- Verify the final state is observable and testable

Flag `GAP` for incomplete happy paths.

#### 4.2 Failure path coverage

For every use case, check:

- What happens if each major step fails
- What happens on timeout
- What happens on disconnect or process crash
- What happens if the user cancels or interrupts mid-flow
- What happens on partial success

Flag `GAP` for undefined failure behavior or missing recovery rules.

#### 4.3 Boundary conditions

Check at minimum:

- Empty inputs
- Null and undefined handling
- Zero-length arrays or zero-value counts
- Maximum payload sizes
- Largest expected element counts
- Longest expected strings or prompts
- Concurrent operations
- Unexpected events in each state transition

Flag `GAP` for undefined boundary behavior.

#### 4.4 Cross-feature interactions

Check how the feature interacts with existing systems:

- Chat or session state
- File system state
- Terminal state
- Browser or canvas state
- Persistence
- Existing tool execution flows

Flag `GAP` for unaddressed side effects or interactions with adjacent features.

### Step 5: Audit testability

For every acceptance criterion, spell out:

1. Input: what must be provided
2. Action: what exact action occurs
3. Expected output: what exact result must be verified

If any of the three is ambiguous, flag `UNVERIFIABLE`.

Also evaluate non-functional requirements:

- Can performance targets be measured with the tools and instrumentation in scope?
- Can success metrics be collected without inventing extra systems not described in the spec?
- Can non-functional requirements be validated before production rollout?

Flag any ambiguous or non-measurable requirement as `UNVERIFIABLE`.

### Step 6: Write the audit report

Write the report to reviews/audit-{spec-base-name}.md using this structure:

```markdown
# Spec Audit: [Spec Title]

**Date**: [current date]
**Spec Document**: [path-to-spec-doc]
**Companion Plan**: [path if present, otherwise "None referenced"]
**Branch**: [branch name]
**Pass**: [incremented pass number]

## Spec Summary

[2-3 sentences describing the feature scope, primary behavior being specified, and overall audit
posture]

## Audit Scope

| Check                 | Files read                 | Claims verified         |
| --------------------- | -------------------------- | ----------------------- |
| Codebase ground-truth | [N files]                  | [N claims]              |
| Plan cross-validation | [yes/no]                   | [N checks]              |
| Internal consistency  | [N sections cross-checked] | [N cross-references]    |
| Completeness          | [N use cases, N ACs]       | [N boundary conditions] |
| Testability           | [N ACs evaluated]          | [N verified testable]   |

## Verdict: [APPROVED / APPROVED WITH CHANGES / NEEDS REWORK]

[1-2 sentence justification]

## Grading

| Dimension                                | Grade | Notes |
| ---------------------------------------- | ----- | ----- |
| Correctness (claims match codebase)      | [A-F] |       |
| Plan alignment (spec covers plan fully)  | [A-F] |       |
| Internal consistency (no contradictions) | [A-F] |       |
| Completeness (no gaps in behavior)       | [A-F] |       |
| Testability (all ACs are verifiable)     | [A-F] |       |
| Error coverage (all failures handled)    | [A-F] |       |

## Findings

### Critical (Must fix before implementation)

| #   | Severity | Section | Finding         | Evidence                               | Fix          |
| --- | -------- | ------- | --------------- | -------------------------------------- | ------------ |
| 1   | CRITICAL | 3.2     | [What is wrong] | [File:line or section cross-reference] | [How to fix] |

### Inconsistencies (Must fix)

| #   | Section A | Section B  | Mismatch              | Fix                        |
| --- | --------- | ---------- | --------------------- | -------------------------- |
| 1   | 3.1       | Appendix A | [What does not match] | [Which version is correct] |

### Gaps (Behavior undefined for production scenario)

| #   | Scenario                  | What is missing    | Suggested behavior    |
| --- | ------------------------- | ------------------ | --------------------- |
| 1   | [When X happens during Y] | [Missing behavior] | [Proposed resolution] |

### Unverifiable ACs (Must rewrite)

| #   | AC   | Problem                   | Suggested rewrite  |
| --- | ---- | ------------------------- | ------------------ |
| 1   | AC-N | [Why it cannot be tested] | [Testable version] |

### Drift (Spec claims do not match codebase)

| #   | Spec claim          | Actual from codebase | File           | Fix         |
| --- | ------------------- | -------------------- | -------------- | ----------- |
| 1   | "13 existing tools" | [Actual count]       | `path/to/file` | Update spec |

### Warnings (Clarify before implementation)

| #   | Section | Ambiguity         | Suggested clarification |
| --- | ------- | ----------------- | ----------------------- |
| 1   | 3.3     | [What is unclear] | [How to clarify]        |

### Notes (Informational)

- [Observation 1]
- [Observation 2]

## Codebase Verification Log

| Spec claim        | File checked        | Verified? | Notes                 |
| ----------------- | ------------------- | --------- | --------------------- |
| [Claim from spec] | `path/to/file:line` | Yes/No    | [Details if mismatch] |

## Plan-Spec Alignment

| Plan phase          | Spec coverage     | Gap?               |
| ------------------- | ----------------- | ------------------ |
| Phase 1: Runtime    | Section 3.1, AC-1 | No                 |
| Phase 2: MCP Server | Section 3.4, AC-5 | Partial - [detail] |

## Required Before Implementation

- [ ] Fix Critical #1: [description]
- [ ] Fix Inconsistency #1: [description]
- [ ] Define Gap #1: [description]
- [ ] Rewrite AC-N: [description]

## Verdict Details

### Correctness: [PASS / CONCERNS]

[Do the spec's codebase claims match reality?]

### Plan Alignment: [PASS / CONCERNS]

[Does the spec fully cover the plan?]

### Internal Consistency: [PASS / CONCERNS]

[Does the spec contradict itself?]

### Completeness: [PASS / CONCERNS]

[Are all likely production scenarios defined?]

### Testability: [PASS / CONCERNS]

[Can every acceptance criterion be verified?]

### Error Coverage: [PASS / CONCERNS]

[Is every failure mode handled explicitly?]
```

If a section has no findings, keep the section and write `None.` instead of deleting it.

### Step 7: Final output contract

After writing the report:

1. Print Audit written to reviews/audit-{spec-base-name}.md
2. Print the `Verdict`, `Grading`, and `Required Before Implementation` sections
3. Print total finding counts in this format:

```text
Findings: X critical, X inconsistencies, X gaps, X unverifiable, X drift, X warnings, X notes
```

## Operating rules

- Read actual source code. Never trust the spec's claims about the current implementation without
  verifying them.
- Be adversarial. Assume the spec has errors until the evidence says otherwise.
- Be concrete. Reference exact sections, file paths, and line numbers whenever possible.
- Do not rubber-stamp. `APPROVED` requires zero critical issues, zero inconsistencies, and zero
  gaps.
- Cross-check exhaustively. Two sections that look reasonable in isolation may still contradict
  each other.
- Treat testability as mandatory. If you cannot describe the test, the criterion is not done.
- Prefer multiple audit passes. Each pass should reduce open findings and increase confidence.
- Respect the production bar. A spec gap becomes an implementation bug unless it is fixed now.
