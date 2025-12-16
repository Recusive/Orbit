import { useCallback, useEffect, useRef, useState } from 'react';

import type { ImageAttachment } from '@/components/chat/chat-input';
import type { ChatMessage } from '@/components/chat/message-item';
import type { ExtensionMessage, Model, ReactElementContext, ThinkingMode } from '@/types/protocol';

import { useVSCode } from '@/hooks/use-vscode';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/diff-utils';
import { useFileStore } from '@/stores/file-store';
import { useFileViewerStore } from '@/stores/file-viewer-store';
import { useToolStore } from '@/stores/tool-store';
import { useUIStore } from '@/stores/ui-store';

interface UseChatMessagesOptions {
  onSessionCreated?: (sessionId: string, title: string) => void;
}

interface UseChatMessagesReturn {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  sessionId: string;
  isMockMode: boolean;
  postMessage: ReturnType<typeof useVSCode>['postMessage'];
  handleSend: (text: string, contextFiles?: string[], images?: ImageAttachment[], elements?: ReactElementContext[]) => void;
  handleRewind: (messageId: string) => void;
  handlePermissionApprove: (requestId: string, always?: boolean) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
  handleModeChange: (mode: 'default' | 'plan' | 'accept') => void;
  handleThinkingModeChange: (mode: ThinkingMode) => void;
  handleModelChange: (model: Model) => void;
}

