# Typography System

This document defines the typography conventions used in Orbit, aligned with VS Code's design system for a native IDE feel.

## Quick Reference

| Token         | Size | Tailwind Class | Purpose                               |
| ------------- | ---- | -------------- | ------------------------------------- |
| —             | 9px  | `text-[9px]`   | Badges, counts, metadata, mnemonics   |
| `--text-xs`   | 10px | `text-xs`      | Small counts                          |
| `--text-sm`   | 11px | `text-sm`      | Secondary labels, metadata, status    |
| `--text-base` | 13px | `text-base`    | Primary body, chat text, tabs, labels |
| `--text-lg`   | 14px | `text-lg`      | H3 headings, emphasized text          |
| `--text-xl`   | 16px | `text-xl`      | H2 headings, icons                    |
| `--text-2xl`  | 20px | `text-2xl`     | H1 headings                           |

## Design Principles

- **13px is the base** — Primary body text, chat messages, tabs, and labels
- **Line-height: 1.5** — VS Code standard for readability
- **Font-weight: 600** — For headings and usernames
- **12px for code** — Inline and block code uses monospace at 12px

---

## VS Code Reference

### Core Editor & Terminal

| UI Element            | Font Size                           | Notes                     |
| --------------------- | ----------------------------------- | ------------------------- |
| Editor Font           | 12px (macOS) / 14px (Windows/Linux) | Platform-specific default |
| Body/Default Text     | 11px                                |                           |
| Control Labels        | 13px                                |                           |
| Part Labels (Generic) | 13px                                |                           |
| Part Titles           | 11px                                |                           |

### Editor Tabs & Title Bar

| UI Element                    | Font Size        |
| ----------------------------- | ---------------- |
| Editor Tabs                   | 13px             |
| Tab Labels                    | 13px             |
| Multi-Editor Tabs             | 16px             |
| Single-Editor Tab Decorations | 0.9em (relative) |
| Title Bar Items               | 12px             |
| Title Bar Icons               | 16px             |
| Menu Bar Items                | 12px             |
| Menu Bar Mnemonics            | 9px              |
| Command Center Text           | 14px             |
| Command Center Secondary      | 12px             |

### Sidebar & Activity Bar

| UI Element               | Font Size |
| ------------------------ | --------- |
| Activity Bar Icons       | 24px      |
| Activity Bar Badge       | 9px       |
| Activity Bar Action Menu | 13px      |
| Sidebar Tab Selector     | 11px      |
| Pane Composite Label     | 11px      |
| View Container Header    | 13px      |
| View Item Labels         | 12px      |

### Status Bar

| UI Element           | Font Size |
| -------------------- | --------- |
| Status Bar           | 12px      |
| Editor Status        | 13px      |
| Editor Status Large  | 1.8em     |
| Editor Status Medium | 1.2em     |

### Panels & Views

| UI Element                     | Font Size |
| ------------------------------ | --------- |
| Pane Composite View Title      | 11px      |
| Pane Composite View Items      | 9px       |
| Pane Composite Counts (Large)  | 10px      |
| Pane Composite Counts (Medium) | 9px       |
| Pane Composite Counts (Small)  | 8px       |

### Notifications & Banners

| UI Element                | Font Size |
| ------------------------- | --------- |
| Notification Center Title | 11px      |
| Notification Item Text    | 12px      |
| Notification Icons        | 18px      |
| Banner Text               | 12px      |

### Menus & Quick Input

| UI Element                 | Font Size |
| -------------------------- | --------- |
| Menu Entry Action          | 12px      |
| Action Widget Menu Item    | 13px      |
| Action Widget Group Header | 13px      |
| Action Widget Separator    | 12px      |
| Quick Input Button         | 11px      |
| Quick Input Separator      | 12px      |

### Hover & Tooltips

| UI Element             | Font Size |
| ---------------------- | --------- |
| Hover Widget (Normal)  | 13px      |
| Hover Widget (Compact) | 12px      |

### Settings Editor

| UI Element              | Font Size |
| ----------------------- | --------- |
| Settings Editor Tabs    | 13px      |
| Settings List Items     | 12px      |
| Settings Descriptions   | 11px      |
| Settings Header H1 Icon | 26px      |
| Settings Header H2 Icon | 22px      |
| Settings Header H3 Icon | 18px      |

