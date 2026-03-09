# Kanban Ticket Board — End-to-End Implementation Plan

## Context

Users need a way to create structured tasks (tickets) with subtasks, assign them to the AI agent (@Orbit), and track progress in a Kanban board. When assigned, the agent executes the EXACT tasks defined in the ticket — no hallucination or reinterpretation. Completed tickets open as full chat sessions for follow-up.

**Key constraint**: All ticket data lives in a single `~/.orbit/tickets.json` file. Rust reads/writes it directly. No Zustand store, no in-memory cache, no over-engineering. Frontend calls `invoke()` for everything.

**Agent integration**: When a ticket is assigned, Rust writes Claude Code CLI task files to `~/.claude/tasks/{sessionId}/`, creates an agent session, and sends the first message with ticket instructions. The CLI's built-in TaskCreate/TaskUpdate/TaskList system handles task execution and dependency resolution automatically.

---

## Phase 1: Rust Backend (`src-tauri/src/commands/tickets/`)

### 1.1 Module Structure

```
src-tauri/src/commands/tickets/
├── mod.rs          — Module declaration + re-exports
├── types.rs        — All serde structs and enums
├── io.rs           — Path resolution, read/write helpers (atomic write)
├── commands.rs     — CRUD Tauri commands
├── assign.rs       — Agent assignment (task file injection + session creation)
├── sync.rs         — Read task files back → update ticket statuses
└── tests.rs        — #[cfg(test)] serialization round-trip tests
```

### 1.2 Types (`types.rs`)

**Enums:**

- `TicketStatus`: `backlog | todo | in_progress | in_review | done | cancelled`
- `TicketPriority`: `low | medium | high | critical`
- `TicketColumn`: `backlog | todo | in_progress | in_review | done`
- `TaskStatus`: `not_started | in_progress | completed` (Claude Code CLI format)

**Structs:**

- `TicketTodo` — `{ id, title, completed, completed_at? }`
- `Ticket` — `{ id, title, description?, status, priority, column, todos, agent_session_id?, workspace_path?, tags, created_at, updated_at, position }`
- `TicketFile` — `{ version, last_updated, tickets, next_id }` (root wrapper with auto-incrementing counter)
- `TaskFile` — `{ id, subject, description?, status, blocks, blocked_by }` (Claude Code CLI task schema)
- `TicketCreateInput` / `TicketUpdateInput` — command input types

All use `#[serde(rename_all = "camelCase")]` for frontend compatibility.

### 1.3 File I/O (`io.rs`)

- `get_tickets_file_path()` → `~/.orbit/tickets.json` (with `ORBIT_TICKETS_PATH` env override)
- `get_tasks_dir_path(session_id)` → `~/.claude/tasks/{session_id}/`
- `read_tickets_file()` → returns `TicketFile::default()` if file doesn't exist
- `write_tickets_file()` → **atomic write** (write to `.json.tmp`, rename) matching the vault pattern from `commands/vault/operations.rs`

### 1.4 CRUD Commands (`commands.rs`)

Each command: read file → modify → write file. No managed state.

| Command         | Signature                                              | Description                                                                 |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `ticket_list`   | `() → Vec<Ticket>`                                     | Return all tickets                                                          |
| `ticket_create` | `(input: TicketCreateInput) → Ticket`                  | Create ticket, auto-assign ID (`TICKET-{next_id}`), auto-position in column |
| `ticket_update` | `(ticket_id, input: TicketUpdateInput) → Ticket`       | Patch-style update (all fields optional)                                    |
| `ticket_delete` | `(ticket_id) → ()`                                     | Remove ticket                                                               |
| `ticket_move`   | `(ticket_id, target_column, target_position) → Ticket` | Drag-and-drop: change column + reindex positions                            |

### 1.5 Agent Assignment (`assign.rs`)

`ticket_assign(ticket_id, state: State<Arc<SessionManager>>, app: AppHandle) → Ticket`

This command uses `State<>` (reusing existing `SessionManager`) and `AppHandle` (for emitting events).

**Flow:**

