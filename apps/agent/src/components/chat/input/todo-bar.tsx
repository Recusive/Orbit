/**
 * TodoBar — Persistent task list bar above the chat input.
 *
 * Aggregates todos from the latest TodoWrite tool call in the current session
 * and renders them in a collapsible bar. When collapsed, shows a single summary
 * line (completed/total + active count). When expanded, shows the full task list.
 *
 * This replaces the inline TodoToolWidget in the message stream.
 */
import { CheckCircle2, ChevronDown, ChevronUp, Circle, ListTodo, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { ToolExecution } from '@/stores/agent/tool-store';
import type { FC, ReactElement } from 'react';

import { CHAT_WIDTH, CHAT_WIDTH_VAR, cn } from '@/lib/utils';
import { useToolStore } from '@/stores/agent/tool-store';
import { useActiveBackend } from '@/stores/backend';
import { useActiveSessionId } from '@/stores/chat';
import { useOcActiveSessionId } from '@/stores/opencode';

// ─── Types ───────────────────────────────────────────────────────────

interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ─── Parsing ─────────────────────────────────────────────────────────

function parseTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];

  const result: TodoItem[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;

    const record = item as Record<string, unknown>;
    const content = typeof record['content'] === 'string' ? record['content'] : '';
    const activeForm = typeof record['activeForm'] === 'string' ? record['activeForm'] : '';
    const rawStatus = record['status'];

    let status: TodoItem['status'] = 'pending';
    if (rawStatus === 'pending' || rawStatus === 'in_progress' || rawStatus === 'completed') {
      status = rawStatus;
    }

    if (content.length > 0) {
      result.push({ content, activeForm, status });
    }
  }
  return result;
}

// ─── Sub-components ──────────────────────────────────────────────────

function StatusIcon({ status }: { readonly status: TodoItem['status'] }): ReactElement {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 text-success shrink-0" />;
    case 'in_progress':
      return <Loader2 className="h-3 w-3 text-foreground/60 animate-spin shrink-0" />;
    case 'pending':
    default:
      return <Circle className="h-3 w-3 text-muted-foreground shrink-0" />;
  }
}

function ProgressPie({ percentage }: { readonly percentage: number }): ReactElement {
  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-success"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    </svg>
  );
}

// ─── Expand/collapse transition ──────────────────────────────────────

const EXPAND_TRANSITION = {
  height: { duration: 0.2, ease: [0.165, 0.84, 0.44, 1] as [number, number, number, number] },
  opacity: { duration: 0.15, ease: [0.165, 0.84, 0.44, 1] as [number, number, number, number] },
};

const EXPAND_TRANSITION_NONE = { duration: 0 };

// ─── Main Component ──────────────────────────────────────────────────

