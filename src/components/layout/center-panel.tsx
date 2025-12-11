import {
  ArrowRight,
  AtSign,
  Code,
  Eye,
  FileCode,
  FileText,
  Globe,
  Image,
  Lightbulb,
  ListChecks,
  Loader2,
  Maximize2,
  Moon,
  PanelRight,
  Plus,
  SquareTerminal,
  Sun,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import { ResizeHandle } from './resize-handle';

import type { ExtensionMessage, InputMode } from '@/types/protocol';
import type { FC } from 'react';

import { MessageActions } from '@/components/chat/message-actions';
import { ModelSelector } from '@/components/chat/model-selector';
import { PermissionModal } from '@/components/chat/permission-modal';
import { BashToolWidget } from '@/components/chat/tools/bash-tool-widget';
import { EditToolWidget } from '@/components/chat/tools/edit-tool-widget';
import { GlobToolWidget } from '@/components/chat/tools/glob-tool-widget';
import { GrepToolWidget } from '@/components/chat/tools/grep-tool-widget';
import { ReadToolWidget } from '@/components/chat/tools/read-tool-widget';
import { TaskToolWidget } from '@/components/chat/tools/task-tool-widget';
import { TodoToolWidget } from '@/components/chat/tools/todo-tool-widget';
import { WebFetchToolWidget } from '@/components/chat/tools/web-fetch-tool-widget';
import { WebSearchToolWidget } from '@/components/chat/tools/web-search-tool-widget';
import { WriteToolWidget } from '@/components/chat/tools/write-tool-widget';
import { Button } from '@/components/ui/button';
import { useVSCode } from '@/hooks/use-vscode';
import { CONTENT_WIDTH, HEIGHTS, INPUT_SIZES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useToolStore, usePendingPermissions, useInputMode } from '@/stores/tool-store';
import { useUIStore, useWorkspaceName, useActiveConversationTitle } from '@/stores/ui-store';



const INPUT_MODE_LABELS: Record<InputMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;           // Full content received from SDK
  displayedContent: string;  // Content currently displayed (for streaming animation)
  isStreaming?: boolean;
}

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