### Breadcrumbs

| UI Element        | Font Size          |
| ----------------- | ------------------ |
| Breadcrumb Items  | Inherited (parent) |
| Breadcrumb Picker | 22px line-height   |

### Editor Placeholders

| UI Element              | Font Size |
| ----------------------- | --------- |
| Editor Placeholder Text | 14px      |
| Editor Placeholder Icon | 48px      |

### Chat & Input Widgets

| UI Element           | Font Size |
| -------------------- | --------- |
| Chat Input           | 13px      |
| Suggest Widget Input | 13px      |

### Icons (Codicons)

| UI Element          | Font Size |
| ------------------- | --------- |
| Codicon (Standard)  | 16px      |
| Codicon (Workbench) | 16px      |

---

## VS Code Copilot Chat Typography

### Base Typography Scale (CSS Variables)

| Variable                           | Value   | Computed       |
| ---------------------------------- | ------- | -------------- |
| `--vscode-chat-font-size-body-xs`  | 0.846em | ~11px          |
| `--vscode-chat-font-size-body-s`   | 0.923em | ~12px          |
| `--vscode-chat-font-size-body-m`   | 1em     | 13px (default) |
| `--vscode-chat-font-size-body-l`   | 1.077em | ~14px          |
| `--vscode-chat-font-size-body-xl`  | 1.231em | ~16px          |
| `--vscode-chat-font-size-body-xxl` | 1.538em | ~20px          |

### Chat Messages

| Element         | Font Size      | Weight          |
| --------------- | -------------- | --------------- |
| Username/Header | 13px           | 600 (semi-bold) |
| Message Body    | 13px (1em)     | normal          |
| Line Height     | 1.5em          | —               |
| Detail/Metadata | 12px (0.923em) | normal          |

### Markdown Headings in Chat

| Heading               | Font Size      | Weight |
| --------------------- | -------------- | ------ |
| H1                    | 20px (1.538em) | 600    |
| H2                    | 16px (1.231em) | 600    |
| H3                    | 14px (1.077em) | 600    |
| H3 (editing sessions) | 13px (1em)     | normal |

### Code Typography

| Element          | Font Size        | Font Family               |
| ---------------- | ---------------- | ------------------------- |
| Inline Code      | 12px (0.923em)   | `--monaco-monospace-font` |
| Code Block       | 0.9em (relative) | monospace                 |
| Terminal Output  | 12px             | monospace                 |
| Terminal Command | 11px (0.846em)   | monospace                 |
| Code Block Pill  | 12px (0.923em)   | —                         |

### Chat Input

| Element        | Font Size             |
| -------------- | --------------------- |
| Input Editor   | inherited (13px base) |
| Prompt Spinner | 12px                  |
| Todo Items     | 13px (1em)            |
| Min Height     | 36px                  |

### Agent/Participant Names

| Element            | Font Size | Weight |
| ------------------ | --------- | ------ |
| Agent Name (hover) | 14px      | 600    |
| Agent Details      | 12px      | normal |
| Agent Description  | 13px      | normal |
| Agent Hover Icon   | 23px      | —      |

### Status & Metadata

| Element                 | Font Size          |
| ----------------------- | ------------------ |
| Status Bar Description  | 11px               |
| Status Icon             | 12px               |
| Working Set Title       | 11px               |
| Working Set Line Counts | 11px (weight: 500) |

### Inline Chat

| Element            | Font Size           |
| ------------------ | ------------------- |
| Status Label       | 11px                |
| Status Icon        | 12px                |
| Action Buttons     | 12px                |
| Anchor Widget Code | 90% (100% on hover) |

### Confirmation Widgets

| Element      | Font Size      | Weight |
| ------------ | -------------- | ------ |
| Title        | 12px           | 600    |
| Buttons      | 12px (0.923em) | normal |
| Message      | 12px (0.923em) | normal |
| Buttons (v2) | 13px (1em)     | normal |

### Terminal Tool Progress

| Element            | Font Size      |
| ------------------ | -------------- |
| Command Block Code | 11px (0.846em) |
| Decoration Icon    | 13px           |
| Content Message    | 12px (0.923em) |
| Output Info        | 11px (0.846em) |

