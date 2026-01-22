# Edge Case Patterns by Component Type

Use this reference to discover edge cases when analyzing components.

---

## List/Table Components

| Edge Case                    | What to Test                              |
| ---------------------------- | ----------------------------------------- |
| Empty list                   | Renders empty state, no crashes           |
| Single item                  | Renders correctly, can be selected        |
| Many items (100+)            | Performance, virtualization if applicable |
| Long text content            | Truncation, tooltips                      |
| Selecting first item         | Boundary behavior with keyboard           |
| Selecting last item          | Boundary behavior with keyboard           |
| Deleting last remaining item | Returns to empty state                    |
| Rapid selection changes      | State consistency                         |

---

## Form/Input Components

| Edge Case              | What to Test                                  |
| ---------------------- | --------------------------------------------- |
| Empty input submission | Validation feedback                           |
| Whitespace-only input  | Treated as empty or valid?                    |
| Maximum length input   | Truncation, counter display                   |
| Special characters     | Quotes, angle brackets, unicode (中文, émoji) |
| Paste vs typing        | Same validation behavior                      |
| Rapid input changes    | Debounce edge cases, no stale state           |
| Submit while loading   | Button disabled, no double submit             |
| Field focused on mount | Autofocus behavior                            |

---

## File/Path Components

| Edge Case                   | What to Test                            |
| --------------------------- | --------------------------------------- |
| Root path (`/`)             | Handles correctly, no parent navigation |
| Paths with spaces           | `/my folder/file.txt` renders correctly |
| Unicode filenames           | `文档.txt`, `émoji-🎉.md`               |
| Very long paths             | Truncation with tooltip                 |
| Non-existent paths          | Error state display                     |
| Permission denied           | Error handling, retry option            |
| Hidden files (`.gitignore`) | Visibility toggle if applicable         |
| Symlinks                    | Display differently or follow?          |

---

## Async Data Components

| Edge Case                      | What to Test                    |
| ------------------------------ | ------------------------------- |
| Loading state on mount         | Spinner/skeleton shown          |
| Error state display            | Error message, retry button     |
| Stale data after param change  | Old data cleared, loading shown |
| Unmount during pending request | No state update after unmount   |
| Empty response vs null         | Distinguished correctly         |
| Network timeout                | Timeout error handling          |
| Retry after failure            | Clears error, shows loading     |
| Multiple rapid requests        | Correct final state (no race)   |

---

## Modal/Dialog Components

| Edge Case                     | What to Test                        |
| ----------------------------- | ----------------------------------- |
| Escape key dismissal          | Closes modal                        |
| Click outside dismissal       | Closes modal (if enabled)           |
| Focus trap at boundaries      | Tab cycles within modal             |
| Nested modals                 | Proper z-index, focus management    |
| Rapid open/close              | No animation glitches               |
| Scroll lock on body           | Body doesn't scroll when modal open |
| Form in modal with validation | Errors display correctly            |
| Long content                  | Scrollable modal body               |

---

## Dropdown/Select Components

| Edge Case           | What to Test                      |
| ------------------- | --------------------------------- |
| No options          | Empty state or disabled           |
| Single option       | Can select, no empty state        |
| Many options (100+) | Virtualization, search filter     |
| Long option text    | Truncation                        |
| Keyboard navigation | Arrow keys, Enter, Escape         |
| Type-to-select      | First matching option highlighted |
| Clear selection     | Returns to placeholder            |
| Disabled options    | Cannot select, visually distinct  |

---

## Tab/Navigation Components

| Edge Case                    | What to Test                                |
| ---------------------------- | ------------------------------------------- |
| First tab active by default  | Correct initial state                       |
| Navigate to last tab         | Boundary with keyboard                      |
| Disabled tabs                | Cannot navigate to, skipped in keyboard nav |
| Dynamic tabs (add/remove)    | Focus management                            |
| Tab with unsaved changes     | Confirmation before switch                  |
| Deep linking to specific tab | URL sync if applicable                      |
| Tab overflow                 | Scroll or collapse behavior                 |

---

## Tree/Hierarchy Components

| Edge Case                  | What to Test                            |
| -------------------------- | --------------------------------------- |
| Empty tree                 | Shows placeholder                       |
| Single root node           | Renders correctly                       |
| Deeply nested (10+ levels) | Performance, indentation                |
| Expand/collapse all        | All nodes toggle                        |
| Select parent vs children  | Selection inheritance rules             |
| Drag to different level    | Re-parenting behavior                   |
| Keyboard navigation        | Arrow keys for expand/collapse/navigate |
| Lazy loading children      | Loading state per node                  |

---

## Router/Route Components

