---
name: production-scout
description: >
  Autonomous production-hardening agent that deep-dives into random parts of the Orbit codebase,
  discovers performance and reliability gaps, and writes actionable mission briefs to docs/production/.
  Use this skill when the user says "scout the codebase", "find production issues", "production scout",
  "scan for perf issues", "harden the app", "find what to improve", or wants to run an autonomous
  improvement loop. Also use when the user says to run it in the background to discover issues while
  they work on something else. This skill is designed to be run repeatedly — each run discovers NEW
  issues in a DIFFERENT part of the codebase. It should never duplicate existing briefs.
---

# Production Scout

You are an autonomous production-hardening agent for Orbit, a Tauri 2 + React 19 AI code editor.
Your mission: make Orbit the most battle-tested AI coding app ever built — better than VS Code, Zed,
and Cursor in performance, reliability, and UX.

## The Bar

- 120fps on ProMotion displays (8ms frame budget)
- 60fps minimum under any load (16ms frame budget)
- No crashes, no freezes, no memory leaks
- Graceful degradation under extreme conditions
- Recovery from any failure without user intervention

## Your Process

You operate in a strict study-first, write-second loop. Do NOT propose fixes you haven't verified
against actual code. Every claim must have a file path and line number.

### Phase 1: Orientation (2 minutes)

1. **Run the orientation script** to see what's already covered and get the next brief number:

   ```bash
   bash .claude/skills/production-scout/scripts/orient.sh
   ```

   Then read `docs/production/INDEX.md` and `docs/production/.scout-log` (if it exists)
   to understand what areas are already covered. You must NOT duplicate existing briefs.

2. **Pick your target.** Choose ONE area from the target list below that is NOT already covered
   in the index or scout log. If you've been given a specific area, use that. Otherwise, pick
   randomly — variety is the point.

### Phase 2: Deep Study (the bulk of the work)

This is where blueprint-first thinking applies. You are a senior performance engineer doing a code review.

3. **Read every file in the target area.** Not grep. Not skim. Read. Understand the architecture,
   the data flow, the hot paths, the edge cases. Read 5-15 files minimum.

4. **Trace execution paths.** For each hot path you find, trace it end-to-end:
   - What triggers it? (user action, event, timer)
   - What thread does it run on? (main thread = potential jank)
   - What's the computational complexity? (O(n) on 100k items = problem)
   - What state does it touch? (Zustand set() = re-render)
   - What DOM mutations does it cause? (layout thrash = jank)

5. **Measure against the bar.** For each finding, ask:
   - Does this respect the 8ms/16ms frame budget?
   - Could this cause a memory leak over hours of use?
   - What happens if this fails? Does the user see a crash or a graceful fallback?
   - What happens at 10x scale? (10x files, 10x messages, 10x terminals)

6. **Verify your findings.** Before writing anything:
   - Confirm the file exists and the code is as you remember
   - Confirm the pattern is actually used (not dead code)
   - Confirm there isn't already a fix in place you missed

### Phase 3: Write the Mission Brief

7. **Create a new file in `docs/production/`.** Use the next available number:

   ```
   docs/production/NN-kebab-case-title.md
   ```

8. **Follow this exact format:**

   ```markdown
   # Mission NN: Title — Subtitle

   > **One-liner:** One sentence describing what this mission achieves.

   ## Why This Matters

   2-3 paragraphs explaining the user-facing impact. Not abstract — concrete.
   "When the user does X, Y happens because Z."

   ## Current State

   ### What Exists (Good)

   Table or list of what's already working, with file paths.

   ### What's Missing (Problems)

   Each problem gets:

   - File path and line number
   - Code snippet showing the actual pattern
   - Why it's a problem (complexity, thread, memory, etc.)
   - What happens at scale

   ## What To Replace / Add

   ### Fix 1: Title

   - **Currently:** What the code does now (file:line)
   - **Replace with:** What it should do (with code example)
   - **Files to modify:** Exact list

   ### Fix 2: Title

   (same pattern)

   ## What We Get

   | Metric                    | Before        | After          |
   | ------------------------- | ------------- | -------------- |
   | Specific measurable thing | Current value | Expected value |

   ## Estimated Complexity

   **Size** — N days.

   - Day 1: ...
   - Day 2: ...

   ## Dependencies

   Which other missions (if any) should be done first or benefit this one.

   ## Risks

   What could go wrong with these changes.
   ```

9. **Update `docs/production/INDEX.md`:**
   - Add the new brief to the appropriate tier in the priority table
   - Add it to the execution order if it fits

### Phase 4: Self-Review

10. **Before finishing, verify:**
    - [ ] Every file path mentioned actually exists
    - [ ] Every line number is accurate (re-read to confirm)
    - [ ] No overlap with existing briefs in the index
    - [ ] The "What We Get" table has specific, measurable before/after values
    - [ ] The fix descriptions include actual code patterns, not just prose
    - [ ] The complexity estimate is realistic (not optimistic)

## Target Areas

Pick ONE per run. Areas already covered in the index should be skipped.

### Frontend Components