### Sessions & History

| Element              | Font Size |
| -------------------- | --------- |
| Option Label Chevron | 12px      |
| Sessions List Title  | 14px      |
| Sessions List Date   | 16px      |
| Sessions Count       | 0.9em     |

### Welcome View

| Element                      | Font Size        |
| ---------------------------- | ---------------- |
| Welcome Icon                 | 40px             |
| Welcome Icon (large)         | 72px             |
| Section Header               | 11px (uppercase) |
| Suggested Prompt Title       | 13px             |
| Suggested Prompt Description | 13px             |
| History Header               | 11px (uppercase) |
| Setup Text                   | 11px             |

### Models & Management

| Element                   | Font Size |
| ------------------------- | --------- |
| Model Capability Badge    | 11px      |
| Model Token Limits Icon   | 12px      |
| Models Widget Header      | 12px      |
| Usage Widget              | 13px      |
| Management Editor Heading | 26px      |

### Compact Mode

| Element     | Size        |
| ----------- | ----------- |
| Avatar Icon | 12px        |
| Avatar Size | 18px × 18px |

---

## Summary by Size

| Size    | Used For                                                           |
| ------- | ------------------------------------------------------------------ |
| 8-9px   | Badges, counts, metadata, mnemonics                                |
| 10-11px | Secondary labels, descriptions, part titles                        |
| 12px    | Standard UI text, notifications, status bar, menus, **code**       |
| 13px    | Primary labels, tabs, control labels, hover widgets, **chat body** |
| 14px    | Editor text (Windows/Linux), command center, placeholders, **H3**  |
| 16px    | Icons (codicons), title bar icons, **H2**                          |
| 18-24px | Large icons, notification icons, activity bar                      |
| 26-48px | Headers, placeholder icons                                         |

---

## Implementation in Orbit

### Tailwind Tokens (globals.css)

```css
@theme inline {
  /* Font size tokens (VS Code typography scale) */
  --text-xs: 10px; /* Small counts */
  --text-sm: 11px; /* Secondary labels, metadata, status */
  --text-base: 13px; /* Primary body, chat text, tabs, labels */
  --text-lg: 14px; /* H3, command center, emphasized text */
  --text-xl: 16px; /* H2, icons, multi-editor tabs */
  --text-2xl: 20px; /* H1 headings */
}
```

### Chat Markdown Headings

```css
.chat-markdown h1 {
  font-size: 1.25rem;
} /* 20px */
.chat-markdown h2 {
  font-size: 1rem;
} /* 16px */
.chat-markdown h3 {
  font-size: 0.875rem;
} /* 14px */
.chat-markdown h4,
.chat-markdown h5,
.chat-markdown h6 {
  font-size: 0.8125rem;
} /* 13px */
```

### Code Blocks

```css
.chat-markdown code:not(pre code) {
  font-size: 0.75rem; /* 12px */
}

[data-streamdown='code-block-body'] {
  font-size: 0.75rem; /* 12px */
}
```

---

## When to Use Each Size

| Use Case                   | Size | Class                |
| -------------------------- | ---- | -------------------- |
| Chat message body          | 13px | `text-base`          |
| Sidebar conversation items | 13px | `text-base`          |
| Tab labels                 | 13px | `text-base`          |
| Button text (primary)      | 13px | `text-base`          |
| Secondary descriptions     | 11px | `text-sm`            |
| Metadata / timestamps      | 11px | `text-sm`            |
| Inline code                | 12px | `text-[12px]` or CSS |
| Badges / counts            | 9px  | `text-[9px]`         |
| H1 headings                | 20px | `text-2xl`           |
| H2 headings                | 16px | `text-xl`            |
| H3 headings                | 14px | `text-lg`            |

---

## Best Practices

1. **Use 13px for primary interactive text** — labels, tabs, chat messages, menus
2. **Use 12px for code** — inline and block, always with monospace font
3. **Use 11px for secondary text** — descriptions, metadata, status labels
4. **Use 9px for badges** — counts, small metadata only
5. **Apply font-weight: 600** — to usernames and all headings
6. **Keep line-height at 1.5** — standard for readability in message bodies
7. **Avoid mixing pixel and rem** — stick to the token system for consistency

---

_Last updated: January 2026_
