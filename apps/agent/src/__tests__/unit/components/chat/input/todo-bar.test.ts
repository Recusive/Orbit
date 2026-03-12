import type { ToolExecution } from '@/stores/agent/tool-store';

import { resolveLatestTodoExecution } from '@/components/chat/input/todo-bar';

function makeTool(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: 'tool-1',
    messageId: 'msg-1',
    toolName: 'TodoWrite',
    toolInput: {},
    status: 'running',
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('resolveLatestTodoExecution', () => {
  it('returns completed when no active tool exists', () => {
    const completed = makeTool({
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'pending' }] },
    });
    expect(resolveLatestTodoExecution(null, completed)).toBe(completed);
  });

  it('returns null when neither active nor completed exist', () => {
    expect(resolveLatestTodoExecution(null, null)).toBeNull();
  });

  it('returns active when it has a populated todo payload', () => {
    const active = makeTool({
      toolInput: { todos: [{ content: 'A', status: 'pending' }] },
    });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'Old', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(active);
  });

  it('falls back to completed when active has no todos key (empty input)', () => {
    const active = makeTool({ toolInput: {} });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(completed);
  });

  it('does NOT fall back when active has an intentionally empty todos array', () => {
    const active = makeTool({ toolInput: { todos: [] } });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'Stale', status: 'completed' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(active);
  });

  it('returns active when active has no todos key and no completed exists', () => {
    const active = makeTool({ toolInput: {} });
    expect(resolveLatestTodoExecution(active, null)).toBe(active);
  });

  it('falls back to completed when todos key exists but value is undefined', () => {
    const active = makeTool({ toolInput: { todos: undefined } });
    const completed = makeTool({
      id: 'tool-0',
      status: 'success',
      toolInput: { todos: [{ content: 'A', status: 'pending' }] },
    });
    expect(resolveLatestTodoExecution(active, completed)).toBe(completed);
  });
});
