import { useCallback, useEffect, useState } from 'react';

import type { ChatMessage } from '@/components/chat/message-item';
import type { ExtensionMessage } from '@/types/protocol';

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
  handleSend: (text: string) => void;
  handleRewind: (messageId: string) => void;
  handlePermissionApprove: (requestId: string, always?: boolean) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
  handleModeChange: (mode: 'default' | 'plan' | 'accept') => void;
}

export function useChatMessages(options: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const { onSessionCreated } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const { setWorkspace, setActiveConversation, setConversations, addConversation, updateConversationTitle, conversations } = useUIStore();
  const { setInputMode, startTool, completeTool, addPermissionRequest, removePermissionRequest } = useToolStore();

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

      case 'agent:complete':
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false }];
          }
          return prev;
        });
        setIsAgentRunning(false);
        break;

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
      case 'file:tree:response':
      case 'file:tree:error':
      case 'file:list:response':
        break;
    }
  }, [setWorkspace, setActiveConversation, setConversations, addConversation, setInputMode, startTool, completeTool, addPermissionRequest, onSessionCreated]);

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
      const text = pendingMessage;
      setPendingMessage(null);

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
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsAgentRunning(true);

      postMessage({
        type: 'message:send',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        content: text,
      });
    }
  }, [sessionId, pendingMessage, postMessage, updateConversationTitle]);

  const handleSend = useCallback((text: string): void => {
    if (!text || isAgentRunning) return;

    // Check if conversation already exists in sidebar
    const conversationExists = sessionId !== '' && conversations.some(c => c.sessionId === sessionId);

    // If no sessionId OR (first message AND conversation doesn't exist in sidebar),
    // we need to create a conversation first via the backend
    if (!sessionId || (messages.length === 0 && !conversationExists)) {
      setPendingMessage(text);
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

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsAgentRunning(true);

    postMessage({
      type: 'message:send',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      content: text,
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
  };
}
