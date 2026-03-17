---
name: spec-generator
description: Generate a production-grade behavioral specification from an approved plan document. Use when asked to turn a plan doc into a spec sheet, requirements doc, behavioral contract, acceptance-criteria document, or implementation-ready spec for this Tauri 2 + React 19 + Rust codebase.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(date:*)
  - Bash(wc:*)
  - Agent
---

# Spec Generator

Generate a production-grade behavioral specification from an approved plan document.

The spec defines what the system must do: behavior, contracts, acceptance criteria, constraints,
error handling, and measurable outcomes. The companion plan defines how to build it:
implementation phases, file changes, and rollout order. Together they form the delivery contract.

## Input and validation

Require a plan document path argument.

If the argument is missing, output exactly:

```text
Usage: /spec <path-to-plan-doc>
Example: /spec docs/plans/agent-browser-integration.md
```

Stop execution.

If the path does not exist, output exactly:

```text
Plan document not found at `<path-to-plan-doc>`
```

Stop execution.

## Context

Collect these baseline facts before writing:

- Current branch: `git branch --show-current`
- Current date: use the local system date
- System assumptions: this is a production Tauri 2 + React 19 desktop application with strict
  TypeScript, Rust backend code, and user projects at risk if the specification is wrong

## Critical Rules

These override everything else. Internalize before proceeding.

1. Read the code, not just the plan. The plan is a proposal. The codebase is reality. When they
   disagree about existing behavior, the codebase wins.
2. Every claim about existing code must be verified. Do not write "13 existing tools" because the
   plan says so. Count them in the actual source file.
3. No AI slop. No filler sentences. No "This ensures a seamless experience." Every sentence must
   convey information an implementer needs.
4. Testability is mandatory. Every AC must pass the three-part test (Input, Action, Expected
   Output). If you can't test it, don't spec it.

## Step 0: Read the plan and codebase

### 0.1 Read the plan completely

Extract:

1. Feature name and scope
2. All implementation phases
3. All files to create or modify
4. All edge cases and failure paths already called out
5. All deferred or out-of-scope items
6. Any audit history, including verdicts and key design decisions

### 0.2 Read the actual codebase

For every existing file the plan references:

1. Read the file
2. Note the real function names, APIs, schemas, tool names, constants, and current behavior
3. Distinguish behavior that changes from behavior that remains unchanged
4. If a referenced file does not exist, flag it as plan drift. Search for the functionality
   elsewhere and note the correct path.

For every new file the plan proposes:

1. Determine which module it belongs to
2. Determine what it is expected to export or expose
3. Determine what depends on it

Do not trust the plan's memory of the current implementation. The codebase is the source of truth
for existing behavior.

Stop only when you can answer all three questions confidently:

- What exists today?
- What changes?
- What stays the same?

If the plan is vague or incomplete (missing phases, unclear scope, no file tables), do not guess.
Put unresolvable gaps in Section 12 (Open Questions) with a safe default and proceed with what is
clear.

### 0.3 Check for an existing spec

Search `docs/specs/` for a matching spec. If one exists, read it before writing. Treat the task as
a revision when appropriate, not automatically as a greenfield document.

## Step 1: Derive the spec structure

Every generated spec must contain these sections:

```text
1.  Problem Statement
2.  Users and Use Cases
3.  Expected Behavior
4.  Acceptance Criteria
5.  Non-Functional Requirements
6.  Constraints
7.  Error Taxonomy
8.  Data Contracts
9.  Out of Scope
10. Risks and Mitigations
11. Success Metrics
12. Open Questions
A.  Appendix: Full Inventory
B.  Appendix: Glossary
```

Do not omit, rename, or merge sections unless the user explicitly overrides the format.

## Step 2: Write each section

### Section 1: Problem Statement

Write three subsections, each 2-4 sentences:

- What's broken: describe the current pain using real code paths and actual workflows
- Why it matters: describe the concrete impact on users or release quality
- What success looks like: one sentence describing the target outcome

Do not use generic improvement language. Tie the problem statement to actual code and actual usage.

### Section 2: Users and Use Cases

Include:

- A users table describing who uses the feature, in what context, and what pain they have today
- Between 5 and 10 numbered use cases (`UC-N`)

Each use case must include:

- A quoted user intent in a blockquote
- Numbered happy-path steps from request to verifiable outcome
- A `Key property` callout stating the invariant demonstrated by the use case

Coverage requirements:

- At least one use case must demonstrate failure recovery
- At least one use case must demonstrate backward compatibility when backward compatibility applies
- Every use case must be understandable without reading other sections first

### Section 3: Expected Behavior

Organize by subsystem or capability.

For every behavior, define:

- Input: what triggers the behavior
- Output: what the system produces
- A behavioral requirements table listing each rule and expected behavior

For tools, APIs, or commands, include a pre/postcondition table:

| Tool | Preconditions | Postconditions | Side effects |
| ---- | ------------- | -------------- | ------------ |

Rules:

- Specify deterministic behavior where the same input and state yield the same result
- If external state can vary, define behavior per state
- Keep return types consistent with Section 8 data contracts
- Describe current behavior accurately when it already exists instead of inventing replacements

### Section 4: Acceptance Criteria

Group criteria by priority:

- `P0 — Must ship`
- `P1 — Should ship`
- `P2 — Can defer`
- `P3 — Nice to have`

Every acceptance criterion must include:

1. Input
2. Action
3. Expected output

Rules:

