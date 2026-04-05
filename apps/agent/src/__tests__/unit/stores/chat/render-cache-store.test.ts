import {
  getRenderCache,
  removeRenderCache,
  saveRenderCache,
} from '@/stores/chat/render-cache-store';

function buildCache(sessionIndex: number): {
  ranges: { k: number; v: number }[];
  messageCount: number;
  lastMessageId: string | null;
  layoutVersion: number;
} {
  return {
    ranges: [{ k: sessionIndex, v: sessionIndex * 10 }],
    messageCount: sessionIndex,
    lastMessageId: `message-${String(sessionIndex)}`,
    layoutVersion: sessionIndex,
  };
}

describe('render-cache-store', () => {
  afterEach(() => {
    for (let index = 1; index <= 60; index += 1) {
      removeRenderCache(`session-${String(index)}`);
    }
  });

  it('evicts the least-recently-used render cache after the cap is exceeded', () => {
    for (let index = 1; index <= 50; index += 1) {
      saveRenderCache(`session-${String(index)}`, buildCache(index));
    }

    saveRenderCache('session-51', buildCache(51));

    expect(getRenderCache('session-1')).toBeNull();
    expect(getRenderCache('session-2')).not.toBeNull();
    expect(getRenderCache('session-51')).toEqual(buildCache(51));
  });

  it('promotes accessed entries in the LRU order', () => {
    for (let index = 1; index <= 50; index += 1) {
      saveRenderCache(`session-${String(index)}`, buildCache(index));
    }

    expect(getRenderCache('session-1')).not.toBeNull();

    saveRenderCache('session-51', buildCache(51));

    expect(getRenderCache('session-1')).not.toBeNull();
    expect(getRenderCache('session-2')).toBeNull();
  });
});