export function useChatMessages(options: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const { onSessionCreated } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [pendingMessage, setPendingMessage] = useState<{ text: string; contextFiles?: string[] | undefined; images?: ImageAttachment[] | undefined; elements?: ReactElementContext[] | undefined } | null>(null);

  // Track thinking start times by message ID to calculate duration
  const thinkingStartTimes = useRef<Map<string, number>>(new Map());

  const { setWorkspace, setActiveConversation, setConversations, addConversation, updateConversationTitle, conversations } = useUIStore();
  const { setInputMode, setThinkingMode, setModel, startTool, completeTool, addPermissionRequest, removePermissionRequest, addUsage } = useToolStore();

  // Streaming animation - use interval to reveal content progressively
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessages(prev => {
        const pendingIdx = prev.findIndex(m => m.displayedContent.length < m.content.length);
        if (pendingIdx === -1) return prev;

        const msg = prev[pendingIdx];
        if (!msg) return prev;
        const nextLength = Math.min(msg.displayedContent.length + 3, msg.content.length);
        const newMsg: ChatMessage = { ...msg, displayedContent: msg.content.slice(0, nextLength) };
        const updated = [...prev];
        updated[pendingIdx] = newMsg;
        return updated;
      });
    }, 16);

    return () => { clearInterval(intervalId); };
  }, []);

  // Handle messages from extension
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    switch (message.type) {
      case 'system:init':
        setSessionId(message.session_id);
        if (message.cwd) {
          setWorkspace(message.cwd);
        }
        break;

      case 'agent:chunk': {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const newContent = lastMsg.content + message.content;
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: newContent },
            ];
          }
          return [
            ...prev,
            { id: message.message_id, role: 'assistant', content: message.content, displayedContent: '', isStreaming: true },
          ];
        });
        break;
      }

      case 'agent:thinking': {
        // Record thinking start time on first chunk
        if (!thinkingStartTimes.current.has(message.message_id)) {
          thinkingStartTimes.current.set(message.message_id, Date.now());
        }

        // Calculate current duration
        const startTime = thinkingStartTimes.current.get(message.message_id) ?? Date.now();
        const currentDuration = Date.now() - startTime;

        // Update the current streaming message with thinking content (append, not replace)
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant') {
            // Append thinking content like we do for regular content
            const newThinking = (lastMsg.thinking ?? '') + message.thinking;
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                thinking: newThinking,
                thinkingDurationMs: currentDuration,
              },
            ];
          }
          // If no assistant message exists yet, create one with just thinking
          return [
            ...prev,
            {
              id: message.message_id,
              role: 'assistant',
              content: '',
              displayedContent: '',
              isStreaming: true,
              thinking: message.thinking,
              thinkingDurationMs: currentDuration,
            },
          ];
        });
        break;
      }

      case 'agent:complete': {
        // Calculate final thinking duration if we were tracking it
        const thinkingStart = thinkingStartTimes.current.get(message.message_id);
        const finalThinkingDuration = thinkingStart !== undefined ? Date.now() - thinkingStart : undefined;

        // Clean up the tracking
        thinkingStartTimes.current.delete(message.message_id);

        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            return [...prev.slice(0, -1), {
              ...lastMsg,
              isStreaming: false,
              // Update final thinking duration if we have one
              ...(finalThinkingDuration !== undefined && lastMsg.thinking ? { thinkingDurationMs: finalThinkingDuration } : {}),
            }];
          }
          return prev;
        });
        // Track usage data from SDK (deduplicates by message_id)
        if (message.usage) {
          addUsage(message.message_id, message.usage, message.total_cost_usd);
        }
        setIsAgentRunning(false);
        break;
      }

      case 'agent:error': {
        setIsAgentRunning(false);
        const errorContent = `Error: ${message.error}`;
        setMessages((prev) => [
          ...prev,
          { id: message.message_id, role: 'assistant', content: errorContent, displayedContent: errorContent },
        ]);
        break;
      }

      case 'conversation:created':
        setSessionId(message.session_id);
        setActiveConversation(message.session_id, message.title);
        addConversation({
          sessionId: message.session_id,
          title: message.title,
          updatedAt: Date.now(),
          messageCount: 0,
        });
        setMessages([]);
        onSessionCreated?.(message.session_id, message.title);
        break;

      case 'conversation:list':
        setConversations(message.conversations.map(c => ({
          sessionId: c.session_id,
          title: c.title,
          updatedAt: c.updated_at,
          messageCount: c.message_count,
        })));
        break;

      case 'conversation:loaded':
        setSessionId(message.session_id);
        setActiveConversation(message.session_id, message.title);
        setMessages(message.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayedContent: m.content,
        })));
        break;

      case 'conversation:rewound':
        if (message.new_session_id !== message.session_id) {
          setSessionId(message.new_session_id);
        }
        setMessages(message.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayedContent: m.content,
        })));
        break;

      case 'inputMode:changed':
        setInputMode(message.mode);
        break;

      case 'model:changed':
        setModel(message.model);
        break;

      case 'tool:start': {
        const toolId = message.tool_id;
        setMessages(prev => {
          const msg = prev.find(m => m.id === message.message_id);
          const contentOffset = msg?.content.length ?? 0;
          startTool(toolId, message.message_id, message.tool_name, message.tool_input, contentOffset);
          if (!msg) {
            return [
              ...prev,
              { id: message.message_id, role: 'assistant' as const, content: '', displayedContent: '', isStreaming: true },
            ];
          }
          return prev;
        });
        break;
      }

      case 'tool:end': {
        const toolId = message.tool_id;

        // Get tool data BEFORE completing (still in activeTools)
        const toolState = useToolStore.getState();
        const tool = toolState.activeTools[toolId];

        // Track file changes for Edit/Write tools
        if (tool && message.success) {
          const toolName = tool.toolName.toLowerCase();
          const { addFileChange } = useFileStore.getState();

          if (toolName === 'edit') {
            const filePath = tool.toolInput['file_path'] as string;
            const rawOld = tool.toolInput['old_string'];
            const rawNew = tool.toolInput['new_string'];
            const oldString = typeof rawOld === 'string' ? rawOld : '';
            const newString = typeof rawNew === 'string' ? rawNew : '';
            addFileChange({
              path: filePath,
              type: 'modified',
              oldContent: oldString,
              newContent: newString,
              diff: computeSimpleDiff(oldString, newString),
              language: getLanguageFromPath(filePath),
            });
          }
          if (toolName === 'write') {
            const filePath = tool.toolInput['file_path'] as string;
            const rawContent = tool.toolInput['content'];
            const content = typeof rawContent === 'string' ? rawContent : '';
            addFileChange({
              path: filePath,
              type: 'created',
              oldContent: '',
              newContent: content,
              diff: computeSimpleDiff('', content),
              language: getLanguageFromPath(filePath),
            });
          }
        }

        // Complete the tool (moves to completedTools)
        completeTool(toolId, message.tool_output, message.success);
        break;
      }

      case 'permission:request':
        addPermissionRequest({
          requestId: message.request_id,
          sessionId: message.session_id,
          toolName: message.tool_name,
          toolInput: message.tool_input,
          createdAt: Date.now(),
        });
        break;

      case 'file:content': {
        const ext = message.path.split('.').pop()?.toLowerCase() ?? '';
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
          css: 'css', scss: 'scss', less: 'less', html: 'html',
          json: 'json', md: 'markdown', py: 'python', rs: 'rust',
          go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
          sh: 'bash', yml: 'yaml', yaml: 'yaml', xml: 'xml',
        };
        const language = langMap[ext] ?? 'text';
        const fileViewerStore = useFileViewerStore.getState();
        fileViewerStore.setFileContent(message.path, message.content, language);
        break;
      }

      // Handle other message types (no-op for this hook)
      case 'layout':
      case 'error':
      case 'terminal:output':
      case 'terminal:data':
      case 'terminal:created':
      case 'terminal:exited':
      case 'terminal:cwd':
      case 'terminal:command:start':
      case 'terminal:command:end':
      case 'terminal:capabilities':
      case 'file:changed':
      case 'file:written':
      case 'conversation:deleted':
      case 'panel:command':
      case 'panel:visible':
      case 'file:tree:response':
      case 'file:tree:error':
      case 'file:list:response':
      case 'thinking:changed':
      case 'browser:created':
      case 'browser:navigated':
      case 'browser:element-selected':
      case 'browser:loading':
      case 'browser:error':
      case 'browser:destroyed':
        break;
    }
  }, [setWorkspace, setActiveConversation, setConversations, addConversation, setInputMode, setModel, startTool, completeTool, addPermissionRequest, addUsage, onSessionCreated]);

  const { postMessage, isMockMode } = useVSCode({ onMessage: handleMessage });

  // Request conversation list when session is ready
  useEffect(() => {
    if (sessionId) {
      postMessage({
        type: 'conversation:list',
        uuid: crypto.randomUUID(),
      });
    }
  }, [sessionId, postMessage]);

  // Request file list for @ mentions
  useEffect(() => {
    postMessage({
      type: 'file:list:request',
      uuid: crypto.randomUUID(),
    });
  }, [postMessage]);

  // Send pending message when session becomes available
  useEffect(() => {
    if (sessionId && pendingMessage) {
      const { text, contextFiles, images, elements } = pendingMessage;
      setPendingMessage(null);

      // Send current thinking mode and model to backend BEFORE the message
      // This ensures the session is created with the correct settings
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

      updateConversationTitle(sessionId, text);
      postMessage({
        type: 'conversation:updateTitle',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title: text,
      });

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayedContent: text,
        attachedFiles: contextFiles,
        attachedImages: images,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsAgentRunning(true);

      // Build context object with files, images, and/or elements
      const hasFiles = contextFiles && contextFiles.length > 0;
      const hasImages = images && images.length > 0;
      const hasElements = elements && elements.length > 0;
      const context = hasFiles || hasImages || hasElements
        ? {
            files: hasFiles ? contextFiles : undefined,
            images: hasImages ? images.map(img => ({ name: img.name, mimeType: img.mimeType, data: img.data })) : undefined,
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
  }, [sessionId, pendingMessage, postMessage, updateConversationTitle]);

  const handleSend = useCallback((text: string, contextFiles?: string[], images?: ImageAttachment[], elements?: ReactElementContext[]): void => {
    if (!text || isAgentRunning) return;

    // Check if conversation already exists in sidebar
    const conversationExists = sessionId !== '' && conversations.some(c => c.sessionId === sessionId);

    // If no sessionId OR (first message AND conversation doesn't exist in sidebar),
    // we need to create a conversation first via the backend
    if (!sessionId || (messages.length === 0 && !conversationExists)) {
      // Store text, context files, images, and elements for pending message
      setPendingMessage({ text, contextFiles, images, elements });
      // Clear sessionId so the conversation:created handler will set the new one
      if (sessionId) {
        setSessionId('');
      }
      postMessage({
        type: 'conversation:create',
        uuid: crypto.randomUUID(),
        title: text,
      });
      return;
    }

    // If first message but conversation exists (created via "New conversation" button),
    // update the title from "Untitled" to the message text
    if (messages.length === 0 && conversationExists) {
      updateConversationTitle(sessionId, text);
      postMessage({
        type: 'conversation:updateTitle',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title: text,
      });
    }

    // Always send current thinking mode and model BEFORE message:send
    // This ensures the session uses the correct settings
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

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text,
      attachedFiles: contextFiles,
      attachedImages: images,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsAgentRunning(true);

    // Build context object with files, images, and/or elements
    const hasFiles = contextFiles && contextFiles.length > 0;
    const hasImages = images && images.length > 0;
    const hasElements = elements && elements.length > 0;
    const context = hasFiles || hasImages || hasElements
      ? {
          files: hasFiles ? contextFiles : undefined,
          images: hasImages ? images.map(img => ({ name: img.name, mimeType: img.mimeType, data: img.data })) : undefined,
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
  }, [sessionId, isAgentRunning, messages.length, conversations, postMessage, updateConversationTitle]);

  const handleRewind = useCallback((messageId: string): void => {
    if (!sessionId || isAgentRunning) return;

    postMessage({
      type: 'conversation:rewind',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      message_id: messageId,
    });
  }, [sessionId, isAgentRunning, postMessage]);

  const handlePermissionApprove = useCallback((requestId: string, always?: boolean): void => {
    if (!sessionId) return;

    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'approve',
      always,
    });
    removePermissionRequest(requestId);
  }, [sessionId, postMessage, removePermissionRequest]);

  const handlePermissionDeny = useCallback((requestId: string): void => {
    if (!sessionId) return;

    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'deny',
    });
    removePermissionRequest(requestId);
  }, [sessionId, postMessage, removePermissionRequest]);

  const handleOpenFile = useCallback((path: string): void => {
    const fileViewerStore = useFileViewerStore.getState();
    fileViewerStore.openFile(path);

    const uiState = useUIStore.getState();
    if (!uiState.reviewPanelOpen) {
      uiState.toggleReviewPanel();
    }

    postMessage({
      type: 'file:read',
      uuid: crypto.randomUUID(),
      path,
    });
  }, [postMessage]);

  const handleOpenUrl = useCallback((url: string): void => {
    postMessage({
      type: 'url:open',
      uuid: crypto.randomUUID(),
      url,
    });
  }, [postMessage]);

  const handleModeChange = useCallback((mode: 'default' | 'plan' | 'accept'): void => {
    setInputMode(mode);
    if (sessionId) {
      postMessage({
        type: 'inputMode:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode,
      });
    }
  }, [sessionId, setInputMode, postMessage]);

  const handleThinkingModeChange = useCallback((mode: ThinkingMode): void => {
    setThinkingMode(mode);
    if (sessionId) {
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode,
      });
    }
  }, [sessionId, setThinkingMode, postMessage]);

  const handleModelChange = useCallback((model: Model): void => {
    setModel(model);
    if (sessionId) {
      postMessage({
        type: 'model:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        model,
      });
    }
  }, [sessionId, setModel, postMessage]);

  return {
    messages,
    isAgentRunning,
    sessionId,
    isMockMode,
    postMessage,
    handleSend,
    handleRewind,
    handlePermissionApprove,
    handlePermissionDeny,
    handleOpenFile,
    handleOpenUrl,
    handleModeChange,
    handleThinkingModeChange,
    handleModelChange,
  };
}
