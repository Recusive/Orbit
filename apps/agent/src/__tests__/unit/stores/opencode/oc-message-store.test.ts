import { useOcMessageStore } from '@/stores/opencode';

function resetStore(): void {
  useOcMessageStore.setState({
    sessions: {},
  });
}

describe('oc-message-store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('orders loaded messages by creation time instead of message id', () => {
    useOcMessageStore.getState().setSessionMessages('session-1', [
      {
        info: {
          id: 'msg-z',
          sessionID: 'session-1',
          role: 'user',
          time: { created: 200 },
          agent: 'build',
          model: { providerID: 'anthropic', modelID: 'claude' },
        },
        parts: [],
      },
      {
        info: {
          id: 'msg-a',
          sessionID: 'session-1',
          role: 'user',
          time: { created: 100 },
          agent: 'build',
          model: { providerID: 'anthropic', modelID: 'claude' },
        },
        parts: [],
      },
    ]);

    expect(useOcMessageStore.getState().sessions['session-1']?.messageOrder).toEqual([
      'msg-a',
      'msg-z',
    ]);
  });

  it('re-sorts message order when streamed messages arrive out of order', () => {
    const store = useOcMessageStore.getState();

    store.upsertMessage({
      id: 'msg-2',
      sessionID: 'session-1',
      role: 'user',
      time: { created: 200 },
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude' },
    });
    store.upsertMessage({
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      time: { created: 100 },
      parentID: 'msg-0',
      modelID: 'claude',
      providerID: 'anthropic',
      mode: 'default',
      agent: 'build',
      path: { cwd: '/workspace', root: '/workspace' },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    });

    expect(useOcMessageStore.getState().sessions['session-1']?.messageOrder).toEqual([
      'msg-1',
      'msg-2',
    ]);
  });

  it('creates a new session reference for streaming part deltas', () => {
    const store = useOcMessageStore.getState();

    store.upsertMessage({
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      time: { created: 100 },
      parentID: 'msg-0',
      modelID: 'claude',
      providerID: 'anthropic',
      mode: 'default',
      agent: 'build',
      path: { cwd: '/workspace', root: '/workspace' },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    });
    store.upsertPart({
      id: 'part-1',
      sessionID: 'session-1',
      messageID: 'msg-1',
      type: 'text',
      text: '',
    });

    const before = useOcMessageStore.getState().sessions['session-1'];

    store.appendDelta('session-1', 'msg-1', 'part-1', 'text', 'hello');

    const after = useOcMessageStore.getState().sessions['session-1'];

    expect(after).not.toBe(before);
    expect(after?.partsById['part-1']).toMatchObject({ text: 'hello' });
  });
});
