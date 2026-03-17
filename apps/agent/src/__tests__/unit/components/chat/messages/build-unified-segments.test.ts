import type { ThinkingBlock } from '@/components/chat/messages/types';
import type { ToolExecution } from '@/stores/agent/tool-store';

import { buildUnifiedSegments } from '@/components/chat/messages/message-utils';

function createTool(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: 'tool-1',
    messageId: 'msg-1',
    toolName: 'bash',
    toolInput: {},
    status: 'success',
    startedAt: 0,
    success: true,
    ...overrides,
  };
}

function createThinkingBlock(overrides: Partial<ThinkingBlock> = {}): ThinkingBlock {
  return {
    content: 'thinking',
    durationMs: 0,
    ...overrides,
  };
}

describe('buildUnifiedSegments', () => {
  it('returns a single content segment when there are no tools or thinking blocks', () => {
    expect(buildUnifiedSegments('Hello world', [], undefined, undefined, undefined)).toEqual([
      { type: 'content', text: 'Hello world', key: 'content-0' },
    ]);
  });

  it('preserves the legacy tool-only segmentation behavior', () => {
    const tools = [
      createTool({ id: 'tool-1', contentOffset: 6 }),
      createTool({ id: 'tool-2', toolName: 'read', contentOffset: 13 }),
    ];

    expect(buildUnifiedSegments('Hello.\nWorld.', tools, undefined, false, false)).toEqual([
      { type: 'content', text: 'Hello.', key: 'content-0' },
      { type: 'tool', tool: tools[0], key: 'tool-1' },
      { type: 'content', text: '\nWorld.', key: 'content-6' },
      { type: 'tool', tool: tools[1], key: 'tool-2' },
    ]);
  });

  it('interleaves text-only multi-phase thinking without tools', () => {
    const thinkingBlocks = [
      createThinkingBlock({ content: 'phase 1', contentOffset: 0, ordinal: 0 }),
      createThinkingBlock({ content: 'phase 2', contentOffset: 6, ordinal: 1 }),
    ];

    const segments = buildUnifiedSegments('Alpha\nBeta', [], thinkingBlocks, false, false);

    expect(segments.map((segment) => segment.type)).toEqual([
      'thinking',
      'content',
      'thinking',
      'content',
    ]);
    expect(segments[1]).toMatchObject({ type: 'content', text: 'Alpha\n' });
    expect(segments[3]).toMatchObject({ type: 'content', text: 'Beta' });
  });

  it('uses ordinals to preserve same-offset ordering across thinking and tools', () => {
    const tools = [createTool({ id: 'tool-1', contentOffset: 0, ordinal: 1 })];
    const thinkingBlocks = [
      createThinkingBlock({ content: 'phase 1', contentOffset: 0, ordinal: 0 }),
    ];

    const segments = buildUnifiedSegments('Done', tools, thinkingBlocks, false, false);

    expect(segments.map((segment) => segment.type)).toEqual(['thinking', 'tool', 'content']);
  });

  it('appends the active streaming thinking block at the end', () => {
    const thinkingBlocks = [
      createThinkingBlock({ content: 'phase 1', contentOffset: 0, ordinal: 0 }),
      createThinkingBlock({ content: 'phase 2' }),
    ];

    const segments = buildUnifiedSegments('Done', [], thinkingBlocks, true, true);

    expect(segments.map((segment) => segment.type)).toEqual(['thinking', 'content', 'thinking']);
    expect(segments[2]).toMatchObject({ type: 'thinking', isStreaming: true });
  });

  it('prepends legacy no-offset thinking blocks when they are not actively streaming', () => {
    const thinkingBlocks = [createThinkingBlock({ content: 'legacy block' })];

    const segments = buildUnifiedSegments('Rendered later', [], thinkingBlocks, false, false);

    expect(segments.map((segment) => segment.type)).toEqual(['thinking', 'content']);
    expect(segments[0]).toMatchObject({ type: 'thinking', isStreaming: false });
  });
});
