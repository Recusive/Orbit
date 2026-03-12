import { act, renderHook, waitFor } from '@testing-library/react';

import { useOcChat } from '@/hooks/chat/use-oc-chat';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';

function resetStores(): void {
  useOcMessageStore.setState({ sessions: {} });
  useOcPermissionStore.setState({ permissions: {}, questions: {} });
  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
  });
}

describe('useOcChat streaming', () => {
  beforeEach(() => {
    resetStores();

    useOcSessionStore.setState({
      sessions: {
        'session-1': {
          id: 'session-1',
          title: 'Streaming session',
          directory: '/workspace',
          slug: 'streaming-session',
          projectID: 'project-1',
          version: '1',
          time: { created: 1, updated: 1 },
        },
      },
      activeSessionId: 'session-1',
      sessionStatuses: {
        'session-1': { type: 'busy' },
      },
    });

    useOcMessageStore.getState().upsertMessage({
      id: 'assistant-1',
      sessionID: 'session-1',
      role: 'assistant',
      parentID: 'user-1',
      modelID: 'claude-sonnet-4-5',
      providerID: 'anthropic',
      mode: 'build',
      agent: 'build',
      path: { cwd: '/workspace', root: '/workspace' },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      time: { created: 2 },
    });
    useOcMessageStore.getState().upsertPart({
      id: 'reason-1',
      sessionID: 'session-1',
      messageID: 'assistant-1',
      type: 'reasoning',
      text: '',
      time: { start: 3 },
    });
    useOcMessageStore.getState().upsertPart({
      id: 'text-1',
      sessionID: 'session-1',
      messageID: 'assistant-1',
      type: 'text',
      text: '',
    });
  });

  it('re-renders when OpenCode reasoning and text deltas arrive', async () => {
    const { result } = renderHook(() => useOcChat());

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      useOcMessageStore
        .getState()
        .appendDelta('session-1', 'assistant-1', 'reason-1', 'text', 'Thinking');
      useOcMessageStore
        .getState()
        .appendDelta('session-1', 'assistant-1', 'text-1', 'text', 'Hello');
    });

    await waitFor(() => {
      const message = result.current.messages[0];
      const reasoning = message?.parts.find((part) => part.id === 'reason-1');
      const text = message?.parts.find((part) => part.id === 'text-1');

      expect(reasoning).toMatchObject({ type: 'reasoning', text: 'Thinking' });
      expect(text).toMatchObject({ type: 'text', text: 'Hello' });
    });
  });
});
