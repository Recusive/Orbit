import { CheckCircle2, ChevronDown, Circle, ListTodo, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC, ReactElement } from 'react';

import { cn } from '@/lib/utils';

interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoToolWidgetProps {
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
        className="text-muted-foreground/30"
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
      return <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />;
    case 'pending':
    default:
      return <Circle className="h-3 w-3 text-muted-foreground/70 shrink-0" />;
  }
}

export const TodoToolWidget: FC<TodoToolWidgetProps> = ({
  todos: rawTodos,
  isRunning = false,
  success,
}) => {
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const wasRunningRef = useRef(isRunning);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const todos = parseTodos(rawTodos);
  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const totalCount = todos.length;

  const allCompleted = totalCount > 0 && completedCount === totalCount;

  const statusLabel = isRunning ? 'Updating tasks' : 'Todo';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Todo output' : 'Expand Todo output'}
        aria-expanded={isExpanded}
        className={cn(
          'group/status flex items-center gap-2 py-1.5 px-2.5 text-sm',
          'transition-colors duration-150 cursor-pointer w-full text-left',
          'rounded-lg hover:bg-muted/40',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center shrink-0',
            'transition-colors duration-150',
            isFailed
              ? 'bg-destructive/8 group-hover/status:bg-destructive/12'
              : 'bg-primary/15 group-hover/status:bg-primary/25'
          )}
        >
          <ListTodo
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-primary/80 group-hover/status:text-primary',
              isRunning && 'animate-pulse'
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={cn(
              'text-xs font-medium truncate',
              isFailed
                ? 'text-muted-foreground line-through'
                : 'text-muted-foreground/90 group-hover/status:text-foreground'
            )}
          >
            {statusLabel}
          </span>
          {!isRunning && !isFailed && totalCount > 0 ? (
            <span className="text-xs text-muted-foreground/70">
              ({String(completedCount)}/{String(totalCount)}
              {inProgressCount > 0 ? `, ${String(inProgressCount)} active` : ''})
            </span>
          ) : null}
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isExpanded && totalCount > 0 ? (
            <div className="flex items-center gap-1">
              <ProgressPie
                percentage={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
              />
              <span className="text-xs text-muted-foreground/70">
                {Math.round((completedCount / totalCount) * 100)}%
              </span>
            </div>
          ) : null}
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/70 transition-transform duration-200 ease-out shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col">
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-primary/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: isFailed
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-primary) 40%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)'
                              : allCompleted
                                ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-primary) 40%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                                : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-primary) 40%, transparent) 70%, color-mix(in oklch, #eab308 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card overflow-hidden">
                  <div className="px-3 py-2">
                    {isRunning && todos.length === 0 ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
                              todo.status === 'in_progress' && 'bg-primary/5',
                              todo.status === 'completed' && 'opacity-50'
                            )}
                          >
                            <StatusIcon status={todo.status} />
                            <span
                              className={cn(
                                'text-foreground flex-1 leading-relaxed',
                                todo.status === 'completed' && 'line-through text-muted-foreground'
                              )}
                            >
                              {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground/40 italic">No tasks</div>
                    )}

                    {/* Progress bar */}
                    {totalCount > 0 ? (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success transition-transform duration-300 origin-left rounded-full"
                              style={{
                                transform: `scaleX(${String(completedCount / totalCount)})`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground/70 font-medium">
                            {Math.round((completedCount / totalCount) * 100)}%
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {isFailed ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-red-500/15">
                    <XCircle className="h-3 w-3 text-red-500/80" />
                  </div>
                  <span className="ml-2.5 text-xs text-muted-foreground/90">Failed</span>
                </div>
              ) : allCompleted && !isRunning ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-green-500/15">
                    <CheckCircle2 className="h-3 w-3 text-green-500/80" />
                  </div>
                  <span className="ml-2.5 text-xs text-muted-foreground/90">Completed</span>
                </div>
              ) : (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-yellow-500/15">
                    <Circle className="h-3 w-3 text-yellow-500/80" />
                  </div>
                  <span className="ml-2.5 text-xs text-muted-foreground/90">Running</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
