# plans

> **Path:** `Agent-backend/docs/plans/`

## Purpose

Implementation plans and design documents for the Orbit fork. Contains detailed step-by-step plans for major initiatives like the OpenCode-to-Orbit rebrand and git upstream synchronization strategy.

## Usage Status

| Product             | Status   | Notes                                                                |
| ------------------- | -------- | -------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Contains the rebrand plan that guides all user-facing string changes |
| Orbit CLI           | `active` | Same                                                                 |

## Files

| File                         | Purpose                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orbit-rebrand.md`           | Comprehensive rebrand plan — surgical string replacements across ~40 files, rules for what to rename vs. keep for upstream compatibility                   |
| `STRIP-TO-SDK-AUDIT.md`      | Strip-to-SDK audit — what was removed, kept, kept as reference. **Status: COMPLETE**                                                                       |
| `STRICTNESS-UPGRADE-PLAN.md` | 7-phase plan to bring code quality up to Orbit's strictness level (ESLint, `noUncheckedIndexedAccess`, remove `any`, structured logging, pre-commit hooks) |

## Subdirectories

| Directory | Purpose                                    |
| --------- | ------------------------------------------ |
| `git/`    | Git-related plans (upstream sync strategy) |
