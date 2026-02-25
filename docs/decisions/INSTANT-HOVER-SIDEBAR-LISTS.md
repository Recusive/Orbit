# Decision: Instant Hover for Sidebar & List Items

**Date:** 2026-02-25
**Status:** Implemented
**Branch:** `fix/0.0.5`

---

## Problem

When moving the pointer quickly up and down over sidebar conversation items, the highlight background visibly lagged behind the pointer. Text color snapped instantly (no transition), but the background faded over 100ms — creating a disconnected, sluggish feel. The same pattern appeared across all list-style components: sidebar items, dropdown menus, select items, git change lists, and file explorer rows.

Additionally, every sidebar item applied `backdrop-blur-[20px]` on hover, triggering a gaussian blur paint pass per frame in WKWebView — expensive even on capable hardware, and explicitly warned against in the project's own Agent CLAUDE.md.

## Root Cause Analysis

Three compounding issues:

### 1. Background transition on high-frequency items

```tsx
// ConversationItem.tsx — before
'transition-[background-color,padding] duration-100';

// SidebarItem.tsx — before
'transition-[background-color,transform] duration-100';
```

Per Emil's **Frequency Principle**: sidebar items are hovered 100+ times per session. At that frequency, even 100ms transitions create perceptible lag — the background is still fading in while the pointer has already moved to the next row.

### 2. Paired Elements Rule violation

Text color (`hover:text-foreground`) had **no** CSS transition — it snapped instantly. Background (`hover:bg-lg-sidebar-hover`) had 100ms. When scanning a list quickly, text "arrived" one frame after mouseenter while background was still interpolating from the previous row.

### 3. `backdrop-blur-[20px]` on hover

```tsx
// Before — on every sidebar item
'hover:backdrop-blur-[20px]';
```

`backdrop-filter: blur()` triggers paint on every frame during the transition. On rapid hover sweeps, multiple items have active blur operations simultaneously. The `bg-lg-sidebar-hover` color is already opaque — the blur added GPU cost for zero perceptible visual difference.

## What Changed

### 1. Removed all hover transitions from list items

Background color and text color now snap instantly — no transition property, no duration. The highlight tracks the pointer 1:1.

```tsx
// ConversationItem.tsx — after
'flex items-center h-7 w-full rounded-[9px] pl-[7px] overflow-hidden';
// No transition on background or text

// SidebarItem.tsx — after
'hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75';
// Only transform transitions (for press feedback)
```

### 2. Narrowed transitions to transform-only for press feedback

Items with `active:scale-[0.98]` press feedback keep a scoped `transition-transform duration-75`. This preserves the tactile press feel (75ms is snappy for a button press) while removing background from the transition entirely.

### 3. Removed `backdrop-blur-[20px]` from all sidebar items

Both hover and static `backdrop-blur-[20px]` removed. The opaque background colors render identically without blur.

### 4. Updated `TRANSITION_CLASSES` constants

The centralized transition constants in `constants.ts` were updated to match:

```typescript
// Before
button: 'transition-[background-color,color,transform] duration-150',
item: 'transition-[background-color,transform] duration-150',

// After
button: 'transition-transform duration-75',
item: 'transition-transform duration-75',
```

This propagates to all consumers: ModelSelector items, EffortLevelButton, ThinkingModeButton, InputControls, MoreActionsMenu.

### 5. Fixed `transition-all` violations

Two dialog components used `transition-all`, which transitions every CSS property including layout-triggering ones. Replaced with scoped `transition-transform`:

```tsx
// ConversationDeleteDialog.tsx — before
'transition-all duration-150 active:scale-[0.97]';

// After
'transition-transform duration-75 active:scale-[0.97]';
```

### 6. Removed transitions from dropdown/select items

`DropdownMenuItem` and `SelectItem` had `transition-colors duration-150`. Removed — these are scanned as rapidly as sidebar items.

## Scope

### Files modified (19 files)

| Category               | Files                                                                                                              | Change                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sidebar items          | `ConversationItem`, `SidebarItem`, `PowersSection`, `WorkspaceItem`, `WorktreeItem`, `NavItem`, `ConversationList` | Removed `backdrop-blur-[20px]`, removed bg transition, kept `transition-transform duration-75` for press |
| Dropdown/select        | `dropdown-menu.tsx`, `select.tsx`, `model-selector.tsx`                                                            | Removed `transition-colors` for instant hover                                                            |
| Git list items         | `ChangeItem`, `DiffFileCard`, `ChangesList`                                                                        | Removed bg transitions on rows, narrowed icon buttons to `transition-transform duration-75`              |
| Icon buttons           | `PrimarySidebar`, `content-top-bar`, `ConversationList`                                                            | Narrowed to `transition-transform duration-75`                                                           |
| `transition-all` fixes | `ConversationDeleteDialog`, `ask-user-question-modal`                                                              | Replaced `transition-all` with `transition-transform`                                                    |
| Constants              | `constants.ts` (`TRANSITION_CLASSES`)                                                                              | Both `.button` and `.item` narrowed to `transition-transform duration-75`                                |
| Decorative             | `account-banner.tsx`                                                                                               | Last `backdrop-blur-[20px]` removed                                                                      |

### Not changed (intentionally kept)

| Element                                 | Why kept                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Git action buttons (commit, push, pull) | Discrete actions clicked occasionally — 150ms is appropriate per the timing reference |
| Dialog CTA buttons                      | Low frequency, benefit from gentle feedback                                           |
| Feedback/skills/vault cards             | Cards, not list items — not scanned rapidly                                           |
| `TabButton`                             | Tab switching indicator, not a hover-scanned list                                     |
| Resize handle                           | `transition-colors duration-100` on a structural separator                            |
| `button.tsx` (global Button)            | Shared across all contexts — some consumers need the transition                       |

## Design Principles Applied

| Principle                          | Source                       | Application                                                                                         |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Frequency Principle                | Emil — Animations            | 100+ times/day → no animation. Sidebar items are high-frequency.                                    |
| Paired Elements Rule               | Emil — Animations            | Text + background must share timing. Both are now instant.                                          |
| Only animate transform and opacity | Emil — Golden Rule           | Removed `background-color`, `padding`, `color` from transitions. Only `transform` remains.          |
| No `transition-all`                | Web Animation Best Practices | Replaced with scoped `transition-transform` in two dialog components.                               |
| Avoid blur > 20px                  | Emil — Performance           | Removed all `backdrop-blur-[20px]` from interactive elements.                                       |
| WKWebView blur workaround          | Agent CLAUDE.md              | "Avoid `backdrop-filter: blur()`" — now enforced across sidebar.                                    |
| Scoped transitions                 | Web Animation Best Practices | Every transition specifies exact properties — no `transition-all`, no `transition-colors` on lists. |

## Visual Result

Identical appearance. The background color, text color, and hover highlight are the same CSS values. The only difference is timing: everything snaps on instantly instead of fading over 100-150ms. This matches the behavior of Raycast, Linear, and Arc sidebar lists.