export const CenterPanel: FC = () => {
  const { toggleReviewPanel, toggleBottomPanel, toggleRightSidebar, reviewPanelOpen, reviewPanelWidth, setWorkspace, setActiveConversation, setConversations, addConversation, updateConversationTitle } = useUIStore();
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();

  // Tool store
  const inputMode = useInputMode();
  const pendingPermissions = usePendingPermissions();
  const { setInputMode, startTool, completeTool, addPermissionRequest, removePermissionRequest, getToolsForMessage } = useToolStore();
  const [inputText, setInputText] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const inputRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Theme toggle effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = (): void => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  // Streaming animation - use interval to reveal content progressively
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessages(prev => {
        // Find any message where displayedContent hasn't caught up to content
        const pendingIdx = prev.findIndex(m => m.displayedContent.length < m.content.length);
        if (pendingIdx === -1) {
          // All messages fully displayed - nothing to animate
          return prev;
        }

        // Reveal 3 characters at a time (slower, more visible)
        const msg = prev[pendingIdx];
        if (!msg) return prev;
        const nextLength = Math.min(msg.displayedContent.length + 3, msg.content.length);
        const newMsg: ChatMessage = { ...msg, displayedContent: msg.content.slice(0, nextLength) };
        const updated = [...prev];
        updated[pendingIdx] = newMsg;
        return updated;
      });
    }, 16); // ~60fps but only 3 chars = ~180 chars/sec

    return () => { clearInterval(intervalId); };
  }, []); // Empty deps - runs continuously

  // VS Code communication
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    switch (message.type) {
      case 'system:init':
        setSessionId(message.session_id);
        if (message.cwd) {
          setWorkspace(message.cwd);
        }
        // Request conversation list after init
        // Note: We can't call postMessage here since it's not defined yet
        // The conversation list request will be made in a useEffect
        break;

      case 'agent:chunk': {
        // Store full content, animation effect will reveal it progressively
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          // If last message is streaming assistant, append to full content
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const newContent = lastMsg.content + message.content;
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: newContent },
            ];
          }
          // Otherwise create new streaming message (displayedContent starts empty)
          return [
            ...prev,
            { id: message.message_id, role: 'assistant', content: message.content, displayedContent: '', isStreaming: true },
          ];
        });
        break;
      }

      case 'agent:complete':
        // Mark streaming as complete - let animation continue to reveal remaining content
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            // Don't force displayedContent - let animation finish naturally
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
        // Add to conversation list
        addConversation({
          sessionId: message.session_id,
          title: message.title,
          updatedAt: Date.now(),
          messageCount: 0,
        });
        // Clear messages for new conversation
        setMessages([]);
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
        // Load full message history
        setMessages(message.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayedContent: m.content, // Already displayed, no animation
        })));
        break;

      case 'conversation:rewound':
        // Update session ID if it changed (would be different with SDK fork)
        if (message.new_session_id !== message.session_id) {
          setSessionId(message.new_session_id);
        }
        // Update messages to the truncated list
        setMessages(message.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayedContent: m.content, // Already displayed, no animation
        })));
        break;

      case 'inputMode:changed':
        setInputMode(message.mode);
        break;

      case 'tool:start': {
        // Use tool_id from SDK (unique per tool execution)
        const toolId = message.tool_id;
        // Get current content length for interleaving, and ensure message exists
        setMessages(prev => {
          let msg = prev.find(m => m.id === message.message_id);
          const contentOffset = msg?.content.length ?? 0;
          startTool(
            toolId,
            message.message_id,
            message.tool_name,
            message.tool_input,
            contentOffset
          );
          // If no message exists yet, create an empty streaming assistant message
          // so tools have something to attach to and render
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
        // Use tool_id from SDK (unique per tool execution)
        const toolId = message.tool_id;
        completeTool(
          toolId,
          message.tool_output,
          message.success
        );
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

      // Handle other message types (no-op for now)
      case 'layout':
      case 'error':
      case 'terminal:output':
      case 'terminal:created':
      case 'terminal:exited':
      case 'file:content':
      case 'file:changed':
      case 'file:written':
      case 'conversation:deleted':
        break;
    }
  }, [setWorkspace, setActiveConversation, setConversations, addConversation, setInputMode, startTool, completeTool, addPermissionRequest]);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.FormEvent<HTMLDivElement>): void => {
    setInputText(e.currentTarget.textContent || '');
  };

  const handleSend = (): void => {
    const text = inputText.trim();
    if (!text || isAgentRunning || !sessionId) return;

    // Update title to first message if this is the first message
    if (messages.length === 0) {
      updateConversationTitle(sessionId, text);
      // Persist title to Orbit
      postMessage({
        type: 'conversation:updateTitle',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title: text,
      });
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text, // User messages show immediately
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsAgentRunning(true);

    // Send to VS Code
    postMessage({
      type: 'message:send',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      content: text,
    });

    // Clear input
    setInputText('');
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }
  };

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
    postMessage({
      type: 'file:open',
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

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cycleInputMode = (): void => {
    const nextMode: InputMode = inputMode === 'default' ? 'plan'
      : inputMode === 'plan' ? 'accept'
      : 'default';

    setInputMode(nextMode);

    // Sync with extension
    if (sessionId) {
      postMessage({
        type: 'inputMode:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode: nextMode,
      });
    }
  };

  const getInputBoxClasses = (): string => {
    const base = 'mx-auto p-1 rounded-lg bg-muted transition-colors';
    switch (inputMode) {
      case 'plan':
        return `${base} border-2 border-dashed border-mode-plan`;
      case 'accept':
        return `${base} border-2 border-dashed border-mode-accept`;
      case 'default':
        return `${base} border border-border focus-within:border-muted-foreground/50`;
    }
  };

  const isInputEmpty = inputText.length === 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Shared Header (spans both Chat and Review) */}
      <header className="flex items-center justify-between px-4 border-b border-border shrink-0" style={{ height: HEIGHTS.headerBar }}>
        {/* Breadcrumb */}
        <div className="flex items-center text-sm min-w-0 flex-1 max-w-[280px]">
          <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
            {workspaceName ?? 'No workspace'}
          </span>
          {activeConversationTitle ? <>
              <span className="mx-2 opacity-30 shrink-0">/</span>
              <span
                className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
                title={activeConversationTitle}
                style={{
                  maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                  WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                  maskSize: '100% 100%',
                  WebkitMaskSize: '100% 100%',
                }}
              >
                {activeConversationTitle}
              </span>
            </> : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="h-7 w-7 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-accent transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <HeaderButton icon={Plus} title="New Chat" />
          <HeaderButton icon={Globe} title="Browser" />
          <HeaderButton icon={SquareTerminal} title="Terminal" onClick={toggleBottomPanel} />
          <HeaderButton icon={Code} title="Code" />
          <HeaderButton icon={Eye} title="Preview" />

          {/* Review Changes Button */}
          <button
            onClick={toggleReviewPanel}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
              reviewPanelOpen
                ? 'bg-accent text-foreground'
                : 'opacity-70 hover:opacity-100 hover:bg-accent'
            )}
          >
            <ListChecks className="h-4 w-4" />
            <span>Review Changes</span>
          </button>

          <HeaderButton icon={PanelRight} title="Right Panel" onClick={toggleRightSidebar} />
        </div>
      </header>

      {/* Content Area (Chat + Review split) */}
      <div className="flex-1 flex min-h-0">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Message Feed */}
          <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarGutter: 'stable both-edges' }}>
            <div className="max-w-3xl mx-auto flex flex-col gap-y-3">
              {messages.length === 0 ? (
                /* Empty state when no messages */
                <div className="flex-1 flex items-center justify-center" style={{ minHeight: INPUT_SIZES.emptyStateMinHeight }}>
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg mb-1">Start a conversation</p>
                    <p className="text-sm">Ask Orbit to help you code</p>
                    {isMockMode ? <p className="text-xs mt-2 opacity-50">(Mock mode - no VS Code connection)</p> : null}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, index) => {
                    const isLastAssistantMessage = msg.role === 'assistant' &&
                      messages.slice(index + 1).every(m => m.role === 'user');
                    const isComplete = !msg.isStreaming && msg.displayedContent.length === msg.content.length;

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'p-3 rounded-lg',
                          msg.role === 'user' && 'bg-muted'
                        )}
                      >
                        {msg.role === 'user' ? (
                          <p className="text-sm whitespace-pre-wrap">{msg.displayedContent}</p>
                        ) : (
                          <>
                            {/* Interleave content and tools based on contentOffset */}
                            {(() => {
                              const tools = getToolsForMessage(msg.id);
                              const content = msg.displayedContent;

                              // Sort tools by contentOffset
                              const sortedTools = [...tools].sort((a, b) =>
                                (a.contentOffset ?? 0) - (b.contentOffset ?? 0)
                              );

                              // Build interleaved segments
                              type Segment = { type: 'content'; text: string; key: string } | { type: 'tool'; tool: typeof tools[0]; key: string };
                              const segments: Segment[] = [];
                              let lastOffset = 0;

                              for (const tool of sortedTools) {
                                const offset = tool.contentOffset ?? 0;
                                // Add content before this tool
                                if (offset > lastOffset) {
                                  const text = content.slice(lastOffset, offset);
                                  if (text.trim()) {
                                    segments.push({ type: 'content', text, key: `content-${String(lastOffset)}` });
                                  }
                                }
                                // Add the tool
                                segments.push({ type: 'tool', tool, key: tool.id });
                                lastOffset = offset;
                              }

                              // Add remaining content after last tool
                              if (lastOffset < content.length) {
                                const text = content.slice(lastOffset);
                                if (text.trim()) {
                                  segments.push({ type: 'content', text, key: `content-${String(lastOffset)}` });
                                }
                              }

                              // If no tools, just render all content
                              if (segments.length === 0 && content.trim()) {
                                segments.push({ type: 'content', text: content, key: 'content-0' });
                              }

                              const getStringInput = (tool: typeof tools[0], key: string, fallback: string): string => {
                                const value = tool.toolInput[key];
                                return typeof value === 'string' ? value : fallback;
                              };

                              // Handle clicks on links in markdown content
                              const handleContentClick = (e: React.MouseEvent<HTMLDivElement>): void => {
                                const target = e.target as HTMLElement;
                                const anchor = target.closest('a');
                                if (anchor?.href) {
                                  e.preventDefault();
                                  handleOpenUrl(anchor.href);
                                }
                              };

                              return segments.map((segment) => {
                                if (segment.type === 'content') {
                                  return (
                                    <div
                                      key={segment.key}
                                      className="text-sm prose prose-sm dark:prose-invert max-w-none [&_a]:focus:outline-none"
                                      onClick={handleContentClick}
                                    >
                                      <Streamdown remarkPlugins={[remarkGfm]} rehypePlugins={[]}>{segment.text}</Streamdown>
                                    </div>
                                  );
                                }

                                const tool = segment.tool;
                                const toolName = tool.toolName.toLowerCase();

                                if (toolName === 'write') {
                                  return (
                                    <WriteToolWidget
                                      key={tool.id}
                                      filePath={getStringInput(tool, 'file_path', 'unknown')}
                                      content={getStringInput(tool, 'content', '')}
                                      isRunning={tool.status === 'running'}
                                      onOpenFile={handleOpenFile}
                                    />
                                  );
                                }
                                if (toolName === 'edit') {
                                  return (
                                    <EditToolWidget
                                      key={tool.id}
                                      filePath={getStringInput(tool, 'file_path', 'unknown')}
                                      oldString={getStringInput(tool, 'old_string', '')}
                                      newString={getStringInput(tool, 'new_string', '')}
                                      isRunning={tool.status === 'running'}
                                      onOpenFile={handleOpenFile}
                                    />
                                  );
                                }
                                if (toolName === 'read') {
                                  return (
                                    <ReadToolWidget
                                      key={tool.id}
                                      filePath={getStringInput(tool, 'file_path', 'unknown')}
                                      isRunning={tool.status === 'running'}
                                      content={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      onOpenFile={handleOpenFile}
                                    />
                                  );
                                }
                                if (toolName === 'bash') {
                                  return (
                                    <BashToolWidget
                                      key={tool.id}
                                      command={getStringInput(tool, 'command', '')}
                                      description={getStringInput(tool, 'description', '')}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                    />
                                  );
                                }
                                if (toolName === 'glob') {
                                  return (
                                    <GlobToolWidget
                                      key={tool.id}
                                      pattern={getStringInput(tool, 'pattern', '*')}
                                      path={getStringInput(tool, 'path', '') || undefined}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                      onOpenFile={handleOpenFile}
                                    />
                                  );
                                }
                                if (toolName === 'grep') {
                                  return (
                                    <GrepToolWidget
                                      key={tool.id}
                                      pattern={getStringInput(tool, 'pattern', '')}
                                      path={getStringInput(tool, 'path', '') || undefined}
                                      outputMode={getStringInput(tool, 'output_mode', '') || undefined}
                                      glob={getStringInput(tool, 'glob', '') || undefined}
                                      fileType={getStringInput(tool, 'type', '') || undefined}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                      onOpenFile={handleOpenFile}
                                    />
                                  );
                                }
                                if (toolName === 'todowrite') {
                                  const todosInput = tool.toolInput['todos'];
                                  return (
                                    <TodoToolWidget
                                      key={tool.id}
                                      todos={Array.isArray(todosInput) ? todosInput : undefined}
                                      isRunning={tool.status === 'running'}
                                    />
                                  );
                                }
                                if (toolName === 'websearch') {
                                  return (
                                    <WebSearchToolWidget
                                      key={tool.id}
                                      query={getStringInput(tool, 'query', '')}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                      onOpenUrl={handleOpenUrl}
                                    />
                                  );
                                }
                                if (toolName === 'webfetch') {
                                  return (
                                    <WebFetchToolWidget
                                      key={tool.id}
                                      url={getStringInput(tool, 'url', '')}
                                      prompt={getStringInput(tool, 'prompt', '')}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                      onOpenUrl={handleOpenUrl}
                                    />
                                  );
                                }
                                if (toolName === 'task') {
                                  return (
                                    <TaskToolWidget
                                      key={tool.id}
                                      description={getStringInput(tool, 'description', '')}
                                      prompt={getStringInput(tool, 'prompt', '')}
                                      subagentType={getStringInput(tool, 'subagent_type', 'general-purpose')}
                                      model={getStringInput(tool, 'model', '') || undefined}
                                      output={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
                                      isRunning={tool.status === 'running'}
                                    />
                                  );
                                }
                                return null;
                              });
                            })()}
                            {isComplete ? (
                              <MessageActions
                                showDisclaimer={isLastAssistantMessage}
                                rewindDisabled={isLastAssistantMessage}
                                onRewind={() => { handleRewind(msg.id); }}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {/* Permission modals */}
              {pendingPermissions.map((request) => (
                <PermissionModal
                  key={request.requestId}
                  request={request}
                  onApprove={handlePermissionApprove}
                  onDeny={handlePermissionDeny}
                  onOpenFile={handleOpenFile}
                />
              ))}
              {/* Progress indicator - shows while agent is running OR text is still animating */}
              {(isAgentRunning || messages.some(m => m.displayedContent.length < m.content.length)) ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating...</span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-4 pt-0 shrink-0">
            <div className={getInputBoxClasses()} style={{ maxWidth: CONTENT_WIDTH.inputBox }}>
              {/* Input Area */}
              <div
                ref={inputRef}
                className="p-2 text-sm outline-none"
                style={{ minHeight: INPUT_SIZES.textareaMinHeight }}
                contentEditable={!isAgentRunning}
                suppressContentEditableWarning
                data-placeholder="Plan, @ for context, / for commands"
                data-empty={isInputEmpty}
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
              />

              {/* Controls Row */}
              <div className="flex w-full items-center justify-between gap-1 px-1 pb-1">
                {/* Left Controls - Mode & Model Pickers */}
                <div className="flex items-center gap-0.5">
                  {/* Mode Picker */}
                  <button
                    onClick={cycleInputMode}
                    className={cn(
                      'h-7 px-2 flex items-center gap-1.5 rounded hover:bg-accent transition-colors',
                      inputMode === 'default' && 'border border-border opacity-70 hover:opacity-100',
                      inputMode === 'plan' && 'text-mode-plan',
                      inputMode === 'accept' && 'text-mode-accept'
                    )}
                  >
                    <span className="text-xs font-medium">{INPUT_MODE_LABELS[inputMode]}</span>
                  </button>
                  {/* Model Picker */}
                  <ModelSelector />
                </div>

                {/* Right Controls - Action Buttons */}
                <div className="flex items-center gap-0.5">
                  <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors" title="Add Context">
                    <AtSign className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setThinkingEnabled(!thinkingEnabled); }}
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors',
                      thinkingEnabled ? 'opacity-100 text-mode-think' : 'opacity-70 hover:opacity-100'
                    )}
                    title="Toggle Thinking"
                  >
                    <Lightbulb className={cn('h-4 w-4', thinkingEnabled && 'fill-mode-think')} />
                  </button>
                  <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors" title="Web Browser">
                    <Globe className="h-4 w-4" />
                  </button>
                  <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors" title="Attach Image">
                    <Image className="h-4 w-4" />
                  </button>
                  {/* Send Button */}
                  <button
                    onClick={handleSend}
                    disabled={isInputEmpty || isAgentRunning}
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-full transition-colors',
                      isInputEmpty || isAgentRunning
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    {isAgentRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Review Panel (split view inside center area - no separate header) */}
        {reviewPanelOpen ? (
          <>
            <ResizeHandle direction="vertical" target="review" />
            <ReviewPanel width={reviewPanelWidth} />
          </>
        ) : null}
      </div>
    </div>
  );
};

interface HeaderButtonProps {
  readonly icon: FC<{ className?: string }>;
  readonly title: string;
  readonly onClick?: () => void;
}

const HeaderButton: FC<HeaderButtonProps> = ({ icon: Icon, title, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-accent transition-colors"
      title={title}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

// Review Panel Component (no header - just tabs and content)
interface ReviewPanelProps {
  readonly width: number;
}

type TabValue = 'files' | 'source';

const ReviewPanel: FC<ReviewPanelProps> = ({ width }) => {
  const [activeTab, setActiveTab] = useState<TabValue>('files');
  const { bottomPanelOpen, bottomPanelHeight, toggleBottomPanel } = useUIStore();

  return (
    <div
      className="h-full flex flex-col bg-background shrink-0"
      style={{ width }}
    >
      {/* Tabs (directly at top - no separate header) */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex gap-1">
          <TabButton
            active={activeTab === 'files'}
            onClick={() => { setActiveTab('files'); }}
          >
            Files Changed
          </TabButton>
          <TabButton
            active={activeTab === 'source'}
            onClick={() => { setActiveTab('source'); }}
          >
            Source Control
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'files' ? <FilesChangedTab /> : <SourceControlTab />}
      </div>

      {/* Terminal Panel (bottom of review panel) */}
      {bottomPanelOpen ? (
        <>
          <ResizeHandle direction="horizontal" target="bottom" />
          <div
            className="bg-card/30 flex flex-col shrink-0"
            style={{ height: bottomPanelHeight }}
          >
          <header
            className="flex items-center justify-between px-2 border-b border-border shrink-0"
            style={{ height: HEIGHTS.panelHeader }}
          >
            <span className="text-xs font-medium">Terminal</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={toggleBottomPanel}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </header>
          <div className="flex-1 p-2 font-mono text-xs text-muted-foreground overflow-auto">
            <div>$ <span className="text-foreground">xterm.js will render here</span></div>
            <span className="typing-cursor mt-1" />
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
};

interface TabButtonProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

const TabButton: FC<TabButtonProps> = ({ active, onClick, children }) => {
  return (
    <button
      onClick={active ? undefined : onClick}
      disabled={active}
      className={cn(
        'px-2 py-1 text-xs font-medium transition-colors rounded select-none',
        active
          ? 'bg-accent text-foreground cursor-default'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
};

const FilesChangedTab: FC = () => {
  const files = [
    { name: 'style.css', folder: 'todo-app', lines: '+492', status: 'added' as const },
    { name: 'index.html', folder: 'todo-app', lines: '+85', status: 'added' as const },
    { name: 'script.js', folder: 'todo-app', lines: '+156', status: 'added' as const },
  ];

  if (files.length === 0) {
    return (
      <div className="min-w-full p-4 text-xs text-muted-foreground">
        No changes yet
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="space-y-1">
        {files.map((file) => (
          <FileChangeItem key={`${file.folder}/${file.name}`} {...file} />
        ))}
      </div>
    </div>
  );
};

interface FileChangeItemProps {
  readonly name: string;
  readonly folder: string;
  readonly lines: string;
  readonly status: 'added' | 'modified' | 'deleted';
}

const FileChangeItem: FC<FileChangeItemProps> = ({ name, folder, lines, status }) => {
  const getStatusClass = (): string => {
    switch (status) {
      case 'added':
        return 'text-success';
      case 'modified':
        return 'text-warning';
      case 'deleted':
        return 'text-destructive';
    }
  };

  const getFileIcon = (fileName: string): React.ReactNode => {
    if (fileName.endsWith('.css')) {
      return <FileText className="h-4 w-4 text-file-css" />;
    }
    if (fileName.endsWith('.html')) {
      return <FileCode className="h-4 w-4 text-file-html" />;
    }
    if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
      return <FileCode className="h-4 w-4 text-file-javascript" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  return (
    <button className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-accent transition-colors text-left border border-border">
      {getFileIcon(name)}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{folder}</div>
      </div>
      <span className={`text-xs font-medium ${getStatusClass()}`}>
        {lines}
      </span>
    </button>
  );
};

const SourceControlTab: FC = () => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Commit Message
        </label>
        <textarea
          className="w-full px-3 py-2 bg-muted border border-border rounded text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ minHeight: INPUT_SIZES.commitMessageMinHeight }}
          placeholder="Enter commit message..."
        />
      </div>
      <div className="flex gap-2">
        <button className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
          Commit
        </button>
        <button className="px-3 py-1.5 text-xs font-medium hover:bg-accent rounded transition-colors">
          Stash
        </button>
      </div>
    </div>
  );
};
