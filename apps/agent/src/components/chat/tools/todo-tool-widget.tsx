import { CheckCircle2, ChevronDown, Circle, ListTodo, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC, ReactElement } from 'react';

import { cn } from '@/lib/utils/utils';

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
      return <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />;
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

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-all duration-200',
          isFailed
            ? 'border-2 border-dashed border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center',
                isFailed ? 'bg-destructive/10' : 'bg-primary/10'
              )}
            >
              <ListTodo
                className={cn(
                  'h-3 w-3',
                  isFailed ? 'text-destructive/70' : 'text-primary/70',
                  isRunning && 'animate-pulse'
                )}
              />
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {isRunning ? 'Updating tasks' : isFailed ? 'Task update failed' : 'Task list'}
            </span>
            {!isRunning && !isFailed && totalCount > 0 ? (
              <span className="text-sm text-muted-foreground/60">
                ({String(completedCount)}/{String(totalCount)}
                {inProgressCount > 0 ? `, ${String(inProgressCount)} active` : ''})
              </span>
            ) : null}
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!isExpanded && totalCount > 0 ? (
              <div className="flex items-center gap-1">
                <ProgressPie
                  percentage={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
                />
                <span className="text-xs text-muted-foreground/60">
                  {Math.round((completedCount / totalCount) * 100)}%
                </span>
              </div>
            ) : null}
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="p-2.5">
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
                <div className="text-sm text-muted-foreground/60 italic">No tasks</div>
              )}

              {/* Progress bar */}
              {totalCount > 0 ? (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success transition-all duration-300 rounded-full"
                        style={{ width: `${String((completedCount / totalCount) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground/60 font-medium">
                      {Math.round((completedCount / totalCount) * 100)}%
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
