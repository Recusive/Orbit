import { CheckCircle2, ChevronRight, Circle, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import {
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
} from './shared';

import type { FC, ReactElement } from 'react';

import { cn } from '@/lib/utils';

interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoToolWidgetProps {
  readonly toolId: string;
  readonly todos?: unknown[] | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
}

function parseTodos(todos: unknown): TodoItem[] {
  if (!Array.isArray(todos)) return [];

  const result: TodoItem[] = [];

  for (const item of todos) {
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

export const TodoToolWidget: FC<TodoToolWidgetProps> = ({
  toolId,
  todos: rawTodos,
  isRunning = false,
  success,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const todos = parseTodos(rawTodos);
  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const totalCount = todos.length;

  const statusLabel = isRunning ? 'Updating tasks' : 'Todo';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Collapse Todo output' : 'Expand Todo output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
      >
        {/* Left: tool name + count + spinner + progress */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-base font-medium truncate', 'text-foreground')}>
            {statusLabel}
          </span>

          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

          {!isRunning && !isFailed && totalCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              ({String(completedCount)}/{String(totalCount)}
              {inProgressCount > 0 ? `, ${String(inProgressCount)} active` : ''})
            </span>
          ) : null}

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
          ) : null}

          {!isExpanded && totalCount > 0 ? (
            <div className="flex items-center gap-1">
              <ProgressPie
                percentage={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
              />
              <span className="text-sm text-muted-foreground">
                {Math.round((completedCount / totalCount) * 100)}%
              </span>
            </div>
          ) : null}

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
          >
            {/* Content box */}
            <div className="min-w-0 my-1.5 rounded-xl border border-border-tool bg-tool-output-bg overflow-hidden">
              <div className="px-3 py-2">
                {isRunning && todos.length === 0 ? (
                  <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Updating task list...</span>
                  </div>
                ) : todos.length > 0 ? (
                  <div className="space-y-0.5">
                    {todos.map((todo, index) => (
                      <div
                        key={`${todo.content}-${String(index)}`}
                        className={cn(
                          'flex items-center gap-2 text-sm py-1 px-1.5 -mx-1.5 rounded transition-colors',
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
                ) : (
                  <div className="text-sm text-muted-foreground italic">No tasks</div>
                )}

                {/* Progress bar */}
                {totalCount > 0 ? (
                  <div className="mt-2 pt-2 border-t border-lg-separator">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-lg-control rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success transition-transform duration-300 origin-left rounded-full"
                          style={{
                            transform: `scaleX(${String(completedCount / totalCount)})`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        {Math.round((completedCount / totalCount) * 100)}%
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
