# Parallel Multi-Agent Worktree Feature

## Implementation Plan

> **Goal:** Enable users to run multiple Claude agents simultaneously, each on a different git worktree/branch, with isolated chat histories per worktree.
>
> **Last Updated:** January 22, 2026 (v5 - Codex Full Audit)
> **Status:** ✅ Fully audited and ready for implementation

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              SIDEBAR                                 │
├─────────────────────────────────────────────────────────────────────┤
│  📂 main                    🤖 Agent running...                      │
│  ├── 💬 "Fix CI pipeline"                                           │
│  └── 💬 "Update deps"                                               │
│                                                                      │
│  📂 feature/auth            🤖 Agent running...                      │
│  ├── 💬 "Add OAuth"                                                 │
│  └── 💬 "JWT refresh"                                               │
│                                                                      │
│  📂 feature/payments        🤖 Agent running...                      │
│  └── 💬 "Stripe integration"                                        │
│                                                                      │
│  [+ New Worktree]                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

Each worktree = isolated workspace with:

- Own filesystem directory (`/repo-auth`, `/repo-payments`, etc.)
- Own Claude SDK session with correct `cwd`
- Own chat history (conversations stored per worktree)
- Own git context (push/pull operates on that worktree's branch)

---

## Architecture

### Current State (Broken)

```
User creates worktree
       ↓
Worktree added to UI store ✅
       ↓
activeWorktreePath updated ✅
       ↓
localStorage persistence ✅ (already implemented)
       ↓
Session creation uses workspacePath ❌ (ignores activeWorktreePath)
       ↓
Conversations stored by workspace ❌ (not by worktree)
       ↓
Git operations use workspace ❌ (ignores activeWorktreePath)
       ↓
File explorer doesn't refresh ❌ (shows wrong directory)
```

### Target State (Fixed)

```
User creates worktree
       ↓
Worktree added to UI store ✅
       ↓
Auto-switch to new worktree ✅ (Phase 1)
       ↓
Session creation uses activeWorktreePath ✅ (Phase 2)
       ↓
Conversations stored by worktree path ✅ (Phase 3)
       ↓
Git operations use activeWorktreePath ✅ (Phase 5)
       ↓
File explorer refreshes to worktree ✅ (Phase 6)
       ↓
New terminals use worktree CWD ✅ (Phase 6)
```

---

## Implementation Phases

### Phase 1: Fix Worktree Creation Flow

**Goal:** When user creates a worktree, automatically switch to it.

> **Audit Note:** `CreateWorktreeDialog` has `onCreated` callback prop defined at line 38 in the dialog file.
> The actual usage in `PrimarySidebar.tsx` is at **line 353**. localStorage persistence is already implemented
> via `saveActiveWorktreeToStorage()` in `ui-store.ts` lines 257-276.

#### 1.1 Use onCreated callback in PrimarySidebar

**File:** `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx` (line ~353)

```typescript
// BEFORE (callback not used) - line ~353
<CreateWorktreeDialog
  open={createWorktreeDialogOpen}
  onOpenChange={useUIStore.getState().setCreateWorktreeDialogOpen}
/>

// AFTER (auto-switch on create)
<CreateWorktreeDialog
  open={createWorktreeDialogOpen}
  onOpenChange={useUIStore.getState().setCreateWorktreeDialogOpen}
  onCreated={(worktree) => {
    // Auto-switch to new worktree
    useUIStore.getState().setActiveWorktree(worktree.path);
  }}
/>
```

**Note:** `setActiveWorktree` already persists to localStorage via `saveActiveWorktreeToStorage()`.

---

### Phase 2: Connect Session Creation to Active Worktree

**Goal:** When creating a Claude SDK session, use the active worktree's path as `cwd`.

#### 2.1 Update ensureSession to use activeWorktreePath

**File:** `apps/agent/src/hooks/agent/use-tauri-session.ts`

```typescript
// BEFORE (broken) - Line ~87 (function starts), line 94 has the cwd assignment
export async function ensureSession(sessionId: string): Promise<void> {
  if (createdSessions.has(sessionId)) return;

  const cwd = await getWorkspacePath(); // Always uses main workspace!
  // ...
}

// AFTER (fixed)
// Add import at top of file:
import { useUIStore } from '@/stores/ui/ui-store';

export async function ensureSession(sessionId: string): Promise<void> {
  if (createdSessions.has(sessionId)) return;

  // Use active worktree if set, otherwise fall back to workspace
  const activeWorktree = useUIStore.getState().activeWorktreePath;
  const workspacePath = await getWorkspacePath();
  const cwd = activeWorktree ?? workspacePath;

  // CRITICAL: SessionConfig.cwd must be string, not string | null
  // If both are null, we cannot create a session
  if (cwd === null) {
    console.error('[ensureSession] No workspace or worktree path available');
    return;
  }

  const config: SessionConfig = {
    cwd, // Now uses correct worktree path (guaranteed non-null)
    // ... rest of config
  };
  await agentCreateSession(sessionId, config);
  createdSessions.add(sessionId);

  // Track which worktree this session belongs to
  if (activeWorktree) {
    useUIStore.getState().setSessionWorktree(sessionId, activeWorktree);
  }
}
```

#### 2.2 Add session-to-worktree mapping in UI store

**File:** `apps/agent/src/stores/ui/ui-store.ts`

Add new state and actions:

> **Note:** The store uses `immer((set) => ({...}))`. To use `get()`, change to `immer((set, get) => ({...}))`.
> Alternatively, access state via `useUIStore.getState()` from outside the store.

```typescript
interface UIState {
  // ... existing fields

  /** Maps sessionId → worktreePath for tracking which session belongs where */
  sessionWorktreeMap: Record<string, string>;
}

interface UIActions {
  // ... existing actions

  setSessionWorktree: (sessionId: string, worktreePath: string) => void;
  getSessionWorktree: (sessionId: string) => string | undefined;
  clearSessionWorktree: (sessionId: string) => void;
}

// Update store creation to include get:
export const useUIStore = create<UIStore>()(
  immer((set, get) => ({
    // <-- Add get parameter here
    // ... existing state

    // Initial state
    sessionWorktreeMap: {},

    // Actions
    setSessionWorktree: (sessionId: string, worktreePath: string): void => {
      set((state) => {
        state.sessionWorktreeMap[sessionId] = worktreePath;
      });
    },

    getSessionWorktree: (sessionId: string): string | undefined => {
      return get().sessionWorktreeMap[sessionId];
    },

    clearSessionWorktree: (sessionId: string): void => {
      set((state) => {
        delete state.sessionWorktreeMap[sessionId];
      });
    },
  }))
);
```

---

### Phase 3: Update Conversation Storage

**Goal:** Store conversations per worktree, not per workspace.

#### 3.1 Update TypeScript Protocol Schemas

**File:** `apps/agent/src/types/protocol/protocol.ts`

Update these 5 schemas to include `worktree_path`:

```typescript
// Schema 1: GetConversationsSchema (line ~254) - for filtering conversation list
export const GetConversationsSchema = z
  .object({
    type: z.literal('conversation:list'),
    uuid: UUIDSchema,
    workspace_path: z.string().optional(),
    worktree_path: z.string().optional(), // NEW - filter by worktree
  })
  .strict();

// Schema 2: StoredConversationSummarySchema (line ~123)
export const StoredConversationSummarySchema = z
  .object({
    sessionId: z.string(),
    title: z.string(),
    updatedAt: z.number(),
    messageCount: z.number(),
    workspacePath: z.string().optional(),
    worktreePath: z.string().optional(), // NEW
  })
  .strict();

// Schema 3: CreateConversationSchema (line ~237)
export const CreateConversationSchema = z.object({
  type: z.literal('conversation:create'),
  uuid: z.string(),
  title: z.string().optional(),
  workspace_path: z.string().optional(),
  worktree_path: z.string().optional(), // NEW
});

// Schema 4: ConversationCreatedSchema (line ~1299)
export const ConversationCreatedSchema = z.object({
  type: z.literal('conversation:created'),
  uuid: z.string(),
  session_id: z.string(),
  title: z.string(),
  workspace_path: z.string().optional(),
  worktree_path: z.string().optional(), // NEW
});

// Schema 5: ConversationListSchema inner object (line ~1317)
// Update the conversations array item schema
const ConversationListItemSchema = z.object({
  session_id: z.string(),
  title: z.string(),
  updated_at: z.number(),
  message_count: z.number(),
  workspace_path: z.string().optional(),
  worktree_path: z.string().optional(), // NEW
});
```

#### 3.2 Update Rust Conversation struct

**File:** `crates/common/conversations/src/lib.rs`

```rust
// Update Conversation struct (line ~114)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub session_id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub messages: Vec<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,  // NEW
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
}

// Update ConversationSummary struct (line ~202, doc at ~199)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub session_id: String,
    pub title: String,
    pub updated_at: u64,
    pub message_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,  // NEW
}

// Update Conversation::new (line ~136)
pub fn new(
    session_id: String,
    title: String,
    workspace_path: Option<String>,
    worktree_path: Option<String>,  // NEW parameter
) -> Self {
    let now = current_timestamp();
    Self {
        session_id,
        title,
        created_at: now,
        updated_at: now,
        messages: Vec::new(),
        workspace_path,
        worktree_path,  // NEW
        forked_from: None,
    }
}

// Update From<&Conversation> for ConversationSummary (line ~216)
impl From<&Conversation> for ConversationSummary {
    fn from(conv: &Conversation) -> Self {
        Self {
            session_id: conv.session_id.clone(),
            title: conv.title.clone(),
            updated_at: conv.updated_at,
            message_count: conv.messages.len(),
            workspace_path: conv.workspace_path.clone(),
            worktree_path: conv.worktree_path.clone(),  // NEW
        }
    }
}

// Update Conversation::fork to carry worktree_path (line ~172)
pub fn fork(&self, new_session_id: String, up_to_message_id: Option<&str>) -> Self {
    let now = current_timestamp();
    let messages = /* ... existing fork logic ... */;

    Self {
        session_id: new_session_id,
        title: format!("{} (fork)", self.title),
        created_at: now,
        updated_at: now,
        messages,
        workspace_path: self.workspace_path.clone(),
        worktree_path: self.worktree_path.clone(),  // NEW - preserve worktree
        forked_from: Some(self.session_id.clone()),
    }
}

// Update ConversationManager::create signature (line ~428)
pub fn create(
    &self,
    session_id: String,
    title: String,
    workspace_path: Option<String>,
    worktree_path: Option<String>,  // NEW
) -> Result<Conversation> {
    let conversation = Conversation::new(session_id, title, workspace_path, worktree_path);
    self.save_to_workspace(&conversation, conversation.workspace_path.as_deref())?;
    // ... rest of method
}

// Update ConversationManager::add_message signature (line ~656)
pub fn add_message(
    &self,
    session_id: &str,
    message: Message,
    workspace_path: Option<&str>,
    worktree_path: Option<&str>,  // NEW - for creating conversation if doesn't exist
) -> Result<()> {
    let mut conversation = self.load(session_id)?.unwrap_or_else(|| {
        Conversation::new(
            session_id.to_owned(),
            String::from("New Chat"),
            workspace_path.map(str::to_owned),
            worktree_path.map(str::to_owned),  // NEW
        )
    });
    // ... rest of method
}
```

#### 3.3 Update Rust Tauri Commands and DTOs

**File:** `src-tauri/src/commands/agent/conversations.rs`

First, update the DTO types that bridge Rust ↔ TypeScript:

```rust
// Update ConversationDto (line ~169-189)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub session_id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub messages: Vec<MessageDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,  // NEW
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
}

// Update ConversationSummaryDto (line ~206-220)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummaryDto {
    pub session_id: String,
    pub title: String,
    pub updated_at: u64,
    pub message_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,  // NEW
}

// Update From<Conversation> for ConversationDto (line ~191-203)
impl From<Conversation> for ConversationDto {
    fn from(conv: Conversation) -> Self {
        Self {
            session_id: conv.session_id,
            title: conv.title,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            messages: conv.messages.into_iter().map(MessageDto::from).collect(),
            workspace_path: conv.workspace_path,
            worktree_path: conv.worktree_path,  // NEW
            forked_from: conv.forked_from,
        }
    }
}

// Update From<ConversationSummary> for ConversationSummaryDto (line ~222-232)
impl From<ConversationSummary> for ConversationSummaryDto {
    fn from(summary: ConversationSummary) -> Self {
        Self {
            session_id: summary.session_id,
            title: summary.title,
            updated_at: summary.updated_at,
            message_count: summary.message_count,
            workspace_path: summary.workspace_path,
            worktree_path: summary.worktree_path,  // NEW
        }
    }
}
```

Then update the Tauri commands:

> **Note:** Commands use sync `orbit_core::Result`, not `async Result<..., String>`.
> The `State` parameter comes last, after all value parameters.

```rust
// Update conversation_create command (line ~240)
#[tauri::command]
pub fn conversation_create(
    session_id: String,
    title: String,
    workspace_path: Option<String>,
    worktree_path: Option<String>,  // NEW parameter
    manager: State<'_, ConversationManager>,
) -> Result<ConversationDto> {
    let conv = manager.create(session_id, title, workspace_path, worktree_path)?;
    Ok(ConversationDto::from(conv))
}

// Update conversation_list command (line ~252)
#[tauri::command]
pub fn conversation_list(
    workspace_path: Option<String>,
    worktree_path: Option<String>,  // NEW parameter for filtering
    manager: State<'_, ConversationManager>,
) -> Result<Vec<ConversationSummaryDto>> {
    let summaries = manager.load_summaries_for_workspace(workspace_path.as_deref())?;

    // Filter by worktree if specified
    let filtered = if let Some(wt_path) = worktree_path {
        summaries
            .into_iter()
            .filter(|s| s.worktree_path.as_ref() == Some(&wt_path))
            .collect()
    } else {
        summaries
    };

    Ok(filtered.into_iter().map(ConversationSummaryDto::from).collect())
}

// Update conversation_add_message command (line ~294)
#[tauri::command]
pub fn conversation_add_message(
    session_id: String,
    message: MessageDto,
    workspace_path: Option<String>,
    worktree_path: Option<String>,  // NEW parameter
    manager: State<'_, ConversationManager>,
) -> Result<()> {
    manager.add_message(
        &session_id,
        Message::from(message),
        workspace_path.as_deref(),
        worktree_path.as_deref(),
    )
}
```

#### 3.4 Update TypeScript API Wrappers

**File:** `apps/agent/src/lib/api/conversations.ts`

```typescript
// Update conversationCreate
export async function conversationCreate(
  sessionId: string,
  title: string,
  workspacePath?: string,
  worktreePath?: string // NEW
): Promise<ConversationDto> {
  return invoke<ConversationDto>('conversation_create', {
    sessionId,
    title,
    workspacePath,
    worktreePath, // NEW
  });
}

// Update conversationList
export async function conversationList(
  workspacePath?: string,
  worktreePath?: string // NEW - filter by worktree
): Promise<ConversationSummaryDto[]> {
  return invoke<ConversationSummaryDto[]>('conversation_list', {
    workspacePath,
    worktreePath, // NEW
  });
}

// Update conversationAddMessage
export async function conversationAddMessage(
  sessionId: string,
  message: ConversationMessageDto,
  workspacePath?: string,
  worktreePath?: string // NEW
): Promise<void> {
  return invoke('conversation_add_message', {
    sessionId,
    message,
    workspacePath,
    worktreePath, // NEW
  });
}

// Update ConversationSummaryDto type
export interface ConversationSummaryDto {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string;
  worktreePath?: string; // NEW
}
```

#### 3.5 Update conversation creation handler

**File:** `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`

```typescript
// Update handleConversationCreate (line ~18)
export async function handleConversationCreate(
  message: Extract<WebviewMessage, { type: 'conversation:create' }>
): Promise<void> {
  try {
    const sessionId = crypto.randomUUID();
    const title = message.title ?? 'New Conversation';
    const workspacePath = message.workspace_path;
    const worktreePath = message.worktree_path; // NEW

    await conversationCreate(sessionId, title, workspacePath, worktreePath);

    window.postMessage(
      {
        type: 'conversation:created',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title,
        workspace_path: workspacePath,
        worktree_path: worktreePath, // NEW
      },
      '*'
    );
  } catch (err: unknown) {
    // ... error handling unchanged
  }
}

// Update handleConversationList to use active worktree
export async function handleConversationList(
  message: Extract<WebviewMessage, { type: 'conversation:list' }>
): Promise<void> {
  try {
    const workspacePath = message.workspace_path;
    const worktreePath = message.worktree_path; // NEW - can filter by worktree

    const conversations = await conversationList(workspacePath, worktreePath);

    window.postMessage(
      {
        type: 'conversation:list',
        uuid: crypto.randomUUID(),
        conversations: conversations.map((c) => ({
          session_id: c.sessionId,
          title: c.title,
          updated_at: c.updatedAt,
          message_count: c.messageCount,
          workspace_path: c.workspacePath,
          worktree_path: c.worktreePath, // NEW
        })),
      },
      '*'
    );
  } catch (err: unknown) {
    // ... error handling unchanged
  }
}
```

#### 3.6 Additional Frontend Files (Message Senders/Receivers)

These files also need `worktree_path` to flow end-to-end:

**File:** `apps/agent/src/hooks/chat/handlers/message-handler.ts`

When mapping `conversation:created` and `conversation:list` responses into UI store summaries:

```typescript
// Map worktree_path to worktreePath in ConversationSummary
const summary: ConversationSummary = {
  sessionId: msg.session_id,
  title: msg.title,
  updatedAt: msg.updated_at,
  messageCount: msg.message_count,
  workspacePath: msg.workspace_path,
  worktreePath: msg.worktree_path, // NEW
};
```

**File:** `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`

When sending `conversation:create`:

```typescript
postMessage({
  type: 'conversation:create',
  uuid: crypto.randomUUID(),
  title,
  workspace_path: workspacePath,
  worktree_path: useUIStore.getState().activeWorktreePath, // NEW
});
```

**File:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts`

When creating conversations:

```typescript
postMessage({
  type: 'conversation:create',
  uuid: crypto.randomUUID(),
  title,
  workspace_path: workspacePath,
  worktree_path: activeWorktreePath, // NEW
});
```

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts`

When listing conversations:

```typescript
postMessage({
  type: 'conversation:list',
  uuid: crypto.randomUUID(),
  workspace_path: workspacePath,
  worktree_path: activeWorktreePath, // NEW - optional filter
});
```

**File:** `apps/agent/src/hooks/agent/use-tauri-mock.ts`

Update mock responses if using strict schema validation:

```typescript
// Mock conversation:created response
{
  type: 'conversation:created',
  uuid: crypto.randomUUID(),
  session_id: mockSessionId,
  title: 'Mock Conversation',
  workspace_path: mockWorkspacePath,
  worktree_path: mockWorktreePath,  // NEW
}
```

**File:** `apps/agent/src/lib/api/conversations.ts`

Also update `ConversationDto` (not just summary):

```typescript
export interface ConversationDto {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessageDto[];
  workspacePath?: string;
  worktreePath?: string; // NEW
  forkedFrom?: string;
}
```

#### 3.7 Update Conversation Mapper (CRITICAL)

> **Codex Audit Note:** This file was missing from original plan. Without this update, worktreePath
> will be dropped when mapping DTOs to UI types, breaking sidebar grouping.

**File:** `apps/agent/src/lib/mappers/conversations.ts`

```typescript
// Update toConversationSummary mapper to include worktreePath
export function toConversationSummary(dto: ConversationSummaryDto): ConversationSummary {
  return {
    sessionId: dto.sessionId,
    title: dto.title,
    updatedAt: dto.updatedAt,
    messageCount: dto.messageCount,
    workspacePath: dto.workspacePath,
    worktreePath: dto.worktreePath, // NEW - CRITICAL for sidebar grouping
  };
}
```

#### 3.8 Fix Workspace/Worktree Path Separation in Chat Actions

> **Codex Audit Note:** Current code passes `activeWorktreePath ?? workspacePath` as a single path,
> which would incorrectly store worktree paths in the workspace_path field. Must pass both separately.

**File:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts`

```typescript
// BEFORE (broken - mixes workspace and worktree into one field)
const effectivePath = activeWorktreePath ?? workspacePath;
postMessage({
  type: 'conversation:create',
  workspace_path: effectivePath, // Wrong! Worktree ends up in workspace_path
});

// AFTER (correct - pass both separately)
postMessage({
  type: 'conversation:create',
  uuid: crypto.randomUUID(),
  title,
  workspace_path: workspacePath, // Always the root workspace
  worktree_path: activeWorktreePath, // The specific worktree (may be null)
});
```

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts`

Update to pass workspace and worktree paths separately:

```typescript
// When calling createChatActions or sending messages
const workspacePath = useUIStore.getState().workspacePath;
const activeWorktreePath = useUIStore.getState().activeWorktreePath;

// Pass both to handlers - don't merge them
createChatActions({
  workspacePath, // Root workspace (for file storage)
  worktreePath: activeWorktreePath, // Active worktree (for grouping)
  // ...
});
```

#### 3.9 Update conversationAddMessage Call Sites

> **Codex Audit Note:** These call sites auto-create conversations if missing. Without worktree_path,
> auto-created conversations won't be grouped correctly.

**Key files to update:**

- `apps/agent/src/hooks/chat/handlers/chat-actions.ts`
- `apps/agent/src/hooks/chat/handlers/message-handler.ts`
- `apps/agent/src/hooks/agent/use-tauri-message-listener.ts`
- `apps/agent/src/hooks/chat/use-chat-messages.ts`

```typescript
// When calling conversationAddMessage, include worktree_path
await conversationAddMessage(
  sessionId,
  message,
  workspacePath,
  worktreePath // NEW - for auto-created conversations
);
```

---

### Phase 4: Update Sidebar to Group Chats by Worktree

**Goal:** Show conversations grouped under their worktree in the sidebar.

#### 4.1 Update ConversationList filtering logic

**File:** `apps/agent/src/components/layout/primary-sidebar/components/ConversationList.tsx`

```typescript
// Update the conversationsByWorktree memoization (line ~58)
const conversationsByWorktree = useMemo(() => {
  const map = new Map<string, ConversationSummary[]>();
  for (const conv of conversations) {
    // Use worktreePath if available, fallback to workspacePath
    const path = conv.worktreePath ?? conv.workspacePath;
    if (path) {
      const existing = map.get(path);
      if (existing) {
        existing.push(conv);
      } else {
        map.set(path, [conv]);
      }
    }
  }
  return map;
}, [conversations]);

// Update getWorktreeConversations to handle legacy conversations
const getWorktreeConversations = (worktreePath: string): ConversationSummary[] => {
  // Direct match on worktreePath
  const direct = conversationsByWorktree.get(worktreePath) ?? [];

  // For main worktree, also include legacy conversations without worktreePath
  const mainWorktree = worktrees.find((wt) => wt.worktree.isMain);
  if (mainWorktree?.worktree.path === worktreePath) {
    const legacy = conversations.filter((c) => !c.worktreePath && c.workspacePath === worktreePath);
    return [...direct, ...legacy];
  }

  return direct;
};
```

#### 4.2 Add visual indicator for running agents

```typescript
// Add to WorktreeItem or create new component
interface WorktreeSectionProps {
  worktreeState: WorktreeUIState;
  hasActiveAgent: boolean; // Show 🤖 indicator
  active: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

// Check if any session in this worktree has an active agent
const hasActiveAgentForWorktree = (worktreePath: string): boolean => {
  const sessionWorktreeMap = useUIStore.getState().sessionWorktreeMap;
  // Check if any session mapped to this worktree is currently active
  // (requires tracking active sessions - see agent status in tool store)
  return Object.entries(sessionWorktreeMap)
    .filter(([_, path]) => path === worktreePath)
    .some(([sessionId]) => isSessionActive(sessionId));
};
```

---

### Phase 5: Connect Git Operations to Active Worktree

**Goal:** Git push/pull/commit operates on the active worktree, not main workspace.

> **Audit Note:** `useGitStatus` receives `workspacePath` as a **parameter** (line 101-104),
> NOT from an internal store selector. Fix must be at call sites, not inside the hook.

#### 5.1 Create helper hook for effective path

**File:** `apps/agent/src/hooks/use-effective-path.ts` (NEW FILE)

```typescript
import { useUIStore } from '@/stores/ui/ui-store';

/**
 * Returns the effective working path: activeWorktreePath if set,
 * otherwise workspacePath.
 *
 * Use this for all operations that should respect the active worktree.
 */
export function useEffectivePath(): string | null {
  const activeWorktree = useUIStore((s) => s.activeWorktreePath);
  const workspacePath = useUIStore((s) => s.workspacePath);
  return activeWorktree ?? workspacePath;
}
```

#### 5.2 Update all useGitStatus call sites

Find all components that call `useGitStatus` and update them to use `useEffectivePath()`:

**Example: SourceControlPanel or similar component**

```typescript
// BEFORE (uses workspace path directly)
const workspacePath = useUIStore((s) => s.workspacePath);
const { status, stage, commit } = useGitStatus(workspacePath);

// AFTER (uses helper hook)
import { useEffectivePath } from '@/hooks/use-effective-path';

const effectivePath = useEffectivePath();
const { status, stage, commit } = useGitStatus(effectivePath);
```

**Known call site (verified via grep):**

- `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` (line 115)
  - This hook receives `workspacePath` via its options interface (line 42-43)
  - Update the component that calls `useSourceControl` (e.g., `SourceControlTab.tsx`)
  - OR update `use-source-control.ts` directly to use `useEffectivePath()` internally

**Option A - Update useSourceControl internally:**

```typescript
// In use-source-control.ts, change line 115:
// BEFORE:
} = useGitStatus(workspacePath, {
// AFTER (use effective path):
import { useEffectivePath } from '@/hooks/use-effective-path';
// ... then in the hook:
const effectivePath = useEffectivePath();
const workspaceOrWorktree = effectivePath ?? workspacePath;
} = useGitStatus(workspaceOrWorktree, {
```

**Option B - Update calling component:**

- Find where `UseSourceControlOptions.workspacePath` is passed
- Replace with `useEffectivePath()` result

#### 5.3 Update git store to track per-worktree status (optional enhancement)

For showing status of multiple worktrees simultaneously:

```typescript
interface GitStore {
  // Track status per worktree
  statusByWorktree: Record<string, GitStatus>;

  // Actions
  setWorktreeStatus: (path: string, status: GitStatus) => void;
  getWorktreeStatus: (path: string) => GitStatus | null;
}
```

---

### Phase 6: Handle Worktree Switch Side Effects

**Goal:** When user switches worktrees, update file explorer and terminal defaults.

#### 6.1 Refresh file explorer on worktree switch

**File:** `apps/agent/src/stores/file/file-store.ts` or relevant component

```typescript
// Listen for activeWorktreePath changes and refresh file tree
useEffect(() => {
  const unsubscribe = useUIStore.subscribe(
    (state) => state.activeWorktreePath,
    (activeWorktree, prevWorktree) => {
      if (activeWorktree !== prevWorktree && activeWorktree) {
        // Clear current file tree
        useFileStore.getState().clearTree();
        // Load new root from worktree path
        void loadDirectoryTree(activeWorktree);
      }
    }
  );
  return unsubscribe;
}, []);
```

#### 6.2 New terminals use active worktree CWD

**File:** `apps/agent/src/hooks/terminal/use-terminal.ts` or creation logic

```typescript
// When creating a new terminal, use effective path
const createNewTerminal = async (): Promise<void> => {
  const effectivePath =
    useUIStore.getState().activeWorktreePath ?? useUIStore.getState().workspacePath;

  const terminalId = generateTerminalId();
  await createTerminal(terminalId, effectivePath, shell);
};
```

#### 6.3 Clear active conversation on worktree switch (optional)

When switching worktrees, the current conversation may not belong to the new worktree.
Consider clearing or switching to a conversation from the new worktree:

```typescript
// In worktree switch handler
const handleWorktreeSwitch = (newWorktreePath: string): void => {
  useUIStore.getState().setActiveWorktree(newWorktreePath);

  // Optional: Clear active conversation if it doesn't belong to new worktree
  const currentSessionId = useUIStore.getState().activeConversationId;
  const sessionWorktree = useUIStore.getState().getSessionWorktree(currentSessionId);

  if (sessionWorktree && sessionWorktree !== newWorktreePath) {
    // Either clear, or switch to most recent conversation in new worktree
    useUIStore.getState().setActiveConversation(null);
  }
};
```

---

### Phase 7: Enable Parallel Chat Views (Future Enhancement)

**Goal:** View and interact with multiple worktree chats side-by-side.

This is a larger UI enhancement for a future iteration:

```
┌─────────────────────────────────────────────────────────────────┐
│  Tab: main          │  Tab: feature/auth    │  Tab: feature/pay │
├─────────────────────┼───────────────────────┼───────────────────┤
│  Chat: Fix CI       │  Chat: Add OAuth      │  Chat: Stripe     │
│  🤖 Working...      │  🤖 Working...        │  ✅ Complete      │
│                     │                       │                   │
│  > Checking tests   │  > Adding provider    │  > Done!          │
│  > Running lint     │  > Updating config    │                   │
└─────────────────────┴───────────────────────┴───────────────────┘
```

---

## File Changes Summary

| File                            | Change                                                  | Priority | Status   |
| ------------------------------- | ------------------------------------------------------- | -------- | -------- |
| `PrimarySidebar.tsx`            | Use existing `onCreated` callback (line 353)            | P0       | Ready    |
| `use-tauri-session.ts`          | Use `activeWorktreePath` for session cwd + null guard   | P0       | Ready    |
| `ui-store.ts`                   | Add `sessionWorktreeMap` state + get param              | P0       | Ready    |
| `use-effective-path.ts`         | New helper hook                                         | P1       | New file |
| `protocol.ts`                   | Add `worktreePath` to 5 schemas                         | P1       | Ready    |
| `conversations/lib.rs`          | Add `worktree_path` to structs + fork + manager methods | P1       | Ready    |
| `conversations.rs` (Tauri)      | Update DTOs + commands (sync, orbit_core::Result)       | P1       | Ready    |
| `conversations.ts` (API)        | Update wrappers + both DTO types                        | P1       | Ready    |
| `conversation-handlers.ts`      | Pass worktree path on create/list                       | P1       | Ready    |
| `message-handler.ts`            | Map `worktree_path` in conversation responses           | P1       | Ready    |
| `use-sidebar-actions.ts`        | Send `worktree_path` on create                          | P1       | Ready    |
| `chat-actions.ts`               | Send `worktree_path` on create + FIX path separation    | P1       | Ready    |
| `use-chat-messages.ts`          | Send `worktree_path` on list + FIX path separation      | P1       | Ready    |
| `use-tauri-mock.ts`             | Add mock `worktree_path` fields                         | P1       | Ready    |
| `ConversationList.tsx`          | Filter/group by worktree with fallback                  | P1       | Ready    |
| `use-source-control.ts`         | Use `useEffectivePath()` for git status (line 115)      | P1       | Ready    |
| **`mappers/conversations.ts`**  | **Map worktreePath in DTO→UI conversion (CRITICAL)**    | **P1**   | **NEW**  |
| `use-tauri-message-listener.ts` | Pass worktree_path to conversationAddMessage            | P1       | Ready    |
| File explorer hooks             | Refresh on worktree change                              | P2       | Ready    |
| Terminal creation               | Use active worktree CWD                                 | P2       | Ready    |

---

## Testing Plan

### Manual Testing

1. **Create worktree and verify auto-switch**
   - Click [+], create "test-branch"
   - Verify sidebar shows test-branch as active
   - Verify new chats appear under test-branch

2. **Verify session uses correct cwd**
   - In test-branch worktree, start chat: "What directory are you in?"
   - Agent should respond with worktree path, not main workspace

3. **Verify parallel execution**
   - Create 3 worktrees
   - Start agent in each with long-running task
   - Verify all 3 run simultaneously without blocking

4. **Verify git operations**
   - In test-branch worktree, ask Claude to "push to GitHub"
   - Verify push goes to test-branch, not main

5. **Verify conversation isolation**
   - Create chats in different worktrees
   - Switch between worktrees
   - Verify each worktree shows only its chats

6. **Verify file explorer refresh**
   - Switch from main to feature worktree
   - Verify file tree shows feature worktree's directory

7. **Verify new terminal CWD**
   - Switch to feature worktree
   - Create new terminal
   - Run `pwd` - should show feature worktree path

### Integration Tests

```typescript
// agent-bridge tests
describe('Parallel Sessions', () => {
  it('should run multiple sessions with different cwds', async () => {
    const session1 = await createSession({ cwd: '/repo' });
    const session2 = await createSession({ cwd: '/repo-auth' });
    const session3 = await createSession({ cwd: '/repo-payments' });

    // All should be running simultaneously
    await Promise.all([
      sendMessage(session1, 'pwd'),
      sendMessage(session2, 'pwd'),
      sendMessage(session3, 'pwd'),
    ]);

    // Verify each responded with correct cwd
  });
});
```

---

## Migration Notes

### Existing Conversations

Conversations without `worktreePath` field:

- Treat as belonging to main worktree (via workspacePath match)
- No migration needed - backward compatible via `.optional()` in Zod and `#[serde(default)]` in Rust

### Backward Compatibility

- Sessions created before this change continue to work
- Conversations without `worktreePath` display under main worktree
- No breaking changes to agent-bridge protocol

---

## Success Criteria

- [ ] User can create worktree and app auto-switches to it
- [ ] Claude session uses worktree's directory as cwd
- [ ] Conversations are stored with worktree association
- [ ] Sidebar groups conversations by worktree
- [ ] Git operations use active worktree path
- [ ] File explorer refreshes when switching worktrees
- [ ] New terminals use active worktree as CWD
- [ ] Multiple agents can run in parallel on different worktrees
- [ ] No cross-contamination between worktree contexts
- [ ] Legacy conversations without worktreePath display correctly

---

## Audit History

### January 22, 2026 - Codex Full Audit (v5)

**Line Number Accuracy Report:**

- `CreateWorktreeDialog.onCreated` prop: ✅ correct at `create-worktree-dialog.tsx:38`
- `ensureSession` cwd assignment: ✅ correct at `use-tauri-session.ts:94` (function at line 87)
- Protocol schemas: ✅ correct at lines 123, 237, 1299, 1317
- `conversationsByWorktree`: ✅ correct at `ConversationList.tsx:58`
- `Conversation`/`ConversationSummary`: ✅ correct at `lib.rs:114` and `lib.rs:199`
- BEFORE/AFTER blocks: ✅ PrimarySidebar and use-source-control match exactly
- All 9 listed files verified to exist ✅

**useGitStatus Call Sites Found:**

- Only 1 real invocation: `use-source-control.ts:115` ✅
- Other hits are doc/example text (not call sites)

**Rust Function Signatures Verified:**

- `conversation_create`: line 240 ✅
- `conversation_list`: line 252 ✅
- `conversation_add_message`: line 294 ✅
- `ConversationManager::create`: line 428 ✅
- `ConversationManager::add_message`: line 656 ✅

**CRITICAL: Additional Files Identified (Missing from Plan):**

1. **`apps/agent/src/lib/mappers/conversations.ts`** - Must map worktreePath or field gets dropped
2. **`apps/agent/src/hooks/chat/handlers/chat-actions.ts`** - Workspace/worktree path mismatch risk
3. **`apps/agent/src/hooks/chat/use-chat-messages.ts`** - Must pass both paths separately
4. **`apps/agent/src/hooks/agent/use-tauri-message-listener.ts`** - Pass worktree_path to addMessage

**Corrections Applied:**

- Added Phase 3.7: Conversation Mapper update (CRITICAL)
- Added Phase 3.8: Fix workspace/worktree path separation
- Added Phase 3.9: Update conversationAddMessage call sites
- Updated file summary table with 3 new files

**Implementation Order Verified:** No circular dependencies ✅

**Final Verdict:** Plan now complete and ready for implementation.

---

### January 22, 2026 - Claude Opus Audit (v4)

**Verification Performed:**

- All 10 referenced files verified to exist ✅
- Line numbers verified (12/13 exact, 1 clarified)
- BEFORE code blocks match actual source ✅
- Only 1 `useGitStatus` call site at `use-source-control.ts:115` ✅

---

### January 22, 2026 - Codex Audit (v3)

**Issues Found & Fixed:**

1. **PrimarySidebar line reference:** Fixed from "line 38" to "line 353" - line 38 is in CreateWorktreeDialog.tsx, not PrimarySidebar.tsx
2. **ensureSession null guard:** Added null check for cwd - `SessionConfig.cwd` must be `string`, not `string | null`
3. **Rust command signatures:** Fixed to use sync `orbit_core::Result`, not `async Result<..., String>`
4. **Missing `Conversation::fork` update:** Added to carry `worktree_path` to forked conversations
5. **Missing `ConversationManager` method updates:** Added `worktree_path` parameter to `create()` and `add_message()`
6. **UI store `get()` accessor:** Added note to include `get` param in immer store initializer
7. **Missing frontend files:** Added Phase 3.6 with 6 additional files:
   - `message-handler.ts` - Map worktree_path in responses
   - `use-sidebar-actions.ts` - Send worktree_path on create
   - `chat-actions.ts` - Send worktree_path on create
   - `use-chat-messages.ts` - Send worktree_path on list
   - `use-tauri-mock.ts` - Mock responses
   - `conversations.ts` - Also add to ConversationDto (not just summary)
8. **Updated file summary table:** Now includes all 18 files

**Verified Correct by Codex:**

- All file references and line numbers now accurate ✅
- BEFORE code blocks match actual source ✅
- AFTER code blocks integrate correctly ✅
- No circular dependencies in implementation order ✅

### January 22, 2026 - Claude Audit (v2)

**Issues Found & Fixed:**

1. **Missing schema:** Added `GetConversationsSchema` (line ~254) - needed for filtering conversation list by worktree
2. **Missing Rust DTOs:** Added `ConversationDto` and `ConversationSummaryDto` updates in `conversations.rs`
3. **Line number correction:** `ensureSession` is at line 87 (function start), cwd assignment at line 94
4. **Missing import:** Added `useUIStore` import statement to Phase 2.1
5. **Clarified call site:** Specified exact location of `useGitStatus` call in `use-source-control.ts:115`
6. **Schema count:** Updated from 4 schemas to 5 schemas in Phase 3.1

**Verified Correct:**

- All 9 referenced files exist ✅
- `CreateWorktreeDialog.onCreated` prop exists at line 38 ✅
- `conversationsByWorktree` at line 58 in ConversationList.tsx ✅
- `Conversation` struct at line 114 in lib.rs ✅
- `ConversationSummary` doc comment at line 199, struct at line 202 in lib.rs ✅
- Rust command signatures match plan assumptions ✅
- `sessionWorktreeMap` correctly identified as new state (doesn't exist yet) ✅

### January 22, 2026 - Initial Audit (v1)

**Issues Found & Fixed:**

1. ~~Phase 1.2 localStorage persistence~~ - Already implemented, removed from plan
2. Phase 5 `useGitStatus` - Hook takes path as parameter, fixed to update call sites instead
3. Added missing protocol schemas (4 total, original plan only had 1)
4. Added missing Rust Tauri command updates
5. Added missing TypeScript API wrapper updates
6. Added Phase 6 for worktree switch side effects (file explorer, terminal CWD)
7. Added `useEffectivePath` helper hook for consistent path resolution
8. Updated file changes summary table with accurate file list
