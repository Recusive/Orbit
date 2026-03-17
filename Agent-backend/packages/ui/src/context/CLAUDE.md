# context

> **Path:** `Agent-backend/packages/ui/src/context/`

## Purpose

SolidJS context providers for the UI package. Contains 8 providers: `data.tsx` (application data), `dialog.tsx` (dialog management), `file.tsx` (file operations), `helper.tsx` (utility helpers), `i18n.tsx` (internationalization), `marked.tsx` (markdown rendering), `worker-pool.tsx` (web worker management), and `index.ts` (barrel export).

## Usage Status

| Product             | Status     | Notes                                  |
| ------------------- | ---------- | -------------------------------------- |
| Orbit Desktop (SDK) | `not used` | Desktop uses React context/Zustand     |
| Orbit CLI           | `rebuild`  | Context architecture patterns to study |