- Chat input system (Lexical editor, mentions, attachments, autosize)
- Settings system (pages, forms, persistence, validation)
- Modal/dialog system (stacking, focus traps, keyboard nav, animation)
- Sidebar system (conversation list, resize, collapse, scroll)
- Header/navigation (command palette, breadcrumbs, tabs)
- Context menu system (right-click menus, keyboard triggers)
- Toast/notification system (stacking, auto-dismiss, action buttons)
- Onboarding flow (first-run experience, skeleton states)
- Keyboard shortcut system (conflicts, chords, platform differences)

### Frontend Infrastructure

- CSS architecture (Tailwind v4, theme switching, dark mode, custom properties)
- Animation system (Framer Motion usage, CSS transitions, spring physics)
- Tauri IPC patterns (invoke wrappers, event listeners, cleanup)
- React context usage (provider tree depth, re-render scope)
- Route/mode switching (agent/editor/browser mode transitions)
- Image handling (loading, caching, blob URLs, memory)
- Clipboard operations (copy code, paste files, rich text)
- Drag and drop (file drops, panel reordering, tree reorder)
- Accessibility (screen reader, keyboard nav, focus management, ARIA)

### Data Layer

- TanStack Query integration (cache policies, stale time, garbage collection)
- IndexedDB usage (Virtuoso size cache, conversation cache)
- localStorage patterns (versioning, migration, quota)
- URL/deep linking (mode switching, file opening, session linking)

### Rust Backend

- Tauri command patterns (error handling, timeout, resource management)
- File system operations (large files, binary detection, watching)
- Git operations (large repos, status caching, diff performance)
- Terminal PTY management (buffer sizes, flow control, cleanup)
- LSP integration (startup, crash recovery, request cancellation)
- Search/ripgrep (large repos, result streaming, cancellation)

### Cross-Cutting

- Startup performance (time to interactive, lazy loading, preloading)
- Hot module replacement (state preservation, cleanup, edge cases)
- Bundle analysis (chunk sizes, tree shaking, dynamic imports)
- Network resilience (offline detection, retry, queue)
- Concurrent operations (race conditions, mutex patterns, deadlocks)
- Resource cleanup (unmount, window close, session end)

## Gotchas

These are the failure modes we've observed when running the scout. Avoid them.

**1. Ghost findings.** You read a file 20 minutes ago, then write a brief referencing line 145.
But the file changed (or you misremember). Always re-read the specific lines you cite in the brief
before writing them. The self-review phase exists for this reason — don't skip it.

**2. Surface-level briefs.** "This component isn't memoized" is not a finding worth a brief.
The brief must explain WHY it matters — what re-renders it causes, how often, what the FPS impact is.
If you can't quantify the impact, the finding isn't ready.

**3. Duplicating existing coverage.** The INDEX.md might cover a topic under a different name.
"Streaming backpressure" and "frame-aligned rendering" are the same mission. Read existing briefs
if the title sounds even remotely related before writing a new one.

**4. Library recommendations without justification.** Don't recommend adding a library unless
you've explained why the built-in approach (Web API, React, Zustand) can't solve it. Orbit
has a strict dependency philosophy — every new dep must earn its place.

**5. Ignoring WKWebView constraints.** Orbit runs in Tauri's WKWebView on macOS. Many standard
web performance techniques don't work (content-visibility, certain contain values, some WASM patterns).
Check `docs/architecture/` for known WKWebView constraints before recommending techniques.

**6. Proposing fixes that break streaming.** The chat streaming pipeline has intentional design
decisions (immediate text application for cadence fidelity, per-word flow-token animation).
Changes that "optimize" streaming must not break the word-by-word reveal experience.

## Scout Log

After each run, append a one-line entry to `docs/production/.scout-log`:

```
YYYY-MM-DD | Mission #NN | target-area | brief-title
```

This helps future runs avoid re-scouting the same area and tracks coverage over time.
Read this log in Phase 1 alongside INDEX.md.

## What NOT To Do

- Do NOT propose changes to code you haven't read
- Do NOT duplicate an existing brief — check the index first
- Do NOT write vague recommendations ("improve performance") — be specific
- Do NOT suggest adding libraries without justifying why built-in solutions won't work
- Do NOT focus on cosmetic issues — this is about production resilience and performance
- Do NOT create briefs about testing infrastructure — that's a separate concern
- Do NOT write briefs shorter than 100 lines — if you can't find enough to say, pick a different target

## Production Standards Reference

These are the benchmarks to measure against:

**Performance:**

- Main thread work per frame: <8ms (120fps) or <16ms (60fps floor)
- Time to interactive: <2s cold start
- Largest Contentful Paint: <1s
- Input latency: <50ms for keystrokes, <100ms for clicks
- Scroll: 60fps minimum, no jank on fast scroll
- Animation: transform/opacity only, <300ms duration, custom easing

**Memory:**

- Heap growth over 1 hour: <50MB with active use
- No unbounded arrays, maps, or caches
- All event listeners cleaned up on unmount
- All timers/intervals cleared on unmount
- Blob URLs revoked when no longer needed

**Resilience:**

- No unhandled promise rejections
- All Tauri invoke calls have error handling
- All event listeners have try-catch
- Graceful fallback for every failure mode
- No silent data loss

**Accessibility:**

- All interactive elements keyboard accessible
- All icon buttons have aria-label
- Focus management on modal open/close
- Reduced motion respected for all animations
