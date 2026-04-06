# Mission 04: Component Memoization

> The 30-minute performance win.

---

## Why This Matters

React re-renders every child component when a parent re-renders, unless that child is wrapped in `React.memo()`. During active streaming, the chat message list re-renders on every token. Each message contains tool widgets -- and 19 out of 20 tool widgets are NOT memoized. This means every single tool widget in the conversation re-renders on every token, even though their props haven't changed. The Edit/Write tool widgets are especially expensive because they contain the Pierre diff viewer (~200KB of DOM). A conversation with 10 tool uses and active streaming means 10 unnecessary heavy re-renders per frame.

This is the single quickest win in the entire playbook. Wrapping components in `React.memo()` is mechanical, low-risk, and immediately measurable.

---

## Current State

### 19 of 20 Tool Widgets Unmemoized

The tool widget components in `components/chat/tools/` render inline within chat messages. None are wrapped in `React.memo()` except one. During streaming, the parent `MessageItem` re-renders on every token, cascading re-renders into every tool widget in the conversation.

### Edit/Write Widgets Are Heavy

The Edit and Write tool widgets embed the Pierre diff viewer, which renders a full CodeMirror instance with syntax highlighting. Each unmemoized re-render reconstructs DOM for ~200KB of diffed content. In a refactoring session with 5-10 file edits, this is 1-2MB of unnecessary DOM work per frame.

### GitStatusBadge in File Tree Loop

`GitStatusBadge` renders inside the file tree's virtualized row. With 10k+ files visible in the tree, this component is instantiated thousands of times. Each re-render of the file tree (triggered by git status updates, file watches, or panel resizes) re-renders every visible badge.

---

## What To Add

### Memo Wrap All 19 Tool Widgets

```typescript
// Before: every tool widget
const BashToolWidget: FC<BashToolWidgetProps> = ({ tool, isStreaming }) => {
  return (
    <div className="tool-widget">
      {/* ... */}
    </div>
  );
};

// After: wrap in React.memo with displayName
const BashToolWidget: FC<BashToolWidgetProps> = memo(({ tool, isStreaming }) => {
  return (
    <div className="tool-widget">
      {/* ... */}
    </div>
  );
});
BashToolWidget.displayName = 'BashToolWidget';
```

### Custom Comparators for Heavy Widgets

```typescript
// For Edit/Write widgets with Pierre diff viewer
const EditToolWidget: FC<EditToolWidgetProps> = memo(
  ({ tool, isStreaming }) => {
    return (
      <div className="tool-widget">
        <PierreDiffViewer diff={tool.diff} />
      </div>
    );
  },
  (prev, next) => {
    // Only re-render if the tool result changed or streaming state flipped
    return (
      prev.tool.id === next.tool.id &&
      prev.tool.status === next.tool.status &&
      prev.tool.output === next.tool.output &&
      prev.isStreaming === next.isStreaming
    );
  }
);
EditToolWidget.displayName = 'EditToolWidget';
```

### Memoize GitStatusBadge

```typescript
// Before: re-renders on every file tree update
const GitStatusBadge: FC<GitStatusBadgeProps> = ({ status, path }) => {
  return <span className={statusToClass(status)}>{statusToChar(status)}</span>;
};

// After: only re-renders when status actually changes
const GitStatusBadge: FC<GitStatusBadgeProps> = memo(({ status, path }) => {
  return <span className={statusToClass(status)}>{statusToChar(status)}</span>;
});
GitStatusBadge.displayName = 'GitStatusBadge';
```

### Lazy-Load Edit/Write Widgets

```typescript
// Only load Pierre diff viewer when an Edit/Write tool actually appears
const EditToolWidget = lazy(() => import('./EditToolWidget'));
const WriteToolWidget = lazy(() => import('./WriteToolWidget'));

// In the tool widget resolver:
function resolveToolWidget(toolType: string): ComponentType<ToolWidgetProps> {
  switch (toolType) {
    case 'edit':
      return EditToolWidget; // Lazy-loaded
    case 'write':
      return WriteToolWidget; // Lazy-loaded
    default:
      return DefaultToolWidget;
  }
}
```

---

## What We Get

| Metric                                    | Before                                | After                         |
| ----------------------------------------- | ------------------------------------- | ----------------------------- |
| Tool widget re-renders per token          | 19 widgets x every token = ~950/sec   | 0 (props unchanged = skip)    |
| Pierre diff DOM work during streaming     | Full re-render per token (~200KB DOM) | Zero (memo blocks re-render)  |
| GitStatusBadge re-renders per tree update | All visible rows (~500+)              | Only rows with changed status |
| Initial bundle for Edit/Write tools       | Loaded upfront (~200KB)               | Lazy-loaded on first use      |
| Time to implement                         | --                                    | 30 minutes to 2 hours         |

---

## Estimated Complexity

**Small (30 minutes - 2 hours)**

- 30 min: Wrap all 19 tool widgets in memo() with displayName
- 30 min: Add custom comparators for Edit/Write/Bash heavy widgets
- 30 min: Memoize GitStatusBadge and other file tree leaf components
- 30 min: Add lazy() for Edit/Write widgets, test loading states

This is purely mechanical work. No architectural decisions, no state changes, no API modifications.

---

## Dependencies

- None. Zero dependencies. Start here.
- This is the recommended first mission in the playbook.

---

## Risks

| Risk                                    | Mitigation                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Stale renders from incorrect comparator | Default shallow compare (no custom comparator) is correct for 17 of 19 widgets. Only add custom comparators for the 2-3 heaviest ones. |
| Missing displayName in dev tools        | Add displayName to every memo'd component. This is a one-line addition.                                                                |
| Lazy-load Suspense boundary flash       | Wrap lazy widgets in a Suspense with a skeleton that matches the final layout. Tool widgets already have a loading state.              |
| Over-memoization hiding bugs            | memo() never changes behavior, only skips renders when props are equal. If the component was correct before, it's correct after.       |