1. Read ticket, validate not already assigned
2. Generate session ID (`uuid::Uuid::new_v4()`)
3. **Write one CLI task file per subtask** to `~/.claude/tasks/{sessionId}/`:
   - Each subtask → `{index}.json` (e.g., `1.json`, `2.json`, `3.json`)
   - Sequential dependency chain: task 2 has `blockedBy: ["1"]`, task 3 has `blockedBy: ["2"]`, etc.
   - The CLI auto-resolves dependencies — completing task 1 unblocks task 2 automatically
   - If no subtasks, write a single task file for the ticket itself
4. Create agent session via `state.create_session()` with:
   - `cwd`: ticket's `workspace_path` (defaults to current workspace if not set)
   - `accept_enabled: true`, `thinking_enabled: true`
5. Send first message via `state.send_message()` — contains ticket context + instruction to use TaskList
6. Update ticket: set `agent_session_id`, status → `in_progress`, column → `in_progress`
7. Write tickets file
8. Emit `ticket:assigned` Tauri event with `{ ticketId, sessionId }` for frontend notification

**Task file example** (for ticket with 3 subtasks):

```json
// ~/.claude/tasks/{sessionId}/1.json
{
  "id": "1",
  "subject": "Check OAuth callback handler",
  "description": "Subtask 1 of ticket TICKET-1: Fix login bug",
  "status": "not_started",
  "blocks": ["2"],
  "blockedBy": []
}

// ~/.claude/tasks/{sessionId}/2.json
{
  "id": "2",
  "subject": "Fix token refresh logic",
  "description": "Subtask 2 of ticket TICKET-1: Fix login bug",
  "status": "not_started",
  "blocks": ["3"],
  "blockedBy": ["1"]
}

// ~/.claude/tasks/{sessionId}/3.json
{
  "id": "3",
  "subject": "Add error logging",
  "description": "Subtask 3 of ticket TICKET-1: Fix login bug",
  "status": "not_started",
  "blocks": [],
  "blockedBy": ["2"]
}
```

**First message format:**

```
You have been assigned ticket TICKET-1: "Fix login bug".

## Description
Users can't log in with OAuth...

## Instructions
Task files have been created for this ticket. Use TaskList to see your tasks and TaskUpdate to mark them as you complete each one. Work through the tasks in dependency order — blocked tasks will unblock automatically when their dependencies are completed.

Do NOT deviate from the defined tasks. Execute exactly what each task describes.
```

**Error rollback:** If `create_session` succeeds but `send_message` fails:

1. Call `state.delete_session(&session_id)` to clean up the dangling session
2. Remove the task files directory (`~/.claude/tasks/{sessionId}/`)
3. Do NOT update the ticket (leave it in its original state)
4. Return the error to the frontend

### 1.6 Task Sync (`sync.rs`)

`ticket_sync_tasks() → Vec<Ticket>`

For each ticket with `agent_session_id`:

1. Read ALL task files from `~/.claude/tasks/{sessionId}/` (one per subtask)
2. Map each task file status back to the corresponding `TicketTodo`:
   - `not_started` → `completed: false`
   - `in_progress` → `completed: false` (but could add an `in_progress` indicator)
   - `completed` → `completed: true`, set `completed_at`
3. Derive overall ticket status from subtask completion:
   - All subtasks completed → ticket status `done`, column `done`
   - Any subtask in_progress → ticket status `in_progress`, column `in_progress`
   - All not_started → ticket status `todo`
4. Write tickets file only if any status changed

**Subtask-to-task-file mapping:** Task file IDs are `"1"`, `"2"`, etc. corresponding to subtask index order. The sync function matches by index position in the `todos` array.

### 1.7 Session Title (`assign.rs`)

After creating the agent session, set a descriptive title for the sidebar conversation entry:

```rust
// After create_session succeeds:
conversation_manager.update_title(&session_id, &format!("Ticket: {}", ticket.title)).map_err(to_error)?;
```

This requires adding `State<'_, ConversationManager>` to `ticket_assign`. The `ConversationManager` is already `.manage()`'d in `lib.rs`.

### 1.8 Wiring

**`commands/mod.rs`** — Add `pub mod tickets;`

**`lib.rs`** — Add to `invoke_handler`:

```rust
// Ticket commands
tickets_cmd::ticket_list,
tickets_cmd::ticket_create,
tickets_cmd::ticket_update,
tickets_cmd::ticket_delete,
tickets_cmd::ticket_move,
tickets_cmd::ticket_assign,
tickets_cmd::ticket_sync_tasks,
```

