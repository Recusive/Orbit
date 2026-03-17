import { useChatStore } from '@/stores/chat/chat-store';

function resetChatStore(): void {
  useChatStore.setState({
    sessions: {},
    activeSessionId: null,
    lastCreatedSessionId: null,
    pendingMessage: null,
    remappedOrbitIds: {},
    rewindEpoch: 0,
    conversationLoadEpoch: 0,
    loadedSessions: {},
    activeCompactions: {},
    lruOrder: [],
  });
}

describe('ChatStore image attachment updates', () => {
  beforeEach(() => {
    resetChatStore();
    useChatStore.getState().getOrCreateSession('session-1');
    useChatStore.getState().addMessage('session-1', {
      id: 'message-1',
      role: 'user',
      content: '',
      displayedContent: '',
      attachedImages: [
        {
          name: 'diagram.png',
          mimeType: 'image/png',
          previewUrl: 'data:image/png;base64,abc',
        },
        {
          name: 'notes.png',
          mimeType: 'image/png',
          previewUrl: 'data:image/png;base64,def',
        },
      ],
    });
  });

  afterEach(() => {
    resetChatStore();
  });

  it('patches a matching image preview url in-place', () => {
    useChatStore
      .getState()
      .patchImagePreviewUrl(
        'session-1',
        'message-1',
        'data:image/png;base64,abc',
        'asset://diagram.png'
      );

    expect(useChatStore.getState().sessions['session-1']?.messages[0]?.attachedImages).toEqual([
      {
        name: 'diagram.png',
        mimeType: 'image/png',
        previewUrl: 'asset://diagram.png',
      },
      {
        name: 'notes.png',
        mimeType: 'image/png',
        previewUrl: 'data:image/png;base64,def',
      },
    ]);
  });

  it('removes a matching image and clears the field when none remain', () => {
    useChatStore
      .getState()
      .removeImageFromMessage('session-1', 'message-1', 'data:image/png;base64,abc');
    useChatStore
      .getState()
      .removeImageFromMessage('session-1', 'message-1', 'data:image/png;base64,def');

    expect(useChatStore.getState().sessions['session-1']?.messages[0]?.attachedImages).toBe(
      undefined
    );
  });
});
