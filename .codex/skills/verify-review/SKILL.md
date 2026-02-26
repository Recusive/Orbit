---
name: verify-review
description: Verify PR review findings against real source code instead of trusting the review text. Use when asked to confirm or refute CRITICAL/WARNING findings, adjust severity based on evidence, and produce a verification report with merge guidance.
---

# Verify Review

Act as a senior engineer verifying the accuracy of a prior code review. Do not find new issues by default. Confirm or refute existing findings by reading source code.

## Input and validation

Require a review file path argument.

If the argument is missing, output exactly:

```text
Usage: /verify-review <review-file>
Example: /verify-review reviews/cycle-3-opus.md
```

Stop execution.

Set output path as:

- `reviews/verified-<filename>` where `<filename>` is the basename of the input review file
- Example: input `reviews/cycle-3-opus.md` -> output `reviews/verified-cycle-3-opus.md`

## Verdict definitions

Use exactly these verdicts:

- `CONFIRMED`: Problem exists exactly as described.
- `PARTIALLY TRUE`: Problem exists but is overstated, mitigated, or severity is wrong.
- `FALSE`: Problem does not exist, reviewer misread code, wrong lines, or logic already handles case.
- `OUTDATED`: Code changed after the review; finding no longer applies.
- `UNVERIFIABLE`: Runtime-only behavior that static analysis cannot prove.

## Step 1: Parse the review

Read the review file and extract every `CRITICAL` and `WARNING` finding into a checklist with:

- index
- severity
- file:line
- claimed problem

Also include any `SUGGESTION` finding only when it explicitly indicates a persistent cross-cycle issue (flagged 2+ cycles).

## Step 2: Verify each finding

For every selected finding, perform in order.

### 2a. Read source

Read the full referenced source file. Do not rely only on the review statement.

### 2b. Locate exact lines

Inspect the claimed lines. If lines drifted, search by code pattern and note corrected location.

### 2c. Evaluate the claim

Determine:

1. Whether the code matches what reviewer described.
2. Whether the problem is real after reading surrounding guards/fallbacks and related handlers.
3. Whether severity is appropriate.
4. For behavioral/race claims, whether a concrete triggering sequence can be proven statically. If not, mark `UNVERIFIABLE`.

Severity calibration:

- `CRITICAL`: breaks functionality, causes data loss, or security flaw.
- `WARNING`: real bug in edge case or lower practical impact.

### 2d. Record evidence

For each finding, record:

- 1-5 relevant code lines read
- whether surrounding context changes interpretation
- verdict with one-sentence justification

## Step 3: Cross-check working tree fixes

Run `git diff --stat` (working tree only, no `main`).

If uncommitted changes exist:

1. Run `git diff`
2. For each finding, determine whether current changes address it
3. Add `Fix Status`: `Fixed` | `Partial` | `Not addressed` | `N/A`

If no uncommitted changes, skip this step and note skip reason.

## Step 4: Write verification report

Write to the computed output file using this format:

```markdown
# Review Verification

**Source review**: [review filename]
**Verified by**: Claude
**Date**: [date]
**Verification method**: Static source code analysis

## Accuracy Summary

- **Total findings verified**: X
- **CONFIRMED**: X
- **PARTIALLY TRUE**: X
- **FALSE**: X
- **OUTDATED**: X
- **UNVERIFIABLE**: X
- **Accuracy rate**: X% (CONFIRMED + PARTIALLY TRUE) / total

## Detailed Verification

| #   | Sev      | Location  | Claimed Problem | Verdict   | Evidence           |
| --- | -------- | --------- | --------------- | --------- | ------------------ |
| 1   | CRITICAL | file:line | [from review]   | CONFIRMED | [1-sentence proof] |
| 2   | WARNING  | file:line | [from review]   | FALSE     | [why it's wrong]   |

## Corrected Issues List

[Only include CONFIRMED and PARTIALLY TRUE findings. Restate with corrected severity if needed.]

| #   | Corrected Sev | Location | Verified Problem | Recommended Fix |
| --- | ------------- | -------- | ---------------- | --------------- |

## False Positives

[List findings that were FALSE with brief explanation of what the reviewer got wrong.]

## Merge Recommendation (Revised)

Based on verified findings only:

**[READY | NEEDS CHANGES | NEEDS REWORK]**

**Required before merge:**

- [ ] [Only CONFIRMED CRITICALs]

**Recommended before merge:**

- [ ] [Only CONFIRMED WARNINGs]
```

## Step 5: Output contract

After writing the report, print:

1. `Verification written to [output path]`
2. `Accuracy Summary` section
3. `Corrected Issues List` table
4. `Merge Recommendation (Revised)` section

## Rules

1. Read actual code for every verdict.
2. Be skeptical and fair.
3. Avoid scope creep; do not expand into a brand-new review.
4. Treat line drift as normal; verify substance.
5. Consider full context and upstream/downstream handling.
6. Allow severity adjustments when evidence supports it.