No ACL changes needed (uses `std::fs` directly, like vault/canvas/conversations).

### 1.9 Dependencies

All already in workspace: `uuid`, `chrono`, `dirs`, `serde`, `serde_json`. No new Cargo.toml entries.

---

## Phase 2: Frontend Types & API Layer

### 2.1 Types (`apps/agent/src/types/tickets/`)

**`ticket-types.ts`** — Zod schemas + inferred types:

- `TicketStatusSchema`, `TicketPrioritySchema`, `TicketColumnSchema`
- `TicketTodoSchema`, `TicketSchema`
- `TicketCreateInputSchema`, `TicketUpdateInputSchema`

**`index.ts`** — Barrel export

### 2.2 API Layer (`apps/agent/src/lib/api/tickets.ts`)

Thin invoke wrappers following the pattern from `lib/api/agent.ts`:

```typescript
import { invoke } from './core';

export async function ticketList(): Promise<Ticket[]> { return invoke<Ticket[]>('ticket_list'); }
export async function ticketCreate(input: TicketCreateInput): Promise<Ticket> { ... }
export async function ticketUpdate(ticketId: string, input: TicketUpdateInput): Promise<Ticket> { ... }
export async function ticketDelete(ticketId: string): Promise<void> { ... }
export async function ticketMove(ticketId: string, targetColumn: TicketColumn, targetPosition: number): Promise<Ticket> { ... }
export async function ticketAssign(ticketId: string): Promise<Ticket> { ... }
export async function ticketSyncTasks(): Promise<Ticket[]> { ... }
```

Export from `lib/api/index.ts`.

---

## Phase 3: Frontend Hooks

### 3.1 `use-tickets.ts` — Core data hook

No Zustand store. Uses `useState` + `useCallback`. Each mutation calls invoke() then updates local state with the response.

```typescript
interface UseTicketsReturn {
  tickets: Ticket[];
  isLoading: boolean;
  error: string | null;
  createTicket;
  updateTicket;
  deleteTicket;
  moveTicket;
  assignTicket;
  syncTasks;
  refreshTickets;
}
```

- `moveTicket`: optimistic reorder (move card immediately), revert on error
- `assignTicket`: per-ticket loading state (shows spinner on that card only)

### 3.2 `use-ticket-drag.ts` — HTML5 Drag & Drop

Native HTML5 DnD — no new dependencies. Returns `dragHandlers` (onDragStart, onDragEnd) and `dropHandlers` (onDragOver, onDragLeave, onDrop) plus `dragState`.

Drop position calculated by comparing `clientY` to card `getBoundingClientRect()` midpoints.

### 3.3 `use-ticket-sync.ts` — Periodic sync + event-driven sync

Two sync triggers:

1. **Polling**: `setInterval` at 15s when tickets panel is active. Calls `ticketSyncTasks()`.
2. **Event-driven**: Listen for `agent:complete` Tauri events. When an agent session completes, check if its `session_id` matches any ticket's `agentSessionId`. If so, trigger an immediate `ticketSyncTasks()` call (no 15s wait).

```typescript
// Listen for agent completion to trigger immediate sync
useEffect(() => {
  const unlisten = listen('agent:message', (event) => {
    if (event.payload.message_type === 'result') {
      // Agent finished — sync immediately
      syncTasks();
    }
  });
  return () => {
    unlisten.then((fn) => fn());
  };
}, [syncTasks]);
```

This gives real-time feedback when the agent finishes, while the 15s poll catches intermediate progress.

---

## Phase 4: Frontend Components

### 4.1 Component Tree

```
ActivityPanel (existing)
  └── (activeTab === 'tickets')
      └── TicketBoard (lazy-loaded)
          ├── Board Header (title + "New Ticket" button)
          ├── TicketColumn × 5 (backlog, todo, in_progress, in_review, done)
          │   ├── Column Header (label + count badge)
          │   └── TicketCard × N
          │       ├── Priority badge (colored dot)
          │       ├── Title (1-2 lines, truncated)
          │       ├── Todo progress (3/5 + mini progress bar)
          │       └── Agent indicator (bot icon if assigned)
          ├── TicketDetail (replaces board when a card is selected)
          │   ├── Editable title
          │   ├── Priority selector (Select component)
          │   ├── Description textarea
          │   ├── Subtask checkboxes + "Add subtask" input
          │   ├── "Assign to Agent" button / "View Session" link
          │   └── Delete button (with confirmation)
          └── CreateTicketDialog (Dialog component)
              ├── Title input (required)
              ├── Description textarea
              ├── Priority select (default: medium)
              ├── Column select (default: backlog)
              ├── Dynamic subtask inputs (add/remove)
              └── Tags input
```