| Edge Case                     | What to Test                             |
| ----------------------------- | ---------------------------------------- |
| Direct URL access (deep link) | Component loads with correct data        |
| Missing route params          | Error boundary or redirect               |
| Malformed route params        | Sanitization, error handling             |
| Back/forward navigation       | State preserved correctly                |
| Protected route redirect      | Redirects to login, preserves return URL |
| Concurrent navigation         | Only final route renders                 |
| Hash vs history routing       | Both work if supported                   |
| Route param changes           | Refetches data appropriately             |

---

## Drag and Drop Components

| Edge Case                | What to Test                                 |
| ------------------------ | -------------------------------------------- |
| Drop on invalid target   | No action, visual feedback                   |
| Drop on same position    | No-op, no state change                       |
| Cancel mid-drag (Escape) | Reverts to original position                 |
| Drag outside container   | Handles gracefully                           |
| Keyboard drag mode       | Space to grab, arrows to move, Space to drop |
| Nested droppable areas   | Correct target receives drop                 |
| Drag preview/overlay     | Shows correct item                           |
| Cleanup on unmount       | No memory leaks, handlers removed            |

---

## Virtualized/Windowed Components

| Edge Case                  | What to Test                               |
| -------------------------- | ------------------------------------------ |
| Empty list                 | Shows empty state                          |
| Single item                | Renders correctly                          |
| Scroll to specific item    | Item brought into view                     |
| Scroll to first/last       | Boundary handling                          |
| Dynamic item heights       | Renders correctly, no jumping              |
| Rapid scrolling            | No visual artifacts                        |
| Resize during scroll       | Recalculates correctly                     |
| Focus in virtual list      | Keyboard navigation works                  |
| Data update while scrolled | Maintains position or resets appropriately |

---

## Animated Components

| Edge Case                 | What to Test                     |
| ------------------------- | -------------------------------- |
| Reduced motion preference | Animation disabled or simplified |
| Animation interrupt       | Smooth transition to new state   |
| Unmount during animation  | No errors, cleanup happens       |
| Rapid toggle (open/close) | Final state correct              |
| Chained animations        | Complete in correct order        |
| Animation on mount        | Plays correctly                  |
| CSS vs JS animations      | Consistent behavior              |

---

## Edge Cases by Category

### Data Edge Cases

- Empty arrays/objects (`[]`, `{}`, `null`, `undefined`)
- Single item vs multiple items
- Maximum lengths (255+ char filenames, 10k+ items)
- Special characters (unicode, spaces, slashes, quotes)
- Numeric boundaries (`0`, negative, `MAX_SAFE_INTEGER`, `NaN`, `Infinity`)
- Invalid/malformed backend data
- Type mismatches (string vs number)

### State Edge Cases

- Initial state before data loads
- Loading → success → loading transitions
- Error states and recovery (retry)
- Rapid state changes (debounce edge cases)
- Stale state after unmount
- Concurrent state updates

### Async Edge Cases

- Network failures / Tauri rejections
- Slow responses (>5s)
- Timeout scenarios
- Out-of-order responses (race conditions)
- Retry logic exhaustion
- Partial failures in batch operations

### Interaction Edge Cases

- Disabled states
- Keyboard navigation boundaries (first/last)
- Double-clicks, triple-clicks
- Interaction during loading
- Touch vs mouse vs keyboard
- Right-click / context menu
- Drag cancel (Escape)

### Accessibility Edge Cases

- Focus trap boundaries
- Focus restoration on close
- Screen reader announcements timing
- Keyboard-only navigation completeness
- Reduced motion preferences
- High contrast mode

### Router Edge Cases

- Direct URL access (deep linking)
- Back/forward navigation state
- Missing/malformed route params
- Protected route redirects
- Hash vs history routing
- Concurrent navigation

### Virtualization Edge Cases

- Scroll to specific item (first, last, middle)
- Dynamic item heights
- Empty and single-item lists
- Rapid scrolling
- Resize during scroll
- Focus management in virtual list

### Drag and Drop Edge Cases

- Drop on invalid target
- Drop on self (no-op)
- Cancel mid-drag (Escape)
- Drag outside container
- Keyboard drag mode
- Nested droppable areas

### Animation Edge Cases

- Reduced motion preference
- Animation interrupt (rapid toggle)
- Unmount during animation
- Chained animations
- Animation on mount vs update

### Tauri System Edge Cases

- Dialog cancelled (null response)
- File picker with no selection
- Permission denied errors
- File already exists (overwrite)
- Disk full
- Network file paths (UNC)
- Clipboard empty
- Window already closed

---

## Timing/Race Condition Patterns

**Only test if AbortController or request ID tracking is present:**

- Multiple rapid requests → correct final state
- Old request completing after new one → ignored
- Request completing after unmount → no state update

**Only test if event listeners with cleanup:**

- Listener added on mount → removed on unmount
- Multiple subscribe/unsubscribe cycles → no leaks
