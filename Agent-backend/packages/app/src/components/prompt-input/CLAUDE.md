# prompt-input

> **Path:** `Agent-backend/packages/app/src/components/prompt-input/`

## Purpose

Extracted logic modules for the SolidJS chat input component (`prompt-input.tsx`). Pure functions and small components covering submit orchestration, request part building, prompt history, ContentEditable DOM helpers, placeholder text, slash commands, and file/image attachments.

## Usage Status

| Product             | Status      | Notes                                                                                                                                     |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Submit logic, attachment handling, history navigation, and slash command patterns are useful references for Orbit's React input component |
| Orbit CLI           | `not used`  | CLI TUI has its own prompt in `packages/opencode/src/cli/cmd/tui/component/prompt/`                                                       |

## Files

| File                     | Purpose                                                                                                                                                                    | Tests                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `submit.ts`              | Submit orchestration — builds request parts, handles session creation, worktree setup, abort controllers, comment attachment, shell mode dispatch                          | `submit.test.ts`              |
| `build-request-parts.ts` | Converts `Prompt` (content parts) into SDK `UserMessagePart[]` with base64-encoded images, file context, and comment metadata                                              | `build-request-parts.test.ts` |
| `history.ts`             | Prompt history navigation (up/down arrow), max 100 entries, cursor-position-aware direction detection                                                                      | `history.test.ts`             |
| `editor-dom.ts`          | ContentEditable DOM helpers — `createTextFragment`, `getCursorPosition`, `setCursorPosition`, range edge clamping, node length calculation                                 | `editor-dom.test.ts`          |
| `placeholder.ts`         | Dynamic placeholder text based on mode (normal/shell), comment count, and i18n                                                                                             | `placeholder.test.ts`         |
| `attachments.ts`         | File/image attachment processing — drag-and-drop, paste handling, large paste detection (8000+ chars or 120+ line breaks), accepted MIME types (PNG, JPEG, GIF, WebP, PDF) |                               |
| `slash-popover.tsx`      | `@`-mention and `/`-slash command popover with fuzzy search and keyboard navigation                                                                                        |                               |
| `context-items.tsx`      | Renders attached context items (files, selections) as removable chips                                                                                                      |                               |
| `image-attachments.tsx`  | Image attachment preview grid with remove action                                                                                                                           |                               |
| `drag-overlay.tsx`       | Drag-and-drop overlay indicator                                                                                                                                            |                               |

## Dependencies

- **SDK:** `@orbit.build/sdk/v2/client` — `Message`, `Part`, `TextPartInput`, `FilePartInput`, `AgentPartInput` types
- **UI:** `@orbit.build/ui/toast` — toast notifications
- **Util:** `@orbit.build/util/encode` (base64), `@orbit.build/util/path` (filename extraction)
- **SolidJS contexts:** `@/context/prompt`, `@/context/sdk`, `@/context/file`, `@/context/language`, `@/context/layout`, `@/context/sync`, `@/context/local`, `@/context/permission`, `@/context/global-sync`
- **Router:** `@solidjs/router` — `useNavigate`, `useParams`

## Notes

- **SolidJS-specific** — uses SolidJS `Accessor<T>` types, `onMount`/`onCleanup` lifecycle, and context imports. Not directly portable to React.
- **Pure logic is testable** — `history.ts`, `placeholder.ts`, `editor-dom.ts`, and `build-request-parts.ts` are largely framework-agnostic in their core logic, with SolidJS types only at the boundary.
- **`submit.ts` manages a `pending` Map** — tracks in-flight prompts by session ID with abort controllers, preventing duplicate submissions.
- **Large paste detection** — `attachments.ts` detects large pastes (8000+ chars or 120+ line breaks) to warn users before inserting massive content into the ContentEditable editor.
