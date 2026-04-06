# Mission 08: Priority Scheduler

> User input always wins.

---

## Why This Matters

When a user types while Claude is streaming a response, both activities compete for the same main thread. Today, Orbit treats all work equally -- a syntax highlight pass, a file tree refresh, and a keystroke all enter the same execution queue with no priority differentiation. The result: input latency spikes during heavy operations. The user presses a key and waits 50-100ms for it to appear because the main thread is busy highlighting code or re-measuring a virtualized list.

A priority scheduler ensures that user-initiated actions (typing, clicking, scrolling) always execute before background work (syntax highlighting, sidebar refresh, telemetry). The input field should feel instant even when the rest of the app is under heavy load.

**Note:** This is a Tier 3 mission. Evaluate after Missions #01-#04. If Web Workers + Backpressure + Memoization eliminate visible jank, this scheduler may be unnecessary overhead.

---

## Current State

### All Work Treated Equally

There is no priority system. Every state update, every render, every callback enters the JavaScript event loop in FIFO order. A keystroke queued behind 5 syntax highlight callbacks will wait for all 5 to complete.

### Only Ad-Hoc Scheduling

The codebase has scattered, inconsistent scheduling patterns:

```typescript
// Sidebar refresh uses requestIdleCallback
requestIdleCallback(() => {
  refreshSidebarConversations();
});

// Thinking indicator and tool batching use requestAnimationFrame
requestAnimationFrame(() => {
  updateThinkingState(isThinking);
});

// Everything else is immediate (no scheduling)
set((state) => {
  state.messages[idx].content += chunk; // Immediate, blocks frame
});
```

These ad-hoc patterns don't compose. There's no way to say "this requestIdleCallback should yield to that requestAnimationFrame if the user starts typing."

---

## What To Add

### Priority Queue Scheduler

```typescript
// lib/scheduler/priority-scheduler.ts

type Priority = 'immediate' | 'high' | 'normal' | 'low' | 'idle';

interface ScheduledTask {
  readonly id: string;
  readonly priority: Priority;
  readonly fn: () => void;
  readonly createdAt: number;
  readonly deadline?: number; // For starvation prevention
}

const PRIORITY_ORDER: Record<Priority, number> = {
  immediate: 0, // User input (keystrokes, clicks)
  high: 1, // Active streaming text, scroll-to-bottom
  normal: 2, // Tool output, status updates
  low: 3, // Sidebar refresh, git status poll
  idle: 4, // Telemetry, prefetch, cache warming
};

class PriorityScheduler {
  private queues: Map<Priority, ScheduledTask[]> = new Map([
    ['immediate', []],
    ['high', []],
    ['normal', []],
    ['low', []],
    ['idle', []],
  ]);

  private rafId: number | null = null;
  private readonly frameDeadline = 12; // ms -- leave 4ms for browser work in 16ms frame

  schedule(priority: Priority, fn: () => void, id?: string): string {
    const taskId = id ?? crypto.randomUUID();
    const task: ScheduledTask = {
      id: taskId,
      priority,
      fn,
      createdAt: performance.now(),
      deadline: priority === 'low' ? performance.now() + 5000 : undefined,
    };

    this.queues.get(priority)!.push(task);
    this.ensureFlush();
    return taskId;
  }

  cancel(taskId: string): boolean {
    for (const [, queue] of this.queues) {
      const idx = queue.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  private ensureFlush(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.rafId = null;
    const frameStart = performance.now();

    // Process queues in priority order
    for (const priority of ['immediate', 'high', 'normal', 'low', 'idle'] as Priority[]) {
      const queue = this.queues.get(priority)!;

      while (queue.length > 0) {
        // Check frame budget (immediate tasks always run)
        if (priority !== 'immediate' && performance.now() - frameStart > this.frameDeadline) {
          this.ensureFlush(); // Continue next frame
          return;
        }

        const task = queue.shift()!;
        try {
          task.fn();
        } catch (error) {
          // Task failure is isolated
          console.error(`Scheduler task ${task.id} threw:`, error);
        }
      }
    }
  }
}

// Singleton
export const scheduler = new PriorityScheduler();
```

### Deadline Promotion (Starvation Prevention)

