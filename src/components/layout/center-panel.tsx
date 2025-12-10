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

import { ResizeHandle } from './resize-handle';

import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { ModelSelector } from '@/components/chat/model-selector';
import { Button } from '@/components/ui/button';
import { useVSCode } from '@/hooks/use-vscode';
import { CONTENT_WIDTH, HEIGHTS, INPUT_SIZES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';



type InputMode = 'default' | 'plan' | 'accept';

const INPUT_MODE_LABELS: Record<InputMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

export const CenterPanel: FC = () => {
  const { toggleReviewPanel, toggleBottomPanel, toggleRightSidebar, reviewPanelOpen, reviewPanelWidth } = useUIStore();
  const [inputMode, setInputMode] = useState<InputMode>('default');
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

  // VS Code communication
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    switch (message.type) {
      case 'system:init':
        setSessionId(message.session_id);
        break;

      case 'agent:chunk':
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + message.content },
            ];
          }
          // Create new assistant message
          return [
            ...prev,
            { id: message.message_id, role: 'assistant', content: message.content, isStreaming: true },
          ];
        });
        break;

      case 'agent:complete':
        setIsAgentRunning(false);
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false }];
          }
          return prev;
        });
        break;

      case 'agent:error':
        setIsAgentRunning(false);
        setMessages((prev) => [
          ...prev,
          { id: message.message_id, role: 'assistant', content: `Error: ${message.error}` },
        ]);
        break;

      case 'conversation:created':
        setSessionId(message.session_id);
        break;

      // Handle other message types (no-op for now)
      case 'layout':
      case 'error':
      case 'tool:start':
      case 'tool:end':
      case 'terminal:output':
      case 'terminal:created':
      case 'terminal:exited':
      case 'file:content':
      case 'file:changed':
      case 'file:written':
      case 'conversation:deleted':
      case 'conversation:list':
        break;
    }
  }, []);

  const { postMessage, isMockMode } = useVSCode({ onMessage: handleMessage, debug: true });

  // Request a new conversation on mount
  useEffect(() => {
    if (!sessionId) {
      postMessage({
        type: 'conversation:create',
        uuid: crypto.randomUUID(),
        title: 'New Chat',
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

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
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

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cycleInputMode = (): void => {
    setInputMode((current): InputMode => {
      switch (current) {
        case 'default':
          return 'plan';
        case 'plan':
          return 'accept';
        case 'accept':
          return 'default';
      }
    });
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
        <div className="flex items-center text-sm">
          <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity">
            Docs
          </span>
          <span className="font-light opacity-30 mx-1">/</span>
          <span>Creating a Todo List</span>
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
          <div className="flex-1 overflow-y-auto p-4">
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
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-3 rounded-lg',
                      msg.role === 'user' ? 'bg-muted' : 'border border-border'
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.isStreaming ? (
                      <span className="inline-block mt-1 animate-pulse">▋</span>
                    ) : null}
                  </div>
                ))
              )}
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
            <div className="mt-1 animate-pulse">▋</div>
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
