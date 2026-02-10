# Rewind System Contract

> **Version:** 1.0.0
> **Status:** Design Document
> **Last Updated:** 2026-02-04

## Executive Summary

The Rewind System allows users to restore files and conversation state to a previous point in the chat history. This is a critical feature that enables users to undo unwanted changes, explore alternative approaches, and recover from errors.

**Key Principle:** Orbit reads the **same JSONL files** that Claude Code writes. This means:

- We DO NOT create our own persistence for messages
- We MUST build our own checkpoint/rewind system that works with the SDK's file checkpointing

---

## How Claude Code Does Rewind

Based on the [Claude Agent SDK documentation](../SDK/# Rewind file changes with checkpointing.md), the official SDK rewind mechanism works as follows:

### 1. Enable File Checkpointing

```typescript
const options = {
  enableFileCheckpointing: true,
  extraArgs: { 'replay-user-messages': null }, // Required for checkpoint UUIDs
  env: {
    ...process.env,
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
  },
};
```

### 2. Capture Checkpoint UUIDs

Checkpoints come from **user messages** in the SDK stream:

```typescript
for await (const message of response) {
  if (message.type === 'user' && message.uuid) {
    checkpointId = message.uuid; // This is the checkpoint!
  }
  if ('session_id' in message) {
    sessionId = message.session_id;
  }
}
```

### 3. Rewind Files

To rewind, you must either:

- **Inside the loop:** Call `response.rewindFiles(checkpointId)` directly
- **After the loop:** Resume the session with empty prompt, then call rewindFiles

```typescript
// After stream completes - resume session and rewind
const rewindQuery = query({
  prompt: '', // Empty prompt to open connection
  options: { ...opts, resume: sessionId },
});

for await (const msg of rewindQuery) {
  await rewindQuery.rewindFiles(checkpointId);
  break; // Exit after rewinding
}
```

### What Gets Tracked

The SDK tracks file changes made through these tools ONLY:

- **Write** - Creates/overwrites files
- **Edit** - Modifies specific parts of files
- **NotebookEdit** - Modifies Jupyter notebooks

**NOT tracked:** Changes via Bash commands (`echo > file`, `sed -i`, etc.)

---

## Current Orbit Implementation (What We Have)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ CheckpointStore │  │  Conversation   │  │   Message           │  │
│  │ (Zustand)       │  │  Handlers       │  │   Components        │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────┬───────────┘  │
│           │                    │                     │               │
│           └────────────────────┼─────────────────────┘               │
│                                │                                     │
│                          postMessage                                 │
│                                ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Tauri Bridge (Rust)                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                │                                     │
│                          stdin/stdout                                │
│                                ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Agent Bridge (Bun)                          │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                      │  │
│  │  │ SessionManager  │  │  OrbitAgent     │                      │  │
│  │  │ (IPC handling)  │  │ (SDK wrapper)   │                      │  │
│  │  └────────┬────────┘  └────────┬────────┘                      │  │
│  │           │                    │                                │  │
│  │           └────────────────────┼───────────────────────────────│  │
│  │                                ▼                                │  │
│  │  ┌───────────────────────────────────────────────────────────┐ │  │
│  │  │              Claude Agent SDK                              │ │  │
│  │  │  - enableFileCheckpointing: true                          │ │  │
│  │  │  - extraArgs: { 'replay-user-messages': null }            │ │  │
│  │  │  - rewindFiles(checkpointId)                              │ │  │
│  │  └───────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Files

| Layer    | File                                                           | Purpose                                              |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Frontend | `apps/agent/src/stores/agent/checkpoint-store.ts`              | Tracks checkpoints per session/message               |
| Frontend | `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` | Handles `conversation:rewind` message                |
| Frontend | `apps/agent/src/types/protocol/protocol.ts`                    | Protocol types including `RewindConversation`        |
| Backend  | `agent-bridge/src/agent/core/agent.ts`                         | `OrbitAgent.rewindFiles()` and `rewindFilesInLoop()` |
| Backend  | `agent-bridge/src/agent/session/session-manager.ts`            | Session lifecycle and message streaming              |

### Current Checkpoint Store

The `CheckpointStore` tracks TWO types of checkpoints per message:

```typescript
interface CheckpointState {
  // Turn START: User message UUID - used for resumeSessionAt
  turnStartCheckpoints: Record<sessionId, Record<messageId, checkpointId>>;

  // Turn END: Checkpoint from NEXT user message - used for rewindFiles
  turnEndCheckpoints: Record<sessionId, Record<messageId, checkpointId>>;

  // Current turn tracking
  currentTurnStartCheckpoint: { sessionId; checkpointId } | null;
  currentUserMessageId: { sessionId; messageId } | null;
  pendingMessageForTurnEnd: { sessionId; messageId } | null;
}
```

**The problem:** This complex state machine is difficult to maintain and debug.

### Current Rewind Flow

```
User clicks "Rewind" button on a message
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend sends: conversation:rewind                              │
│ {                                                                │
│   session_id,                                                    │
│   message_id,       // Clicked message (for UI fork)             │
│   user_message_id   // User message (for checkpoint lookup)      │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ handleConversationRewind():                                      │
│ 1. Get checkpoint from CheckpointStore                           │
│ 2. Get SDK session ID                                            │
│ 3. Call agentRewindFiles() to restore files                      │
│ 4. Fork conversation to truncate messages                        │
│ 5. Store rewind context for prepending to first message          │
│ 6. Emit conversation:rewound                                     │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ agent-bridge: rewindFiles()                                      │
│ 1. Interrupt current query                                       │
│ 2. Create resumed query with empty prompt                        │
│ 3. Call query.rewindFiles(checkpointId)                          │
│ 4. Break out of loop                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Problems with Current Implementation

### 1. Checkpoint Tracking is Fragile

The current checkpoint store uses a complex state machine with multiple tracking fields:

- `currentTurnStartCheckpoint`
- `currentUserMessageId`
- `pendingMessageForTurnEnd`

This is error-prone because:

- Order of events matters
- Race conditions can occur
- State can get out of sync

### 2. Two Message IDs Confusion

The rewind request includes TWO message IDs:

- `message_id` - The clicked message (could be user OR assistant)
- `user_message_id` - The user message (for checkpoint lookup)

This is confusing because checkpoints are tied to user messages, but users can click on either user or assistant messages.

### 3. Rewind Context vs SDK Resume

Current approach:

- Does NOT use SDK's `resume` option for message history
- Instead prepends truncated messages to the first new message as "context"
- This was done because SDK resume loads ALL messages

This works but loses the SDK's built-in checkpoint tracking for resumed sessions.

### 4. File Rewind Can Fail Silently

If file rewind fails, we continue with conversation fork anyway. This can leave files in an inconsistent state.

---

## Proposed New Implementation

### Design Principles

1. **Simplicity:** Use the SDK's checkpoint UUIDs directly, don't build complex state machines
2. **Single Source of Truth:** Store checkpoints in a simple Map, keyed by user message ID
3. **Clear Separation:** Split file rewind (SDK) from conversation truncation (Orbit)
4. **Fail Fast:** If file rewind fails, don't proceed with conversation fork

### New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Checkpoint System v2                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              CheckpointRegistry (Simple)                   │  │
│  │                                                            │  │
│  │  checkpoints: Map<sessionId, Map<userMessageId, uuid>>    │  │
│  │                                                            │  │
│  │  Methods:                                                  │  │
│  │    - register(sessionId, userMessageId, uuid)             │  │
│  │    - get(sessionId, userMessageId) → uuid | undefined     │  │
│  │    - getLatest(sessionId) → uuid | undefined              │  │
│  │    - clear(sessionId)                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              RewindService                                 │  │
│  │                                                            │  │
│  │  Methods:                                                  │  │
│  │    - rewindTo(sessionId, userMessageId) → Result          │  │
│  │        1. Get checkpoint UUID from registry               │  │
│  │        2. Call SDK rewindFiles()                          │  │
│  │        3. Truncate conversation JSONL                     │  │
│  │        4. Emit rewound event                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### New Checkpoint Store Interface

```typescript
// apps/agent/src/stores/agent/checkpoint-store.ts

interface CheckpointState {
  /**
   * Simple map of checkpoints: sessionId → userMessageId → checkpointUUID
   * Checkpoints are the SDK's user message UUIDs from replay-user-messages
   */
  checkpoints: Map<string, Map<string, string>>;

  /**
   * Register a checkpoint when we receive a user message with UUID
   */
  registerCheckpoint: (sessionId: string, userMessageId: string, uuid: string) => void;

  /**
   * Get the checkpoint for a specific user message
   */
  getCheckpoint: (sessionId: string, userMessageId: string) => string | undefined;

  /**
   * Get the latest checkpoint for a session (for last-message fallback)
   */
  getLatestCheckpoint: (sessionId: string) => string | undefined;

  /**
   * Clear all checkpoints for a session
   */
  clearSession: (sessionId: string) => void;

  /**
   * Clear all checkpoints
   */
  clearAll: () => void;
}
```

### New Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CHECKPOINT CAPTURE (During Message Streaming)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SDK sends: { type: 'user', uuid: 'checkpoint-abc' }            │
│                         │                                        │
│                         ▼                                        │
│  agent-bridge emits: { type: 'checkpoint', checkpoint_id }      │
│                         │                                        │
│                         ▼                                        │
│  Frontend: checkpointStore.registerCheckpoint(                   │
│              sessionId,                                          │
│              currentUserMessageId,  // From message:send          │
│              checkpointId                                         │
│            )                                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. REWIND TRIGGER (User Action)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks rewind on message X                                 │
│                         │                                        │
│  Frontend: postMessage({                                         │
│    type: 'conversation:rewind',                                  │
│    session_id,                                                   │
│    target_message_id: X,           // Message to rewind TO       │
│    checkpoint_id: checkpointStore.getCheckpoint(sessionId, X)   │
│  })                                                              │
│                                                                  │
│  NOTE: Frontend MUST find the user message ID for checkpoint    │
│        lookup. If user clicked on assistant message, find the   │
│        preceding user message.                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. FILE REWIND (SDK Operation)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  agent-bridge receives rewind request                            │
│                         │                                        │
│                         ▼                                        │
│  OrbitAgent.rewindFiles(checkpointId):                          │
│    1. Interrupt current query (if any)                          │
│    2. Resume session with empty prompt                           │
│    3. Call query.rewindFiles(checkpointId)                      │
│    4. Return success/failure                                     │
│                         │                                        │
│                         ▼                                        │
│  If FAILED → Return error, do NOT proceed                        │
│  If SUCCESS → Continue to conversation truncation                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. CONVERSATION TRUNCATION (JSONL Operation)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  After file rewind succeeds:                                     │
│                         │                                        │
│                         ▼                                        │
│  agent-bridge:                                                   │
│    1. Read JSONL file for session                                │
│    2. Find target message index                                  │
│    3. Truncate to that point                                     │
│    4. Write truncated JSONL                                      │
│    5. Generate new session ID (fork)                             │
│    6. Emit conversation:rewound with truncated messages          │
│                         │                                        │
│                         ▼                                        │
│  Frontend:                                                       │
│    1. Update UI to show truncated messages                       │
│    2. Switch to new session ID                                   │
│    3. Clear checkpoints after target message                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Protocol Changes

#### Frontend → Backend

```typescript
// apps/agent/src/types/protocol/protocol.ts

export const RewindConversationSchema = z.object({
  type: z.literal('conversation:rewind'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,

  /** The message ID to rewind TO (keep this message and all before it) */
  target_message_id: z.string(),

  /**
   * The SDK checkpoint UUID for file restoration.
   * This MUST be the checkpoint from the user message that triggered
   * the turn we're rewinding to. Frontend is responsible for looking
   * this up from CheckpointStore.
   */
  checkpoint_id: z.string().optional(),
});
```

#### Backend → Frontend

```typescript
// apps/agent/src/types/protocol/protocol.ts

export const ConversationRewoundSchema = z.object({
  type: z.literal('conversation:rewound'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,

  /** New session ID after rewind (all future messages use this) */
  new_session_id: z.string(),

  /** The message we rewound to */
  target_message_id: z.string(),

  /** Whether files were successfully restored */
  files_restored: z.boolean(),

  /** Error message if file restore failed */
  file_restore_error: z.string().optional(),

  /** Truncated messages (for UI update) */
  messages: z.array(TruncatedMessageSchema),
});

export const AgentCheckpointSchema = z.object({
  type: z.literal('agent:checkpoint'),
  uuid: UUIDSchema,
  session_id: SessionIdSchema,

  /** The SDK checkpoint UUID (from user message) */
  checkpoint_id: z.string(),

  /**
   * The user message ID this checkpoint belongs to.
   * Frontend uses this to associate checkpoint with the message.
   */
  user_message_id: z.string(),
});
```

### Implementation Files

| File                                                           | Changes Required                     |
| -------------------------------------------------------------- | ------------------------------------ |
| `apps/agent/src/stores/agent/checkpoint-store.ts`              | Simplify to Map-based storage        |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` | Update rewind flow                   |
| `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts`    | Handle new checkpoint event format   |
| `apps/agent/src/types/protocol/protocol.ts`                    | Update protocol schemas              |
| `agent-bridge/src/agent/core/agent.ts`                         | Already implemented correctly        |
| `agent-bridge/src/agent/session/session-manager.ts`            | Emit checkpoint with user message ID |
| `agent-bridge/src/protocol/schemas.ts`                         | Update schemas                       |

---

## Implementation Phases

### Phase 1: Simplify Checkpoint Store

1. Replace complex state machine with simple Map
2. Update checkpoint registration to use user message ID
3. Add `getCheckpoint()` and `getLatestCheckpoint()` methods
4. Remove `turnStartCheckpoints`, `turnEndCheckpoints`, and tracking fields

### Phase 2: Update Event Emission

1. Modify agent-bridge to emit `agent:checkpoint` with `user_message_id`
2. Update frontend handler to register checkpoints properly
3. Track user message ID when sending messages (before checkpoint arrives)

### Phase 3: Update Rewind Flow

1. Update `conversation:rewind` to include `checkpoint_id` from frontend
2. Remove complex checkpoint lookup logic from handler
3. Add file restore error handling
4. Update `conversation:rewound` response

### Phase 4: Conversation Truncation

1. Implement JSONL truncation in agent-bridge
2. Generate new session ID for fork
3. Update frontend to handle new session ID

### Phase 5: Testing

1. Unit tests for new checkpoint store
2. Integration tests for rewind flow
3. E2E tests for complete rewind scenario

---

## Test Scenarios

### Scenario 1: Simple Rewind

```
1. User sends message A
2. Claude responds with B (modifies file.ts)
3. User sends message C
4. Claude responds with D (modifies file.ts again)
5. User clicks rewind on message B

Expected:
- file.ts restored to state after B
- Messages: A, B
- New session created for future messages
```

### Scenario 2: Rewind on User Message

```
1. User sends message A
2. Claude responds with B
3. User sends message C
4. User clicks rewind on message A (before Claude responds to C)

Expected:
- Files restored to state after A (if any changes)
- Messages: A
- New session created
```

### Scenario 3: Rewind Without File Changes

```
1. User sends message A
2. Claude responds with B (read-only, no file changes)
3. User sends message C
4. User clicks rewind on message B

Expected:
- No file changes to restore
- Messages: A, B
- New session created
```

### Scenario 4: Rewind Failure Recovery

```
1. User sends message A
2. Claude responds with B (modifies file.ts)
3. User manually deletes file.ts
4. User clicks rewind on message A

Expected:
- File restore fails (file doesn't exist)
- Conversation NOT truncated
- Error shown to user
```

---

## Migration Notes

### Breaking Changes

1. `CheckpointStore` API completely changed
2. `conversation:rewind` message format changed
3. `conversation:rewound` message format changed
4. `agent:checkpoint` event format changed

### Backwards Compatibility

None required - this is a complete rewrite of the system.

### Data Migration

No data migration needed - checkpoints are ephemeral (only exist in memory during session).

---

## Appendix A: SDK Reference

### Key SDK Types

```typescript
// From @anthropic-ai/claude-agent-sdk

interface Query extends AsyncGenerator<SDKMessage, void> {
  rewindFiles(userMessageUuid: string): Promise<void>;
  // ... other methods
}

interface Options {
  enableFileCheckpointing?: boolean;
  extraArgs?: Record<string, string | null>;
  env?: Record<string, string>;
  resume?: string;
  forkSession?: boolean;
  // ... other options
}

interface SDKUserMessage {
  type: 'user';
  uuid?: string; // Checkpoint UUID - only present with replay-user-messages
  session_id: string;
  message: { content: unknown };
  parent_tool_use_id: string | null;
}
```

### Required Environment

```bash
# Must be set for checkpointing to work
CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
```

### Required Options

```typescript
const options = {
  enableFileCheckpointing: true,
  extraArgs: { 'replay-user-messages': null }, // REQUIRED for checkpoint UUIDs
  env: {
    ...process.env,
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
  },
};
```

---

## Appendix B: JSONL File Format

Claude Code stores conversations in JSONL format at:

```
~/.claude/projects/<project-hash>/sessions/<session-id>.jsonl
```

Each line is a JSON object representing a message or event. We read these files but don't write to them - the SDK handles all writes.

For conversation truncation, we:

1. Read the JSONL file
2. Parse each line
3. Find the target message
4. Create a new session with truncated messages
5. Let the SDK create a new JSONL file when the user sends the next message
