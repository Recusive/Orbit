# pierre

> **Path:** `Agent-backend/packages/ui/src/pierre/`

## Purpose

Pierre design system utilities for the code editor/viewer. Contains 11 modules: `comment-hover.ts` (hover tooltips on comments), `commented-lines.ts` (comment detection), `diff-selection.ts` (diff range selection), `file-find.ts` (in-file search), `file-runtime.ts` (file runtime state), `file-selection.ts` (text selection), `media.ts` (media handling), `selection-bridge.ts` (selection coordination), `virtualizer.ts` (virtual scrolling), `worker.ts` (web worker integration), and `index.ts` (barrel export).

## Usage Status

| Product             | Status     | Notes                                        |
| ------------------- | ---------- | -------------------------------------------- |
| Orbit Desktop (SDK) | `not used` | Desktop uses CodeMirror                      |
| Orbit CLI           | `rebuild`  | Virtual scrolling and diff patterns to study |
