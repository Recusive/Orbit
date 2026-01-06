# Workflow File Sync Feature

## Overview

The **Workflow File Sync** feature enables bidirectional synchronization between workflow cards and markdown files on disk. This bridges the gap between your visual workflow planning canvas and your actual project documentation.

---

## Use Cases

### 1. Documentation-Driven Development

**Scenario**: You're planning a new feature and want your planning documents to live alongside your code.

**How it helps**:

- Create a workflow card for "Feature Requirements"
- Link it to `/docs/features/user-auth.md` in your project
- Edit either the card OR the file - changes sync automatically
- Your planning workflow stays in sync with your committed documentation

**Benefit**: Planning artifacts become real project documentation without copy-paste.

---

### 2. README and API Doc Management

**Scenario**: You have multiple README files across your project that you want to visualize and edit together.

**How it helps**:

- Create cards for each README (main, packages, examples)
- Link each card to its respective `README.md` file
- See all your documentation in one visual canvas
- Edit and see relationships between docs
- Changes write back to actual files

**Benefit**: Bird's-eye view of all your documentation with direct editing.

---

### 3. ADR (Architecture Decision Records) Workflow

**Scenario**: Your team maintains ADRs in a `/docs/adr/` folder.

**How it helps**:

- Create a workflow template for ADR decisions
- Link cards to ADR markdown files: `0001-use-react.md`, `0002-state-management.md`
- Connect cards to show decision dependencies
- New ADRs start as cards, then sync to files when ready

**Benefit**: Visual decision history with real file storage.

---

### 4. Project Planning with Living Documents

**Scenario**: Sprint planning with tasks that become actual task files.

**How it helps**:

- Plan sprint in workflow canvas
- Each task card links to `/planning/sprint-42/task-name.md`
- Add details, acceptance criteria, notes
- Files can be opened in any editor or IDE
- Git tracks all changes

**Benefit**: Visual planning that produces trackable, version-controlled artifacts.

---

### 5. Research and Note Organization

**Scenario**: Researching a technical topic with multiple sources and findings.

**How it helps**:

- Create cards for different research areas
- Link to markdown notes files
- Connect cards to show relationships
- Edit notes in workflow OR in your favorite editor
- All synced automatically

**Benefit**: Visual research organization with persistent, portable notes.

---

### 6. Collaborative Editing

**Scenario**: Team member edits a markdown file while you're viewing it in workflow.

**How it helps**:

- File watcher detects external changes
- Conflict detection if you've also edited
- Choose: Keep your changes, use file version, or merge
- Never lose work

**Benefit**: Safe collaboration between workflow users and file editors.

---

## Feature Capabilities

### Sync Modes

| Mode              | Description                                   | Use When                                   |
| ----------------- | --------------------------------------------- | ------------------------------------------ |
| **Bidirectional** | Changes sync both ways                        | Default - full two-way sync                |
| **Read Only**     | Card pulls from file, never writes            | Viewing external docs you shouldn't modify |
| **Write Only**    | Card pushes to file, ignores external changes | You own the file, others shouldn't edit    |
| **No Sync**       | Link for reference only                       | Just want to track the association         |

### Conflict Resolution

When the same content is edited in both places:

- **Keep Card**: Your workflow edits win
- **Use File**: External file changes win
- Visual indicator shows conflict state

### Visual Indicators

- **File icon** in card header when linked
- **Warning icon** when conflict detected
- **Tooltip** shows full file path
- **Last synced** timestamp in properties panel

---

## How It Works

### Linking a Card to a File

1. Select a card in the workflow canvas
2. Open the right sidebar → Properties tab
3. In "Linked File" section, enter the file path
4. Select sync mode (default: Bidirectional)
5. Click "Link to File"

### Sync Flow

```
┌─────────────────┐     ┌─────────────────┐
│  Workflow Card  │────▶│   postMessage   │
│   (Frontend)    │◀────│   (IPC Bridge)  │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Orbit Backend  │
                        │  (Extension)    │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   File System   │
                        │   (fs.watch)    │
                        └─────────────────┘
```

### Message Protocol

| Message                      | Direction          | Purpose                         |
| ---------------------------- | ------------------ | ------------------------------- |
| `workflow:link-file`         | Frontend → Backend | Link card to file path          |
| `workflow:file-linked`       | Backend → Frontend | Confirm link, send file content |
| `workflow:unlink-file`       | Frontend → Backend | Remove file association         |
| `workflow:file-unlinked`     | Backend → Frontend | Confirm unlink                  |
| `workflow:sync-file`         | Frontend → Backend | Force sync now                  |
| `workflow:file-synced`       | Backend → Frontend | Confirm sync complete           |
| `workflow:file-changed`      | Backend → Frontend | File was modified externally    |
| `workflow:resolve-conflict`  | Frontend → Backend | User resolved conflict          |
| `workflow:conflict-resolved` | Backend → Frontend | Confirm resolution applied      |

---

## Technical Implementation

### Frontend (orbit-canvas)

**Files Modified**:

- `src/types/workflowTypes.ts` - Added `FileSyncMode`, `FileConflict`, card properties
- `src/hooks/useBackendSync.ts` - File sync operations and message handlers
- `src/stores/workflowStore.ts` - Helper actions for clearing file state
- `src/components/workflow/CardPropertiesPanel.tsx` - File linking UI
- `src/components/workflow/MarkdownCardNode.tsx` - Visual indicators
- `src/components/workflow/WorkflowRightSidebar.tsx` - Wired up operations

### Backend (Orbit extension)

**Files to Modify**:

- `src/orbit/canvas/renderer/canvasWebviewProvider.ts` - Message handlers
- `src/orbit/workflow/main/workflowStorage.ts` - File watching logic

---

## Benefits Summary

| Benefit                  | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| **No Copy-Paste**        | Changes flow automatically between workflow and files |
| **Version Control**      | Linked files are real files - Git tracks everything   |
| **Tool Flexibility**     | Edit in workflow canvas OR your favorite editor       |
| **Visual Organization**  | See document relationships in the canvas              |
| **Conflict Safety**      | Never lose work from concurrent edits                 |
| **Portable Artifacts**   | Markdown files work everywhere                        |
| **Living Documentation** | Planning docs become real project docs                |

---

## Comparison: With vs Without File Sync

### Without File Sync

1. Plan in workflow canvas
2. Manually copy content to markdown files
3. Edit files, forget to update workflow
4. Workflow becomes stale
5. Repeat copy-paste cycle

### With File Sync

1. Plan in workflow canvas
2. Link cards to markdown files
3. Edit anywhere - everything stays in sync
4. Workflow and files always match
5. Zero maintenance

---

## Future Enhancements

- **File Picker UI**: Browse and select files instead of typing paths
- **Auto-Create Files**: Create new files when linking non-existent paths
- **Glob Patterns**: Link card to multiple files with patterns
- **Git Integration**: Show file status (modified, staged, committed)
- **Diff View**: See differences during conflict resolution
