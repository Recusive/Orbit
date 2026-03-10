# src

> **Path:** `Agent-backend/packages/app/src/`

## Purpose

Source root for the OpenCode web UI application. Contains the SolidJS app entry point, root component with 15+ nested context providers, lazy-loaded route pages, and all subdirectories for components, context providers, pages, hooks, utilities, i18n, and addons.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                      |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Architecture patterns (provider nesting, platform abstraction, context isolation) are the main takeaways. SolidJS code is not directly reusable in Orbit's React frontend. |
| Orbit CLI           | `reference` | Same                                                                                                                                                                       |

## Files

| File                    | Purpose                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `entry.tsx`             | Web entry point — creates `Platform` object (web), renders `AppInterface`                                |
| `app.tsx`               | Root component — 15+ nested providers, lazy-loaded routes (`/` and `/:slug/session/:id`), error boundary |
| `index.css`             | Global Tailwind imports + theme CSS variables                                                            |
| `index.ts`              | Package exports for consumption by `packages/desktop`                                                    |
| `env.d.ts`              | Vite environment type declarations                                                                       |
| `sst-env.d.ts`          | SST environment type declarations                                                                        |
| `custom-elements.d.ts`  | Custom element types (symlink to `ui/src/`)                                                              |
| `theme-preload.test.ts` | Tests for theme preload logic                                                                            |

## Subdirectories

| Directory     | Purpose                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `components/` | UI components — dialogs, settings tabs, prompt input, session, terminal, file tree          |
| `context/`    | SolidJS context providers — SDK, sync, settings, files, terminal, permissions, models, i18n |
| `pages/`      | Route pages — home, session, layout, error                                                  |
| `hooks/`      | Custom hooks — `use-providers.ts`                                                           |
| `utils/`      | 32 utility modules — health monitoring, persistence, base64, DnD, speech-to-text, sounds    |
| `i18n/`       | 18 locale files (en, zh, de, fr, es, ja, ko, etc.)                                          |
| `addons/`     | Serialization utilities for terminal state persistence                                      |
