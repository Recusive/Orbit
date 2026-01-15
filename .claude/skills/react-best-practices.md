---
name: react-best-practices
description: React and TypeScript performance optimization guidelines from Vercel Engineering. Apply when writing, reviewing, or refactoring React code to ensure optimal performance patterns.
triggers:
  - writing React components
  - implementing data fetching
  - reviewing code for performance
  - optimizing bundle size
  - creating hooks or stores
---

# React Best Practices for Orbit

Performance optimization guide for React 19 and TypeScript applications, adapted from Vercel Engineering. Contains 45 rules across 8 categories, prioritized by impact.

## Rule Categories by Priority

| Priority | Category                  | Impact      | When to Apply                   |
| -------- | ------------------------- | ----------- | ------------------------------- |
| 1        | Eliminating Waterfalls    | CRITICAL    | Async operations, data fetching |
| 2        | Bundle Size Optimization  | CRITICAL    | Imports, dynamic loading        |
| 3        | Server-Side Performance   | HIGH        | API calls, caching              |
| 4        | Client-Side Data Fetching | MEDIUM-HIGH | Hooks, SWR patterns             |
| 5        | Re-render Optimization    | MEDIUM      | State, memoization              |
| 6        | Rendering Performance     | MEDIUM      | JSX, lists, animations          |
| 7        | JavaScript Performance    | LOW-MEDIUM  | Loops, lookups, caching         |
| 8        | Advanced Patterns         | LOW         | Refs, callbacks                 |

---

## 1. Eliminating Waterfalls (CRITICAL)

### async-parallel: Promise.all() for Independent Operations

When async operations have no interdependencies, execute them concurrently.

```typescript
// BAD: Sequential execution (3 round trips)
const user = await fetchUser();
const posts = await fetchPosts();
const comments = await fetchComments();

// GOOD: Parallel execution (1 round trip)
const [user, posts, comments] = await Promise.all([fetchUser(), fetchPosts(), fetchComments()]);
```

### async-defer-await: Move await into branches

Only await when the value is actually needed.

```typescript
// BAD: Always waits even when not needed
async function processData(shouldFetch: boolean) {
  const data = await fetchData();
  if (shouldFetch) {
    return transform(data);
  }
  return null;
}

// GOOD: Only awaits when necessary
async function processData(shouldFetch: boolean) {
  if (shouldFetch) {
    const data = await fetchData();
    return transform(data);
  }
  return null;
}
```

### async-suspense-boundaries: Use Suspense to stream content

Wrap async components in Suspense boundaries to stream content progressively.

```tsx
// GOOD: Stream content as it becomes available
<Suspense fallback={<Skeleton />}>
  <AsyncComponent />
</Suspense>
```

---

## 2. Bundle Size Optimization (CRITICAL)

### bundle-barrel-imports: Import directly, avoid barrel files

Import from specific files instead of barrel `index.ts` files to enable tree-shaking.

```typescript
// BAD: Imports entire module
import { Button } from '@/components/ui';

// GOOD: Imports only what's needed
import { Button } from '@/components/ui/button';
```

### bundle-dynamic-imports: Lazy-load heavy components

Use dynamic imports for large components not needed on initial render.

```tsx
// BAD: Heavy component in main bundle
import { CodeMirrorEditor } from './CodeMirrorEditor';

// GOOD: Loads on demand (Vite/React.lazy)
const CodeMirrorEditor = React.lazy(() => import('./CodeMirrorEditor'));

function EditorPanel({ code }: { code: string }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <CodeMirrorEditor value={code} />
    </Suspense>
  );
}
```

### bundle-defer-third-party: Load analytics after hydration

Load non-critical third-party scripts after the app is interactive.

```tsx
// GOOD: Load analytics after mount
useEffect(() => {
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init('key');
  });
}, []);
```

### bundle-conditional: Load modules only when activated

Only import modules when the feature is actually used.

```tsx
// GOOD: Load syntax highlighter only when needed
const [highlighter, setHighlighter] = useState<Shiki | null>(null)

useEffect(() => {
  if (showCodeBlock) {
    import('shiki').then(m => m.createHighlighter({ ... }))
      .then(setHighlighter)
  }
}, [showCodeBlock])
```

---

## 3. Client-Side Data Fetching (MEDIUM-HIGH)

### client-swr-dedup: Use SWR for automatic deduplication

SWR automatically deduplicates identical requests.

```tsx
// GOOD: Multiple components can call this without duplicate fetches
function useFileContent(path: string) {
  const { data, error, isLoading } = useSWR(path ? ['file', path] : null, () => readFile(path));
  return { content: data, error, isLoading };
}
```

### client-event-listeners: Deduplicate global event listeners

Use a single global listener instead of per-component listeners.

```tsx
// BAD: Each component adds its own listener
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

// GOOD: Single shared listener via hook or store
const windowSize = useWindowSize(); // Single listener shared across components
```

---

## 4. Re-render Optimization (MEDIUM)

### rerender-defer-reads: Don't subscribe to state only used in callbacks

If state is only used in event handlers, read it directly from store.

```tsx
// BAD: Re-renders on every state change
function Component() {
  const count = useStore((state) => state.count);
  const handleClick = () => console.log(count);
  return <button onClick={handleClick}>Log</button>;
}

// GOOD: No re-renders, reads fresh value on click
function Component() {
  const handleClick = () => {
    const count = useStore.getState().count;
    console.log(count);
  };
  return <button onClick={handleClick}>Log</button>;
}
```

