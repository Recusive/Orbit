# CLAUDE.md - Architecture Decision Records

This file provides guidance to Claude Code when working in the `docs/decisions/` directory.

> **Parent Documentation:** See [`../CLAUDE.md`](../CLAUDE.md) for the full docs index.

---

## Purpose

Decision records (ADRs) capture **why** a non-obvious technical choice was made. They preserve context that would otherwise be lost — the alternatives considered, the bugs hit along the way, and the design principles applied.

---

## When to Create a Decision Record

Create one when a change involves:

- A workaround for a platform limitation (e.g. WKWebView, NSWindow, Tauri quirks)
- A deliberate trade-off between competing approaches (e.g. single-property animation vs. transform)
- A multi-file layout or architecture change where the "why" isn't obvious from the diff
- A fix that required multiple failed attempts before arriving at the solution

Do **not** create one for straightforward bug fixes, simple refactors, or feature additions where the code is self-explanatory.

---

## Template

Every decision record follows this structure:

```markdown
# Decision: [Short Title]

**Date:** YYYY-MM-DD
**Status:** Implemented | Proposed | Superseded
**Branch:** `branch-name`

---

## Problem

What was broken or missing. Include screenshots or diagrams if visual.

## Root Cause Analysis (if applicable)

Why the obvious fix didn't work. Technical deep-dive.

## What Changed

### 1. Change Name (file.tsx)

**File:** `path/to/file`

Code snippets showing before/after with explanation.

## Why Not [Alternative]

Explain rejected approaches and why they failed.

## Architecture

ASCII diagram showing the flow/structure.

## Design Principles Applied

| Principle | Source | Application |
| --------- | ------ | ----------- |

## Files Modified

| File | Change |
| ---- | ------ |
```

---

## Current Records

| File                                   | Summary                                                                                       | Date       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| `BROWSER-WINDOW-CORNER-RADIUS.md`      | Native CALayer rounding for embedded browser — CSS can't clip NSWindows                       | 2026-02-23 |
| `CHAT-PANEL-MINIMUM-WIDTH.md`          | Constant 400px chat floor, dynamic activity cap, sidebar auto-collapse, header overflow fade  | 2026-02-24 |
| `SIDEBAR-ANIMATION-SINGLE-PROPERTY.md` | Single margin-left slide instead of two-property transition to eliminate desync jank          | 2026-02-24 |
| `INSTANT-HOVER-SIDEBAR-LISTS.md`       | Instant hover for all list items — removed backdrop-blur, bg transitions, transition-all      | 2026-02-25 |
| `BLUR-REVEAL-SIDEBAR-TRANSITIONS.md`   | Container-level blur reveal for sidebar view switches — skeleton hold, key-based remount      | 2026-03-12 |
| `OVERFLOW-CLIP-VS-HIDDEN.md`           | overflow-clip over overflow-hidden for layout containers — prevents scrollIntoView card shift | 2026-03-18 |

---

## Conventions

- **File naming:** `UPPER-CASE-KEBAB.md` describing the decision topic
- **One decision per file** — don't combine unrelated changes
- **Include code snippets** — before/after diffs make the record self-contained
- **Link to design principles** — reference Emil's animation rules, Vercel best practices, or web design guidelines where applicable
- **Update the index** — after creating a new file, add it to both this table and `docs/CLAUDE.md`
