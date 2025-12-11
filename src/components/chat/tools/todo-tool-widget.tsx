import { CheckCircle2, ChevronDown, Circle, ListTodo, Loader2 } from 'lucide-react';
import { useState } from 'react';

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
}

// Parse todos from tool input
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

// Circular progress indicator (pie chart)
function ProgressPie({ percentage }: { readonly percentage: number }): ReactElement {
  // SVG circle parameters
  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`} className="shrink-0">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#525252"
        strokeWidth={strokeWidth}
        opacity={0.4}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#22c55e"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    </svg>
  );
}

// Get status icon
function StatusIcon({ status }: { readonly status: TodoItem['status'] }): ReactElement {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case 'in_progress':
      return <Loader2 className="h-3.5 w-3.5 text-foreground animate-spin shrink-0" />;
    case 'pending':
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

export const TodoToolWidget: FC<TodoToolWidgetProps> = ({
  todos: rawTodos,
  isRunning = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const todos = parseTodos(rawTodos);
  const completedCount = todos.filter(t => t.status === 'completed').length;
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const totalCount = todos.length;

  return (
    <div className="my-2 rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className={cn(
          'w-full flex items-center justify-between bg-muted px-3 py-1.5 hover:bg-accent/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <ListTodo className={cn(
            'h-3.5 w-3.5',
            isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Updating tasks' : 'Task list'}
          </span>
          {!isRunning && totalCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({String(completedCount)}/{String(totalCount)} completed{inProgressCount > 0 ? `, ${String(inProgressCount)} in progress` : ''})
            </span>
          ) : null}
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* Show pie + percentage when collapsed */}
          {!isExpanded && totalCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <ProgressPie percentage={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0} />
              <span className="text-xs text-muted-foreground">
                {Math.round((completedCount / totalCount) * 100)}%
              </span>
            </div>
          ) : null}
          <ChevronDown className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </button>

      {/* Collapsible content */}
      {isExpanded ? (
        <div className="p-3">
          {isRunning && todos.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Updating task list...</span>
            </div>
          ) : todos.length > 0 ? (
            <div className="space-y-1">
              {todos.map((todo, index) => (
                <div
                  key={`${todo.content}-${String(index)}`}
                  className={cn(
                    'flex items-start gap-2 text-xs py-1 px-1 -mx-1 rounded transition-colors',
                    todo.status === 'in_progress' && 'bg-accent/50',
                    todo.status === 'completed' && 'opacity-60'
                  )}
                >
                  <StatusIcon status={todo.status} />
                  <span className={cn(
                    'text-foreground flex-1',
                    todo.status === 'completed' && 'line-through text-muted-foreground'
                  )}>
                    {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              No tasks
            </div>
          )}

          {/* Progress bar */}
          {totalCount > 0 ? (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${String((completedCount / totalCount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {Math.round((completedCount / totalCount) * 100)}%
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