**Workspace path default:** The create dialog does NOT expose a workspace path field. It defaults to the current workspace path from `useUIStore((s) => s.workspacePath)`. This is set automatically when the user opens a project folder.

**Real-time agent indicator on cards:** When a ticket has `agentSessionId` and status is `in_progress`, the card shows:

- A pulsing dot or spinner next to the agent icon
- Subtask progress updates in real-time via the sync hook (event-driven + polling)
- When all subtasks complete, the card auto-moves to the "Done" column on next sync

### 4.2 File Structure

```
apps/agent/src/components/tickets/
├── ticket-board.tsx           — Main board container, hosts hooks
├── ticket-column.tsx          — Single column with drop zone
├── ticket-card.tsx            — Card component (draggable)
├── ticket-detail.tsx          — Expanded detail view
├── create-ticket-dialog.tsx   — Create form modal
├── ticket-priority-badge.tsx  — Priority color indicator
└── index.ts                   — Barrel export
```

### 4.3 Responsive Layout

The activity panel is typically 300-500px wide. Default view: **stacked swimlane** (columns as collapsible vertical sections). When panel ≥500px: horizontal Kanban with `@container` query (the ActivityPanel already has `@container` on its root div).

### 4.4 "View Session" Flow

When user clicks a completed ticket's "View Session" button, replicate the `handleLoadConversation` pattern from `use-sidebar-actions.ts` (lines 253-294):

1. `setActivityTab('file')` — switch away from tickets
2. `setLoadingConversation(true)`
3. `markLoadPending(agentSessionId)` on MessageBufferStore
4. `setActiveSession(agentSessionId)` on ChatStore
5. Post `conversation:load` message

---

## Phase 5: Integration Points

### 5.1 UIStore Change

**File:** `apps/agent/src/stores/ui/ui-store.ts` (line 77)

```typescript
// Before:
export type ActivityTab = 'file' | 'source' | 'browser';
// After:
export type ActivityTab = 'file' | 'source' | 'browser' | 'tickets';
```

### 5.2 ActivityPanel Change

**File:** `apps/agent/src/components/panels/activity-panel.tsx` (lines 489-499)

Add lazy import for TicketBoard and add `tickets` case to the content ternary:

```typescript
const LazyTicketBoard = lazy(() =>
  import('@/components/tickets/ticket-board').then((m) => ({ default: m.TicketBoard }))
);

// In content:
{activeTab === 'file' ? (
  <FileViewer />
) : activeTab === 'browser' ? (
  <BrowserPanel />
) : activeTab === 'tickets' ? (
  <TicketBoard />
) : (
  <SourceControlTab ... />
)}
```

### 5.3 ActionsBar Change

**File:** `apps/agent/src/components/layout/actions-bar.tsx` (after line 161)

Add ActionButton with `Columns3` icon from lucide-react:

```typescript
<ActionButton
  icon={Columns3}
  label="Tickets"
  isActive={activeTab === 'tickets'}
  onClick={() => handleTabClick('tickets')}
/>
```

### 5.4 Constants

**File:** `apps/agent/src/lib/utils/constants.ts`

Add `TICKETS` constant object with sync interval (15s), column display names, and priority color mappings.

### 5.5 CSS (if needed)

**File:** `apps/agent/src/globals.css`

May need to add `--warning` oklch color for "high" priority badge if not already present. Add drag-and-drop visual feedback styles (drop indicators, drag ghost opacity).

---

## Implementation Order

