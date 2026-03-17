# packages/ui

> **Path:** `Agent-backend/packages/ui/`

## Purpose

Shared SolidJS component library (`@orbit.build/ui`) with 175 components, theme system, hooks, context providers, i18n, and assets. Built on Tailwind CSS + Kobalte (SolidJS equivalent of Radix UI). Provides the design system for both the web app (`packages/app`) and desktop apps.

## Usage Status

| Product             | Status     | Notes                                                                                                                                                             |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `not used` | Orbit uses React, not SolidJS. No SolidJS components are usable. However, the theme system, color definitions, icon sets, and design patterns serve as reference. |
| Orbit CLI           | `rebuild`  | If Orbit CLI gets a web mode, the component library would need a React rebuild. The 175 components represent a complete design system spec.                       |

## Key Directories

| Directory                        | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `src/components/`                | 175 SolidJS components (buttons, dialogs, inputs, lists, tabs, etc.) |
| `src/components/provider-icons/` | LLM provider logos (Anthropic, OpenAI, Google, etc.)                 |
| `src/components/file-icons/`     | File type icons for file tree                                        |
| `src/components/app-icons/`      | Application icons                                                    |
| `src/context/`                   | Shared context providers (dialog, file, i18n, marked)                |
| `src/hooks/`                     | Shared hooks                                                         |
| `src/theme/`                     | Theme system with multiple themes (`themes/` subdirectory)           |
| `src/styles/`                    | Global styles + Tailwind configuration (`tailwind/`)                 |
| `src/i18n/`                      | Internationalization dictionaries                                    |
| `src/pierre/`                    | "Pierre" design system utilities                                     |
| `src/storybook/`                 | Storybook integration helpers                                        |
| `src/assets/`                    | Fonts, audio files, favicon, images, icons                           |

## Export Map (Extensive)

```
@orbit.build/ui/*           → src/components/*.tsx (175 components)
@orbit.build/ui/hooks       → src/hooks/index.ts
@orbit.build/ui/context      → src/context/index.ts
@orbit.build/ui/context/*    → src/context/*.tsx
@orbit.build/ui/theme        → src/theme/index.ts
@orbit.build/ui/theme/*      → src/theme/*.ts
@orbit.build/ui/styles       → src/styles/index.css
@orbit.build/ui/i18n/*       → src/i18n/*.ts
@orbit.build/ui/pierre       → src/pierre/index.ts
@orbit.build/ui/fonts/*      → src/assets/fonts/*
@orbit.build/ui/audio/*      → src/assets/audio/*
@orbit.build/ui/icons/*      → icon type definitions
```

## Notes

- **175 components** is a large, mature design system — approaching shadcn/ui scale but for SolidJS.
- **Kobalte** is the SolidJS equivalent of Radix UI — provides accessible primitives that the UI library wraps with styling.
- **"Pierre"** appears to be an internal design system utility layer (similar to how some teams name their design token systems).
- **Audio assets** — notification and feedback sounds bundled with the library.
- **The theme system** with multiple theme files is the most reusable part for Orbit — color palettes, spacing scales, and design tokens translate regardless of framework.