```typescript
// Low-priority tasks get promoted if they've waited too long

private promoteStarved(): void {
  const now = performance.now();

  for (const priority of ['low', 'idle'] as Priority[]) {
    const queue = this.queues.get(priority)!;
    const promoted: ScheduledTask[] = [];

    for (let i = queue.length - 1; i >= 0; i--) {
      const task = queue[i];
      if (task.deadline !== undefined && now > task.deadline) {
        queue.splice(i, 1);
        promoted.push({ ...task, priority: 'normal' });
      }
    }

    for (const task of promoted) {
      this.queues.get('normal')!.push(task);
    }
  }
}
```

### Task Cancellation for Scrolled-Past Items

```typescript
// Cancel work for items no longer visible (e.g., syntax highlight for scrolled-past messages)

interface CancellableTask {
  readonly taskId: string;
  readonly elementId: string;
}

class VisibilityAwareCanceller {
  private pending: Map<string, CancellableTask> = new Map();
  private observer: IntersectionObserver;

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            const task = this.pending.get(entry.target.id);
            if (task) {
              scheduler.cancel(task.taskId);
              this.pending.delete(entry.target.id);
            }
          }
        }
      },
      { rootMargin: '200px' } // Cancel 200px outside viewport
    );
  }

  track(elementId: string, taskId: string): void {
    this.pending.set(elementId, { taskId, elementId });
    const element = document.getElementById(elementId);
    if (element) this.observer.observe(element);
  }
}
```

### Usage Examples

```typescript
// User keystroke -- immediate, never delayed
scheduler.schedule('immediate', () => {
  inputStore.getState().handleKeypress(key);
});

// Streaming token -- high priority, frame-aligned
scheduler.schedule('high', () => {
  chatStore.getState().appendToken(chunk);
});

// Tool output -- normal priority
scheduler.schedule('normal', () => {
  toolStore.getState().appendOutput(toolId, output);
});

// Sidebar refresh -- low priority, 5s deadline
scheduler.schedule('low', () => {
  sidebarStore.getState().refreshConversations();
});

// Telemetry -- idle, runs when nothing else is pending
scheduler.schedule('idle', () => {
  telemetry.flush();
});
```

---

## What We Get

| Metric                         | Before                                 | After                                |
| ------------------------------ | -------------------------------------- | ------------------------------------ |
| Input latency during streaming | 50-100ms (queued behind highlights)    | <8ms (immediate priority)            |
| Low-priority task starvation   | Possible (no deadline)                 | 5s deadline promotion to normal      |
| Work for scrolled-past content | Completes wastefully                   | Cancelled on scroll-out              |
| Frame budget utilization       | Uncontrolled (tasks run to completion) | 12ms cap per frame, overflow to next |
| Scheduling consistency         | Ad-hoc (RAF, rIC, immediate)           | Unified priority queue               |

---

## Estimated Complexity

**Large (3-5 days)**

- Day 1: Core PriorityScheduler class with frame budget
- Day 2: Starvation prevention, task cancellation, visibility observer
- Day 3: Integrate with chat streaming (high), tool output (normal), sidebar (low)
- Day 4: Integrate with input handling (immediate), syntax highlighting (normal)
- Day 5: Stress testing, tuning frame deadline, validating input latency under load

---

## Dependencies

- Mission #01 (Web Workers) should land first -- it moves the heaviest work off the main thread entirely, which may eliminate the need for this scheduler.
- Mission #02 (Streaming Backpressure) should land first -- it reduces the number of tasks entering the queue.
- Mission #04 (Component Memoization) should land first -- it reduces React re-render work.
- **Evaluate after all three.** If jank is resolved, this mission becomes lower priority.

---

## Risks

| Risk                                                                   | Mitigation                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Scheduler adds overhead to every operation                             | Microbenchmark: schedule() should be <0.01ms. If overhead is visible, it's a bug.        |
| Priority inversion (high-priority task depends on low-priority result) | Document that tasks must be independent. If dependency exists, promote the prerequisite. |
| Frame deadline too aggressive (12ms) causes work pileup                | Make deadline configurable. Start with 12ms, tune based on real FPS measurements.        |
| Adoption requires touching many callsites                              | Adopt incrementally: start with streaming + input. Expand to other systems over time.    |
| requestAnimationFrame not available in worker context                  | Scheduler is main-thread only. Workers manage their own execution.                       |
