# Flash Prevention Guide

> **Last Updated:** January 2025
> **Author:** Claude (via code review)
> **Applies to:** React + Zustand applications with async data loading

This document explains common causes of UI flash/flicker in React applications and the patterns used to prevent them in the Snowflake codebase.

---

## Table of Contents

1. [What is UI Flash?](#what-is-ui-flash)
2. [Common Causes](#common-causes)
3. [Case Study: Chat Switching Flash](#case-study-chat-switching-flash)
4. [Case Study: Settings Panel Flash](#case-study-settings-panel-flash)
5. [Prevention Patterns](#prevention-patterns)
6. [Best Practices Checklist](#best-practices-checklist)

---

## What is UI Flash?

UI flash (or flicker) occurs when content briefly appears, disappears, or changes during a transition. Users perceive this as:

- **Content flash**: Old content briefly visible before new content
- **Skeleton flash**: Loading skeleton appears for a split second
- **Empty state flash**: Blank screen between content switches
- **Layout shift**: Content jumps or resizes unexpectedly

Flash happens when React renders intermediate states that should be hidden from the user.

---

## Common Causes

### 1. Race Conditions Between State Updates

```typescript
// BAD: Two separate state updates can render intermediate states
setMessages(newMessages); // Render 1: new messages, old loading state
setIsLoading(false); // Render 2: new messages, new loading state

// The user might see Render 1 briefly before Render 2
```

### 2. Async State Updates Not Coordinated

```typescript
// BAD: Loading state changes before content is ready
async function loadData() {
  setIsLoading(true);
  const data = await fetchData();
  setData(data);
  setIsLoading(false); // Content might not be rendered yet!
}
```

### 3. Component Remounting on Navigation

```typescript
// BAD: Switch statement causes remount and re-fetch
function Settings({ section }) {
  switch (section) {
    case 'general': return <GeneralSettings />;
    case 'advanced': return <AdvancedSettings />; // Remounts every time!
  }
}
```

### 4. CSS Transitions on Visibility Changes

```css
/* BAD: Transition on visibility causes flash */
.content {
  transition: all 0.2s ease; /* Includes visibility! */
}
```

### 5. Multiple Sources of Truth

```typescript
// BAD: Two stores controlling the same visibility
const isLoading = useLoadingStore(); // Source 1
const isTransitioning = useUIStore(); // Source 2
// If these change at different times, flash occurs
```

---

## Case Study: Chat Switching Flash

### The Problem

When switching between chat conversations, users saw a brief flash of old content before new messages appeared.

### Root Cause Analysis

The chat area used **two separate loading states**:

```typescript
// ui-store.ts
isLoadingConversation: boolean; // Controls skeleton vs content
isConversationTransitioning: boolean; // Controls visibility: hidden
```

These states were updated at different times:

```
Timeline (BEFORE fix):
─────────────────────────────────────────────────────────────────
Click       → setLoadingConversation(true)     [SYNC]
            → setConversationTransitioning(true) [SYNC]
            → postMessage(conversation:load)   [ASYNC]
─────────────────────────────────────────────────────────────────
Backend     → conversation:loaded received
            → setMessages(newMessages)         [batched]
            → setLoadingConversation(false)    [IMMEDIATE] ← Problem!
─────────────────────────────────────────────────────────────────
Frame N     → React commits new messages
            → OLD content briefly visible (visibility still hidden
              but isLoadingConversation changed the render tree)
─────────────────────────────────────────────────────────────────
Frame N+3   → useLayoutEffect detects stable height
            → setConversationTransitioning(false)
─────────────────────────────────────────────────────────────────
```

### The Fix

**1. Don't update loading state in the message handler:**

```typescript
// use-chat-messages.ts - BEFORE
case 'conversation:loaded': {
  setMessages(newMessages);
  setSessionId(message.session_id);
  setLoadingConversation(false);  // ❌ Removed this!
  break;
}

// AFTER
case 'conversation:loaded': {
  setMessages(newMessages);
  setSessionId(message.session_id);
  // NOTE: Do NOT call setLoadingConversation(false) here!
  // The useLayoutEffect will handle revealing content.
  break;
}
```

**2. Let useLayoutEffect control BOTH states atomically:**

```typescript
// chat-area.tsx
useLayoutEffect(() => {
  if (!isTransitioning) return;

  let stableCount = 0;
  let lastHeight = 0;

  const checkStable = (): void => {
    const currentHeight = container.scrollHeight;
    if (currentHeight === lastHeight) {
      stableCount++;
      if (stableCount >= 3) {
        // Reveal content atomically - both states change together
        setLoadingConversation(false);
        setConversationTransitioning(false);
        return;
      }
    } else {
      stableCount = 0;
      lastHeight = currentHeight;
    }
    requestAnimationFrame(checkStable);
  };

  requestAnimationFrame(checkStable);
}, [isTransitioning, messages.length]);
```

### Key Insight

> **Never update visibility-related state until the DOM has stabilized.**
> Use `useLayoutEffect` with `requestAnimationFrame` to wait for layout completion.

---

## Case Study: Settings Panel Flash

### The Problem

When switching between settings sections (e.g., Agent → Subagents → Agent), users saw a skeleton flash because data was re-fetched on each section switch.

### Root Cause Analysis

The settings dialog used a **switch statement** for content rendering:

```typescript
// BEFORE: Component remounts on every section change
const renderContent = () => {
  switch (activeSection) {
    case 'subagents': return <SubagentsSettings />;  // Remounts!
    case 'commands': return <SlashCommandsSettings />; // Remounts!
  }
};
```

Each remount triggered:

1. Component initialization (`useState` with initial values)
2. Data fetch (`useEffect` with `postMessage`)
3. Skeleton display (`isInitialLoad = true`)
4. Content display (after data arrives)

### The Fix

**1. Keep async components mounted once visited:**

```typescript
// settings-dialog.tsx
const [visitedSubagents, setVisitedSubagents] = useState(false);
const [visitedCommands, setVisitedCommands] = useState(false);

// Mark as visited when navigating to the section
useEffect(() => {
  if (activeSection === 'subagents') setVisitedSubagents(true);
  if (activeSection === 'commands') setVisitedCommands(true);
}, [activeSection]);

// Reset when dialog reopens
useEffect(() => {
  if (open) {
    setVisitedSubagents(defaultSection === 'subagents');
    setVisitedCommands(defaultSection === 'commands');
  }
}, [open, defaultSection]);
```

**2. Use CSS hidden class instead of conditional rendering:**

```tsx
// Async sections - kept mounted once visited
{
  visitedSubagents && (
    <div
      className={cn(
        'absolute inset-0 p-6 overflow-auto',
        activeSection !== 'subagents' && 'hidden' // CSS hide, not unmount
      )}
    >
      <SubagentsSettings />
    </div>
  );
}
```

### Key Insight

> **For components that fetch data, use CSS visibility instead of conditional rendering.**
> This preserves fetched data across navigation.

---

## Prevention Patterns

### Pattern 1: Atomic State Updates

When multiple states control visibility, update them together:

```typescript
// ❌ BAD: Separate updates can cause intermediate renders
setData(newData);
setLoading(false);

// ✅ GOOD: Use a reducer or update in useLayoutEffect
useLayoutEffect(() => {
  if (dataReady) {
    setData(newData);
    setLoading(false); // Same effect, batched by React
  }
}, [dataReady]);
```

### Pattern 2: Layout Stabilization

Wait for the DOM to settle before revealing content:

```typescript
function useLayoutStabilization(onStable: () => void, deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastHeight = 0;
    let stableFrames = 0;
    let frameId: number;

    const check = () => {
      const height = container.scrollHeight;
      if (height === lastHeight) {
        stableFrames++;
        if (stableFrames >= 3) {
          onStable();
          return;
        }
      } else {
        stableFrames = 0;
        lastHeight = height;
      }
      frameId = requestAnimationFrame(check);
    };

    frameId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frameId);
  }, deps);

  return containerRef;
}
```

### Pattern 3: Keep-Mounted Pattern

For tabs/sections with async data:

```typescript
function TabbedContent({ activeTab, children }) {
  const [visitedTabs, setVisitedTabs] = useState(new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs(prev => new Set([...prev, activeTab]));
  }, [activeTab]);

  return (
    <>
      {React.Children.map(children, (child, index) => {
        const tabId = child.props.tabId;
        const isVisited = visitedTabs.has(tabId);
        const isActive = activeTab === tabId;

        if (!isVisited) return null;

        return (
          <div className={isActive ? '' : 'hidden'}>
            {child}
          </div>
        );
      })}
    </>
  );
}
```

### Pattern 4: Skeleton with Minimum Duration

Prevent skeleton flash for fast loads:

```typescript
function useMinimumLoadingDuration(isLoading: boolean, minDuration = 200) {
  const [showSkeleton, setShowSkeleton] = useState(isLoading);
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      loadStartRef.current = Date.now();
      setShowSkeleton(true);
    } else if (loadStartRef.current) {
      const elapsed = Date.now() - loadStartRef.current;
      const remaining = Math.max(0, minDuration - elapsed);

      if (remaining > 0) {
        const timer = setTimeout(() => setShowSkeleton(false), remaining);
        return () => clearTimeout(timer);
      } else {
        setShowSkeleton(false);
      }
    }
  }, [isLoading, minDuration]);

  return showSkeleton;
}
```

### Pattern 5: Callback Cleanup

Clean up callbacks when dialogs close:

```typescript
useEffect(() => {
  if (!isOpen) return;

  const handleResponse = (data) => {
    // Update form state
  };

  registerCallback(handleResponse);

  // Cleanup: Clear callback when dialog closes
  return () => {
    registerCallback(() => {}); // No-op
  };
}, [isOpen]);
```

---

## Best Practices Checklist

### Before Implementing a Feature

- [ ] Identify all states that affect visibility
- [ ] Determine if data is loaded asynchronously
- [ ] Check if component will remount during navigation

### During Implementation

- [ ] Use single source of truth for visibility
- [ ] Update visibility states atomically (same render cycle)
- [ ] Use `useLayoutEffect` for DOM-dependent visibility logic
- [ ] Consider keep-mounted pattern for async data components
- [ ] Add cleanup for callbacks in dialogs/modals

### Code Review Checklist

- [ ] No `setLoading(false)` immediately after `setData()`
- [ ] No switch statement for components with async data
- [ ] Visibility states updated together, not separately
- [ ] `useLayoutEffect` (not `useEffect`) for visibility logic
- [ ] CSS `hidden` class used instead of conditional render for data components

### Testing

- [ ] Test with slow network (throttle to 3G)
- [ ] Test with fast network (should not flash skeleton)
- [ ] Test rapid navigation (click multiple items quickly)
- [ ] Test on slower devices (CPU throttle in DevTools)

---

## Quick Reference

| Problem                      | Pattern              | Key Technique                           |
| ---------------------------- | -------------------- | --------------------------------------- |
| State race condition         | Atomic Updates       | Update states in same `useLayoutEffect` |
| Content flash on switch      | Layout Stabilization | Wait for 3 stable frames                |
| Skeleton flash on tab switch | Keep-Mounted         | Use CSS `hidden` not conditional render |
| Fast load skeleton flash     | Minimum Duration     | Delay hiding skeleton by 200ms          |
| Stale callbacks              | Cleanup              | Return no-op in useEffect cleanup       |

---

## Case Study: Welcome Page → Chat Transition Flash

### The Problem

When opening a project from the welcome page, users saw flash and layout shifts as the chat interface loaded.

### Root Cause Analysis

The transition from `WelcomePage` to `ChatArea` happened **without transition protection**:

```
Timeline (BEFORE fix):
─────────────────────────────────────────────────────────────────
Click "Open project" → setWorkspace(path)     [SYNC]
                     → hasWorkspace = true    [triggers re-render]
─────────────────────────────────────────────────────────────────
React unmounts       → <WelcomePage /> removed
React mounts         → <ChatArea /> mounts
                     → isTransitioning = false (no protection!)
                     → Content renders immediately
                     → Panels calculate sizes (flash!)
─────────────────────────────────────────────────────────────────
```

Unlike conversation switching (which sets `isTransitioning = true` before loading), the welcome → chat transition had no protection.

### The Fix

**Set transition states in `setWorkspace()` before the workspace change takes effect:**

```typescript
// ui-store.ts
setWorkspace: (path: string): void => {
  set((state) => {
    // Enable transition mode BEFORE workspace change takes effect
    // This ensures ChatArea mounts with visibility: hidden
    state.isLoadingConversation = true;
    state.isConversationTransitioning = true;

    state.workspacePath = path;
    const segments = path.split(/[/\\]/).filter(Boolean);
    state.workspaceName = segments[segments.length - 1] ?? path;
  });
},
```

Now the flow is:

```
Timeline (AFTER fix):
─────────────────────────────────────────────────────────────────
Click "Open project" → setWorkspace(path) atomically:
                       - isLoadingConversation = true
                       - isConversationTransitioning = true
                       - workspacePath = path
─────────────────────────────────────────────────────────────────
React unmounts       → <WelcomePage /> removed
React mounts         → <ChatArea /> mounts
                     → isTransitioning = true (protected!)
                     → style={{ visibility: 'hidden' }}
─────────────────────────────────────────────────────────────────
useLayoutEffect      → Waits for 3 stable frames
                     → Sets both states to false atomically
                     → Content revealed smoothly
─────────────────────────────────────────────────────────────────
```

### Key Insight

> **Pre-enable transition protection for component mount transitions, not just data loading.**
> When a conditional render will show new complex content, set transition states BEFORE the condition changes.

---

## Files in Snowflake Using These Patterns

| File                                                     | Patterns Used                        |
| -------------------------------------------------------- | ------------------------------------ |
| `components/layout/chat-area.tsx`                        | Atomic Updates, Layout Stabilization |
| `hooks/chat/use-chat-messages.ts`                        | Deferred State Update                |
| `stores/ui/ui-store.ts`                                  | Pre-enabled Transition Protection    |
| `components/modals/settings/settings-dialog.tsx`         | Keep-Mounted, Lazy Mount             |
| `components/modals/settings/subagents-settings.tsx`      | Callback Cleanup                     |
| `components/modals/settings/slash-commands-settings.tsx` | Callback Cleanup                     |

---

## Further Reading

- [React 18 Automatic Batching](https://react.dev/blog/2022/03/29/react-v18#new-feature-automatic-batching)
- [useLayoutEffect vs useEffect](https://react.dev/reference/react/useLayoutEffect)
- [Avoiding Flash of Loading State](https://www.joshwcomeau.com/react/preloading-views/)