- Every plan phase must map to at least one acceptance criterion
- Every use case must map to at least one acceptance criterion
- Keep the `P0` count to roughly 5-10 unless the user explicitly wants broader scope
- Include one criterion covering quality gates: lint, typecheck, build, and any required Rust checks
- Include one backward-compatibility criterion when backward compatibility is in scope

### Section 5: Non-Functional Requirements

Provide tables for:

- Performance: metric, target, measurement method
- Reliability: requirement, detail
- Security: requirement, detail
- Compatibility: requirement, detail

Rules:

- Every performance target must include a feasible measurement method
- Derive targets from the plan or from current known behavior
- If the target depends on instrumentation not in scope, note that in Open Questions

### Section 6: Constraints

Document hard boundaries the implementation must not violate.

Use this format:

| Constraint | Rationale |
| ---------- | --------- |

Every constraint must be enforceable and must not contradict expected behavior or acceptance
criteria.

### Section 7: Error Taxonomy

Catalog every error category the feature can surface.

Use this format:

| Error | Message template | Recovery |
| ----- | ---------------- | -------- |

Rules:

- Every failure path in Expected Behavior must appear here
- Every error must have a concrete recovery instruction
- Message templates must use real placeholder syntax such as `{path}` or `{tool}`

### Section 8: Data Contracts

Define precise TypeScript interfaces for every consumed or exposed data structure.

Rules:

- Do not use `any`
- Avoid `unknown` unless the ambiguity is intentional and explained
- Document when optional fields are present versus absent
- Include ASCII state diagrams for stateful components
- Ensure every field is referenced somewhere else in the spec

### Section 9: Out of Scope

List explicit exclusions and why they are deferred.

Use this format:

| Item | Why deferred |
| ---- | ------------ |

Rules:

- Include every out-of-scope item named by the plan
- Do not list something as out of scope if it already exists and is working today
- Ensure no in-scope requirement depends on an out-of-scope item

### Section 10: Risks and Mitigations

Use this format:

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |

Rules:

- Include at least five risks
- Include at least one risk about the plan's core technical bet
- Include at least one risk about integration with existing systems
- Write actionable mitigations

### Section 11: Success Metrics

Use this format:

| Metric | Baseline (current) | Target (post-launch) | How to measure |
| ------ | ------------------ | -------------------- | -------------- |

Rules:

- Use real baselines when available
- Mark estimates clearly when exact data does not exist
- Include at least one reliability metric
- Use measurement methods that are feasible in the current environment

### Section 12: Open Questions

Use this format:

| #   | Question | Default if unanswered | Impact |
| --- | -------- | --------------------- | ------ |

Rules:

- Only include genuinely unresolved questions
- Every question must have a safe default
- Call out when the default could still be wrong

### Appendix A: Full Inventory

Enumerate every tool, command, API, or user-facing surface the feature exposes.

Use a numbered table with:

- Name
- Status (`Existing`, `Updated`, or `New`)
- Category

Verify every entry against both the plan and the actual codebase.

### Appendix B: Glossary

Define every domain-specific term needed to read the spec without outside context.

## Step 3: Cross-validate before writing

Before writing the final file, verify:

1. Plan coverage: every plan phase has at least one acceptance criterion
2. Use case coverage: every use case is validated by at least one acceptance criterion
3. Error coverage: every failure path in Expected Behavior maps to Error Taxonomy
4. Contract coverage: every return type or payload in Expected Behavior maps to Data Contracts
5. Constraint compliance: no acceptance criterion violates a stated constraint
6. Scope compliance: no expected behavior implements an out-of-scope item
7. Inventory accuracy: Appendix A matches the verified codebase and plan surface
8. Naming consistency: tools, schemas, fields, commands, and file paths match across sections

If any check fails, fix the spec before writing the file.

## Step 4: Write the spec

Write the spec to `docs/specs/{plan-base-name}-spec.md`.

Example:

- Plan: `docs/plans/agent-browser-integration.md`
- Output: `docs/specs/agent-browser-integration-spec.md`

Use this header format:

```markdown
# Spec: [Feature Name]

> **Companion plan**: `[path to plan]`
>
> **Status**: Draft
> **Date**: [current date]
> **Scope**: [1-sentence scope]
```

## Step 5: Update the documentation index

If `docs/CLAUDE.md` exists:

1. Add the `specs/` folder to the folder guide if it is missing
2. Add the new spec file to the `specs/` listing
3. Follow the file's existing naming and listing conventions

## Step 6: Report completion

After writing, print:

1. `Spec written to docs/specs/{filename}`
2. `12 sections, {N} acceptance criteria (P0: {n}, P1: {n}, P2: {n}, P3: {n})`
3. Cross-validation summary:

```text
Cross-validation:
  Plan coverage:      {N}/{N} phases covered
  Use case coverage:  {N}/{N} UCs with ACs
  Error coverage:     {N}/{N} failure paths with errors
  Inventory accuracy: {N} tools verified against codebase
```

4. `Run /audit-spec docs/specs/{filename} to validate before implementation.`

## Operating rules

- Read the code, not just the plan. When the plan and the current code disagree about existing
  behavior, the codebase wins.
- When the plan and the desired future behavior disagree, the approved plan wins.
- Verify every claim about existing code. Do not trust counts, limits, names, or paths without
  reading the source.
- Do not write filler. Every sentence must provide implementation-relevant information.
- Do not over-specify behavior outside the plan's scope.
- Do not under-specify production behavior that will definitely occur.
- If a required behavior cannot be stated confidently, put it in Open Questions with a safe default.
- Write only testable acceptance criteria and measurable requirements.
- Assume the spec will be audited against the plan and the codebase line by line.
- Treat specification gaps as production bugs waiting to happen.
