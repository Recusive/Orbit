import { describe, expect, it } from 'bun:test';

import { TextEventBatcher } from '../common/batching/text-event-batcher.js';

describe('TextEventBatcher immediate mode', () => {
  it('emits text immediately when batch interval is non-positive', () => {
    const emitted: string[] = [];
    const batcher = new TextEventBatcher((event) => {
      emitted.push(event.content);
    }, 0);

    batcher.add('session-1', 'message-1', 'Hello ');
    batcher.add('session-1', 'message-1', 'world');

    expect(emitted).toEqual(['Hello ', 'world']);
    expect(batcher.getAccumulatedLength('session-1', 'message-1')).toBe('Hello world'.length);
  });
});
