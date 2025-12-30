import { useEffect } from 'react';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { ReactElementContext, WebviewMessage } from '@/types/protocol';

import { useQueuedMessageStore, useQueuedMessage } from '@/stores/queued-message-store';
import { useToolStore } from '@/stores/tool-store';

interface UseQueuedMessageOptions {
  isAgentRunning: boolean;
  sessionId: string;
  postMessage: (message: WebviewMessage) => void;
  addMessage: (message: ChatMessage) => void;
  setIsAgentRunning: (running: boolean) => void;
}

interface UseQueuedMessageReturn {
  queuedMessage: ReturnType<typeof useQueuedMessage>;
  queueMessage: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ) => void;
  cancelQueue: () => void;
}

export function useQueuedMessageHandler(options: UseQueuedMessageOptions): UseQueuedMessageReturn {
  const { isAgentRunning, sessionId, postMessage, addMessage, setIsAgentRunning } = options;

  const queuedMessage = useQueuedMessage();
  const { queueMessage: storeQueueMessage, clearQueue } = useQueuedMessageStore();

  // Process queued message when agent stops running
  useEffect(() => {
    // Only process if message belongs to current session
    if (!isAgentRunning && queuedMessage && sessionId && queuedMessage.sessionId === sessionId) {
      const { text, contextFiles, images, elements } = queuedMessage;
      clearQueue();

      // Send thinking mode and model settings
      const toolState = useToolStore.getState();
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode: toolState.thinkingMode,
      });
      postMessage({
        type: 'model:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        model: toolState.model,
      });

      // Add user message to chat
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayedContent: text,
        attachedFiles: contextFiles,
        attachedImages: images,
      };
      addMessage(userMessage);
      setIsAgentRunning(true);

      // Build context object
      const hasFiles = contextFiles && contextFiles.length > 0;
      const hasImages = images && images.length > 0;
      const hasElements = elements && elements.length > 0;
      const context =
        hasFiles || hasImages || hasElements
          ? {
              files: hasFiles ? contextFiles : undefined,
              images: hasImages
                ? images.map((img) => ({ name: img.name, mimeType: img.mimeType, data: img.data }))
                : undefined,
              elements: hasElements ? elements : undefined,
            }
          : undefined;

      postMessage({
        type: 'message:send',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        content: text,
        context,
      });
    }
  }, [
    isAgentRunning,
    queuedMessage,
    sessionId,
    postMessage,
    addMessage,
    setIsAgentRunning,
    clearQueue,
  ]);

  const queueMessage = (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ): void => {
    storeQueueMessage({ text, contextFiles, images, elements, sessionId });
  };

  return {
    queuedMessage,
    queueMessage,
    cancelQueue: clearQueue,
  };
}