### rerender-memo: Extract expensive work into memoized components

Wrap expensive computations in useMemo or extract into memo'd components.

```tsx
// GOOD: Expensive list only re-renders when items change
const MemoizedList = memo(function ItemList({ items }: { items: Item[] }) {
  return items.map((item) => <ExpensiveItem key={item.id} {...item} />);
});
```

### rerender-dependencies: Use primitive dependencies

Effects with object dependencies re-run too often.

```tsx
// BAD: Re-runs when object reference changes
useEffect(() => {
  doSomething(config.value);
}, [config]);

// GOOD: Only re-runs when actual value changes
useEffect(() => {
  doSomething(config.value);
}, [config.value]);
```

### rerender-functional-setstate: Use functional setState for stable callbacks

Functional updates don't need the current value in closure.

```tsx
// BAD: Creates new callback when count changes
const increment = useCallback(() => setCount(count + 1), [count]);

// GOOD: Stable callback, no dependencies needed
const increment = useCallback(() => setCount((c) => c + 1), []);
```

### rerender-lazy-state-init: Pass function to useState for expensive values

Expensive initial values should be computed lazily.

```tsx
// BAD: parseJSON runs on every render
const [data] = useState(parseJSON(hugeString));

// GOOD: parseJSON only runs once
const [data] = useState(() => parseJSON(hugeString));
```

---

## 5. Rendering Performance (MEDIUM)

### rendering-content-visibility: Use content-visibility for long lists

Hide off-screen content to reduce rendering work.

```css
.virtual-list-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 100px;
}
```

### rendering-hoist-jsx: Extract static JSX outside components

Static JSX should be hoisted to module level.

```tsx
// BAD: Creates new object every render
function Component() {
  const icon = <ChevronRight className="h-4 w-4" />;
  return <button>{icon}</button>;
}

// GOOD: Single instance reused
const chevronIcon = <ChevronRight className="h-4 w-4" />;
function Component() {
  return <button>{chevronIcon}</button>;
}
```

### rendering-conditional-render: Use ternary, not && for conditionals

Ternary is clearer and avoids rendering `false` or `0`.

```tsx
// BAD: Can render 0 or false
{
  count && <Badge count={count} />;
}

// GOOD: Explicit branches
{
  count > 0 ? <Badge count={count} /> : null;
}
```

---

## 6. JavaScript Performance (LOW-MEDIUM)

### js-index-maps: Build Map for repeated lookups

Convert arrays to Maps for O(1) lookups.

```typescript
// BAD: O(n) lookup on each iteration
items.map((item) => {
  const related = allItems.find((i) => i.id === item.relatedId);
  return { ...item, related };
});

// GOOD: O(1) lookup
const itemMap = new Map(allItems.map((i) => [i.id, i]));
items.map((item) => ({
  ...item,
  related: itemMap.get(item.relatedId),
}));
```

### js-cache-property-access: Cache object properties in loops

Avoid repeated property access in tight loops.

```typescript
// BAD: Accesses arr.length on every iteration
for (let i = 0; i < arr.length; i++) { ... }

// GOOD: Cached length
for (let i = 0, len = arr.length; i < len; i++) { ... }
```

### js-early-exit: Return early from functions

Exit early to avoid unnecessary computation.

```typescript
// BAD: Nested conditions
function process(item: Item | null) {
  if (item) {
    if (item.isValid) {
      return transform(item);
    }
  }
  return null;
}

// GOOD: Early returns
function process(item: Item | null) {
  if (!item) return null;
  if (!item.isValid) return null;
  return transform(item);
}
```

### js-set-map-lookups: Use Set/Map for O(1) lookups

Replace array.includes() with Set.has() for frequent lookups.

```typescript
// BAD: O(n) on each check
const ids = ['a', 'b', 'c']
if (ids.includes(id)) { ... }

// GOOD: O(1) lookup
const idSet = new Set(['a', 'b', 'c'])
if (idSet.has(id)) { ... }
```

---

## Orbit-Specific Guidelines

### Zustand Store Patterns

```typescript
// Use selectors for granular subscriptions
const fileName = useFileStore((state) => state.activeFile?.name);

// Use getState() for event handlers
const handleSave = () => {
  const { activeFile, saveFile } = useFileStore.getState();
  if (activeFile) saveFile(activeFile.path);
};

// Use immer for complex updates
set(
  produce((state) => {
    state.files[path].content = newContent;
    state.files[path].modified = true;
  })
);
```

### Tauri Command Patterns

```typescript
// Parallel independent commands
const [files, gitStatus] = await Promise.all([
  invoke('list_directory', { path }),
  invoke('get_git_status', { path }),
]);

// Cache expensive operations
const fileContentCache = new Map<string, string>();
async function getFileContent(path: string) {
  if (fileContentCache.has(path)) return fileContentCache.get(path)!;
  const content = await invoke<string>('read_file', { path });
  fileContentCache.set(path, content);
  return content;
}
```

### ReactFlow Canvas Patterns

```tsx
// Memoize node components
const MemoizedNode = memo(function CustomNode({ data }: NodeProps) {
  return <div>{data.label}</div>;
});

// Use nodeTypes at module level
const nodeTypes = {
  custom: MemoizedNode,
}; // Stable reference, never recreated
```

---

## References

- Source: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- React 19 Docs: https://react.dev
- Zustand: https://zustand-demo.pmnd.rs/
