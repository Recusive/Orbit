import { useEffect } from 'react';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { ReactElementContext, WebviewMessage } from '@/types/protocol';

import {
  buildOptimisticAttachedImages,
  cacheAttachedImagesForMessage,
} from '@/services/chat/image-attachment-cache';
import { syncSessionSettings } from '@/services/chat/session-settings-sync';
import { useToolStore } from '@/stores/agent/tool-store';
import { useQueuedMessageStore, useQueuedMessage } from '@/stores/chat/queued-message-store';

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

      const toolState = useToolStore.getState();
      syncSessionSettings(postMessage, sessionId, {
        model: toolState.model,
        thinkingMode: toolState.thinkingMode,
        effortLevel: toolState.effortLevel,
      });

      const sendableImages = (images ?? []).flatMap((image) =>
        image.data
          ? [
              {
                name: image.name,
                mimeType: image.mimeType,
                data: image.data,
              },
            ]
          : []
      );

      // Add user message to chat
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayedContent: text,
        attachedFiles: contextFiles,
        attachedImages: buildOptimisticAttachedImages(images),
      };
      addMessage(userMessage);
      cacheAttachedImagesForMessage(sessionId, userMessage.id, images);
      setIsAgentRunning(true);

      // Build context object
      const hasFiles = contextFiles && contextFiles.length > 0;
      const hasImages = sendableImages.length > 0;
      const hasElements = elements && elements.length > 0;
      const context =
        hasFiles || hasImages || hasElements
          ? {
              files: hasFiles ? contextFiles : undefined,
              images: hasImages ? sendableImages : undefined,
              elements: hasElements ? elements : undefined,
            }
          : undefined;

      // IMPORTANT: Use userMessage.id so checkpoints are associated correctly with the rewind target
      postMessage({
        type: 'message:send',
        uuid: userMessage.id,
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
