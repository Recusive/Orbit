---
name: audit-refactor-plan
description: Audit proposed refactor plans for production readiness in this Tauri 2 + React 19 + Rust codebase. Use when asked to evaluate a plan document for correctness, architecture, performance, tooling fit, extensibility, edge cases, and test coverage before implementation.
---

# Audit Refactor Plan

Perform a comprehensive code review and architectural audit of a proposed refactor plan.

## Input and validation

Require a plan document path.

If the path is missing, output exactly:

```text
Usage: /audit-plan <path-to-plan-doc>
Example: /audit-plan docs/ICON-THEME-SYSTEM.md
```

Stop execution.

If the path does not exist, output exactly:

```text
Plan document not found at `<path-to-plan-doc>`
```

Stop execution.

## Context

Collect context first:

- Current branch: `git branch --show-current`
- System assumptions: production Tauri 2 + React 19 app with strict TypeScript, Zustand + Immer state management, and Rust backend.

## Step 0: Understand the plan

Read the plan document fully. Extract:

1. What system is being refactored
2. Goal of the refactor
3. Current implementation files mentioned or implied
4. Proposed new files and patterns
5. Reference patterns in the codebase (similar existing systems)

## Step 1: Read current implementations

Read every file the plan proposes to change or replace. Also read:

- Direct imports and dependencies of those files
- At least one similar existing pattern for comparison (for example, if adding a provider, read an existing provider)

Stop reading only when you can answer:

- What current code does
- Inputs, outputs, and side effects
- Existing code patterns being followed

## Step 2: Audit against criteria

Evaluate every applicable section. Skip only sections that do not apply, and explicitly state what was skipped and why.

### 2.1 Correctness and proven patterns

- Verify the proposed abstraction handles the core responsibility.
- Verify chosen state management pattern (Context, Zustand, hooks, services) matches codebase conventions.
- Identify algorithmic complexity regressions.
- Identify risks to build and bundler patterns (Vite glob, tree-shaking, code splitting).

### 2.2 Architecture and design

- Evaluate API surface scope (too broad vs too narrow).
- Decide whether logic belongs in provider, hook, utility, store, or service.
- Evaluate centralization vs component co-location.
- Verify integration with related systems.
- Verify boundaries support testing.

### 2.3 Performance

- Compare current vs proposed loading and rendering strategy.
- Evaluate tree-shaking and code-splitting impact.
- Identify unnecessary re-render risks.
- Recommend memoization placement (provider, hook, component).
- Identify bundle size impact.

### 2.4 Framework and tooling best practices

- Verify consistency with codebase conventions.
- Recommend memoization (`React.memo`, `useMemo`, `useCallback`) where needed.
- Validate eager/lazy loading strategy after refactor.
- Verify ESLint, TypeScript, and import-order compatibility.

### 2.5 Production readiness

- Evaluate error handling when resources are missing.
- Evaluate fallback chain robustness.
- Identify at least 3-5 concrete edge cases not addressed.
- Verify strict type safety (no `any`, no `@ts-ignore` unless justified).
- Evaluate behavior when required providers/contexts are not mounted.
- Evaluate concurrent access and race condition risk.

### 2.6 Future extensibility

- Evaluate support for likely future capabilities.
- Evaluate compatibility path for external standards/formats.
- Evaluate path for user-facing configuration.
- Decide whether formal interfaces/schemas should be defined now.

### 2.7 Missing considerations

- Verify plan coverage across variants and modes (including dark mode and responsive behavior, when relevant).
- Evaluate handling of custom/external configuration variants.
- Evaluate validation requirements for external inputs.
- Evaluate persistence strategy (`localStorage`, backend settings, config files).

### 2.8 Test coverage

- Identify existing tests that protect regressions.
- Recommend unit tests for resolution/loading logic.
- Recommend visual regression tests for affected UI.
- Define how to verify scale and end-to-end behavior.

## Step 3: Write audit report

Write the report to `reviews/audit-plan.md` using this structure:

```markdown
# Plan Audit: [Plan Title]

**Date**: [current date]
**Plan Document**: [path-to-plan-doc]
**Branch**: [branch name]

## Plan Summary

[2-3 sentences: What the refactor does, what it replaces, and the stated goal]

## Files Reviewed

| File           | Role                   | Risk |
| -------------- | ---------------------- | ---- |
| `path/to/file` | Current implementation | High |
| `path/to/file` | Reference pattern      | Low  |

_Risk: High (core logic, many dependents), Medium (feature code), Low (utilities, tests)_

## Verdict: [APPROVE / APPROVE WITH CHANGES / NEEDS REWORK]

[1-2 sentence justification]

## Critical Issues (Must Fix Before Implementation)

| #   | Section | Problem        | Recommendation |
| --- | ------- | -------------- | -------------- |
| 1   | 2.1     | [What's wrong] | [How to fix]   |

## Recommended Improvements (Should Consider)

| #   | Section | Problem                | Recommendation |
| --- | ------- | ---------------------- | -------------- |
| 1   | 2.3     | [What could be better] | [Suggestion]   |

## Nice-to-Haves (Optional Enhancements)

| #   | Section | Idea          | Benefit        |
| --- | ------- | ------------- | -------------- |
| 1   | 2.6     | [Enhancement] | [Why it helps] |

## Edge Cases Not Addressed

[Concrete scenarios the plan does not handle]

- What happens if X?
- What happens when Y?

## Code Suggestions

[Specific code examples for critical issues and recommended improvements]

## Verdict Details

### Correctness: [PASS / CONCERNS]

[Details]

### Architecture: [PASS / CONCERNS]

[Details]

### Performance: [PASS / CONCERNS]

[Details]

### Production Readiness: [PASS / CONCERNS]

[Details]

### Extensibility: [PASS / CONCERNS]

[Details]
```

## Step 4: Final output contract

After writing the report:

1. Print `Audit written to reviews/audit-plan.md`
2. Print the `Verdict`, `Critical Issues`, and `Edge Cases` sections

## Policies

- Be thorough; this is production code.
- Do not rubber-stamp; justify approval with evidence.
- Be concrete; reference files, lines, and code patterns.
- Respect existing conventions unless there is a strong reason to deviate.
- Provide concrete code suggestions for every critical issue.