| Step | Layer       | Files                                                               | Depends On  |
| ---- | ----------- | ------------------------------------------------------------------- | ----------- |
| 1    | Rust        | `tickets/types.rs`                                                  | —           |
| 2    | Rust        | `tickets/io.rs`                                                     | Step 1      |
| 3    | Rust        | `tickets/commands.rs`                                               | Steps 1-2   |
| 4    | Rust        | `tickets/tests.rs`                                                  | Steps 1-3   |
| 5    | Rust        | `tickets/mod.rs`, `commands/mod.rs`, `lib.rs`                       | Steps 1-4   |
| 6    | Frontend    | `types/tickets/`, `lib/api/tickets.ts`                              | —           |
| 7    | Frontend    | `hooks/tickets/use-tickets.ts`                                      | Step 6      |
| 8    | Frontend    | `ticket-priority-badge.tsx`, `ticket-card.tsx`, `ticket-column.tsx` | Steps 6-7   |
| 9    | Frontend    | `ticket-board.tsx`                                                  | Steps 7-8   |
| 10   | Integration | `ui-store.ts`, `activity-panel.tsx`, `actions-bar.tsx`              | Step 9      |
| 11   | Frontend    | `hooks/tickets/use-ticket-drag.ts`                                  | Step 9      |
| 12   | Frontend    | `create-ticket-dialog.tsx`, `ticket-detail.tsx`                     | Steps 7-9   |
| 13   | Rust        | `tickets/assign.rs`, `tickets/sync.rs`                              | Steps 1-5   |
| 14   | Frontend    | `hooks/tickets/use-ticket-sync.ts`, "View Session" flow             | Steps 7, 13 |
| 15   | Polish      | CSS, responsive layout, barrel exports, constants                   | All         |

Steps 1-5 and 6 can run in parallel (Rust and Frontend types are independent).

---

## Verification

### Rust

```bash
cargo check          # Type check
cargo test tickets   # Run ticket serialization tests
cargo clippy         # Lint
```

### Frontend

```bash
bun run typecheck    # TypeScript check
bun run lint         # ESLint
```

### End-to-End

1. `bunx tauri dev`
2. Click Tickets icon in actions bar → empty board renders
3. Create a ticket with subtasks → appears in Backlog column
4. Drag ticket to "To Do" → column + status update
5. Click ticket → detail view with editable fields
6. Click "Assign to Agent" → agent session starts, ticket moves to "In Progress"
7. Wait for agent to work → sync updates subtask statuses
8. Click "View Session" on completed ticket → opens as chat session
9. Verify `~/.orbit/tickets.json` persists data across app restarts

### File Verification

```bash
cat ~/.orbit/tickets.json    # Verify ticket data persisted
ls ~/.claude/tasks/           # Verify task files created after assignment
```

---

## Key Design Decisions

1. **Single JSON file** — Not per-ticket files. Simpler for listing, sorting, column moves. File will be small (hundreds of tickets max).
2. **No Zustand store** — User's explicit requirement. React local state via `useTickets` hook. Each mutation round-trips to disk.
3. **Atomic writes** — Write to `.json.tmp` then rename. Prevents corruption on crash.
4. **`next_id` counter in file** — Avoids UUID scanning or collisions. Monotonic `TICKET-1`, `TICKET-2`, etc.
5. **One task file per subtask** — Each subtask → separate CLI task file with `blocks`/`blockedBy` dependency chains. The CLI auto-resolves ordering. Agent uses `TaskList`/`TaskUpdate` to work through them sequentially.
6. **HTML5 Drag API** — No new dependencies. Native browser support.
7. **First message, not system prompt** — System prompt is global. First message is per-ticket/per-session. Instructs agent to use TaskList/TaskUpdate.
8. **`ticket_assign` reuses `SessionManager` + `ConversationManager`** — Two exceptions to "no managed state." Both already `.manage()`'d by the app.
9. **Stacked swimlane default** — Activity panel is narrow (300-500px). Horizontal Kanban only at ≥500px via `@container`.
10. **Dual sync: polling + event-driven** — 15s interval catches intermediate progress. `agent:complete` event triggers immediate sync for instant feedback when agent finishes.
11. **Error rollback on assign** — If session creation succeeds but message send fails, clean up the dangling session and task files. Don't update the ticket.
12. **Session title from ticket** — Sidebar shows "Ticket: {title}" so users can identify ticket sessions in the conversation list.
13. **Workspace path defaults to current** — Uses `UIStore.workspacePath`. Not exposed in create dialog.