export const TodoBar: FC = memo(function TodoBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const activeBackend = useActiveBackend();
  const claudeSessionId = useActiveSessionId();
  const ocSessionId = useOcActiveSessionId();
  const sessionId = activeBackend === 'claude' ? claudeSessionId : ocSessionId;

  // Subscribe to ToolStore — useShallow prevents rerenders from unrelated mutations
  const { activeTools, completedTools } = useToolStore(
    useShallow((state) => ({
      activeTools: state.activeTools,
      completedTools: state.completedTools,
    }))
  );

  // Derive the latest TodoWrite tool and parse its todos.
  //
  // Two sources, two strategies:
  // - activeTools: keyed by ID, use startedAt timestamp (real-time during streaming)
  // - completedTools: ordered array, take LAST match (array order is chronological).
  //   After session restore, startedAt is 0 for all tools — timestamp comparison
  //   would always pick the first tool (initial 0/10 state). Array order is correct.
  // Active tool takes priority over completed (it has the most current state).
  const todoData = useMemo(() => {
    if (sessionId === null) {
      return null;
    }

    const matchesSession = (tool: ToolExecution): boolean => {
      if (activeBackend === 'claude') {
        return tool.sessionId === undefined || tool.sessionId === sessionId;
      }

      return tool.sessionId === sessionId;
    };

    let latestActive: ToolExecution | null = null;
    let latestCompleted: ToolExecution | null = null;

    for (const tool of Object.values(activeTools)) {
      const name = tool.toolName.toLowerCase();
      if ((name === 'todowrite' || name === 'todoread') && matchesSession(tool)) {
        if (latestActive === null || tool.startedAt > latestActive.startedAt) {
          latestActive = tool;
        }
      }
    }

    // Last completed todowrite has the most recent state (array is chronological)
    for (const tool of completedTools) {
      const name = tool.toolName.toLowerCase();
      if ((name === 'todowrite' || name === 'todoread') && matchesSession(tool)) {
        latestCompleted = tool;
      }
    }

    // Prefer active (real-time updates) over completed
    const latest = latestActive ?? latestCompleted;
    if (latest === null) return null;

    const todosInput = latest.toolInput['todos'];
    return {
      todos: parseTodos(todosInput),
      isRunning: latest.status === 'running' || latest.status === 'pending',
    };
  }, [activeBackend, activeTools, completedTools, sessionId]);

  // Don't render when there are no todos
  if (todoData === null || todoData.todos.length === 0) return null;

  const { todos, isRunning } = todoData;
  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const inProgressItem = todos.find((t) => t.status === 'in_progress');
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const totalCount = todos.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex justify-center px-6 shrink-0">
      <div
        className="w-full overflow-hidden rounded-t-xl border border-b-0 border-lg-separator bg-lg-control/80 backdrop-blur-sm"
        style={{
          maxWidth: `calc(var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px) - 16px)`,
        }}
      >
        {/* Summary header — always visible, acts as collapse toggle */}
        <button
          type="button"
          onClick={() => {
            setIsExpanded((prev) => !prev);
          }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse task list' : 'Expand task list'}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors hover:bg-lg-control-hover/50"
        >
          <ListTodo
            className={cn('h-3.5 w-3.5 text-foreground/60 shrink-0', isRunning && 'animate-pulse')}
            aria-hidden="true"
          />

          <span className="text-xs font-medium text-lg-text-secondary">Tasks</span>

          <span className="text-xs text-muted-foreground">
            {String(completedCount)}/{String(totalCount)}
            {inProgressCount > 0 ? ` · ${String(inProgressCount)} active` : ''}
          </span>

          {/* Active task label — shown only when collapsed so user sees what's running */}
          {!isExpanded && inProgressItem !== undefined ? (
            <>
              <span className="text-muted-foreground/40 select-none" aria-hidden="true">
                ·
              </span>
              <Loader2
                className="h-2.5 w-2.5 animate-spin text-foreground/60 shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs text-lg-text-secondary truncate min-w-0">
                {inProgressItem.activeForm}
              </span>
            </>
          ) : null}

          <div className="flex-1" />

          {/* Progress circle + percentage — anchored right, before chevron */}
          <ProgressPie percentage={percentage} />
          <span className="text-xs tabular-nums text-muted-foreground">{String(percentage)}%</span>

          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
        </button>

        {/* Expanded task list */}
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              initial={shouldReduceMotion === true ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={shouldReduceMotion === true ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion === true ? EXPAND_TRANSITION_NONE : EXPAND_TRANSITION}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-lg-separator px-3 py-1.5 max-h-[200px] overflow-y-auto">
                <div className="space-y-0.5">
                  {todos.map((todo, index) => (
                    <div
                      key={`${todo.content}-${String(index)}`}
                      className={cn(
                        'flex items-center gap-2 py-1 px-1.5 -mx-1.5 rounded text-xs',
                        todo.status === 'in_progress' && 'bg-foreground/5',
                        todo.status === 'completed' && 'opacity-50'
                      )}
                    >
                      <StatusIcon status={todo.status} />
                      <span
                        className={cn(
                          'text-foreground flex-1 leading-relaxed',
                          todo.status === 'completed' && 'line-through text-lg-text-secondary'
                        )}
                      >
                        {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="mt-1.5 pt-1.5 border-t border-lg-separator">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-lg-control rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-transform duration-300 origin-left"
                        style={{
                          transform: `scaleX(${String(completedCount / totalCount)})`,
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground font-medium">
                      {String(percentage)}%
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
});
