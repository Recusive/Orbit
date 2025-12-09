import {
  ArrowRight,
  ChevronDown,
  Code,
  Eye,
  FileCode,
  FileText,
  Globe,
  ListChecks,
  PanelRight,
  Plus,
  SquareTerminal,
} from 'lucide-react';
import { useState } from 'react';


import { ResizeHandle } from './resize-handle';

import type { FC } from 'react';


import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

export const CenterPanel: FC = () => {
  const { toggleReviewPanel, toggleBottomPanel, toggleRightSidebar, reviewPanelOpen, reviewPanelWidth } = useUIStore();

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Shared Header - 40px (spans both Chat and Review) */}
      <header className="h-[40px] flex items-center justify-between px-4 border-b border-gray-500/20 shrink-0">
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
                ? 'bg-gray-500/20 text-foreground'
                : 'opacity-70 hover:opacity-100 hover:bg-gray-500/20'
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
              {/* Example User Message */}
              <div className="bg-gray-500/15 p-2 rounded-lg">
                <p className="text-sm">Hello! Can you help me create a todo list application?</p>
              </div>

              {/* Example Agent Message */}
              <div className="rounded-lg border border-gray-500/20">
                <div className="px-2 py-2">
                  <p className="text-sm">
                    I'd be happy to help you create a todo list application! Let me plan out the implementation...
                  </p>
                </div>
              </div>

              {/* Empty state when no messages */}
              <div className="flex-1 flex items-center justify-center min-h-[200px]">
                <div className="text-center text-muted-foreground">
                  <p className="text-lg mb-1">Start a conversation</p>
                  <p className="text-sm">Ask Orbit to help you code</p>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-4 pt-0 shrink-0">
            <div className="p-1 rounded-lg bg-gray-500/10 border border-gray-500/20">
              {/* Input Area */}
              <div
                className="p-2 min-h-[60px] text-sm outline-none"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Type your message..."
              />

              {/* Controls Row */}
              <div className="flex w-full items-center justify-between gap-1 px-1 pb-1">
                {/* Left Controls */}
                <div className="flex items-center gap-1">
                  <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-500/20 opacity-70 hover:opacity-100 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                  <button className="py-1 pl-1 pr-2 flex items-center gap-0.5 rounded text-sm hover:bg-gray-500/20 opacity-70 hover:opacity-100 transition-colors">
                    <ChevronDown className="h-4 w-4" />
                    <span>Planning</span>
                  </button>
                  <button className="py-1 px-2 flex items-center gap-0.5 rounded text-sm hover:bg-gray-500/20 opacity-70 hover:opacity-100 transition-colors">
                    <ChevronDown className="h-4 w-4" />
                    <span>Claude Sonnet 4.5</span>
                  </button>
                </div>

                {/* Send Button */}
                <button className="h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </button>
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
      className="h-7 w-7 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-gray-500/20 transition-colors"
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
          ? 'bg-gray-500/20 text-foreground cursor-default'
          : 'text-muted-foreground hover:text-foreground hover:bg-gray-500/10'
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
  const statusColors = {
    added: '#81b88b',
    modified: '#e2c08d',
    deleted: '#c74e39',
  };

  const getFileIcon = (fileName: string): React.ReactNode => {
    if (fileName.endsWith('.css')) {
      return <FileText className="h-4 w-4 text-sky-400" />;
    }
    if (fileName.endsWith('.html')) {
      return <FileCode className="h-4 w-4 text-orange-400" />;
    }
    if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
      return <FileCode className="h-4 w-4 text-yellow-400" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  return (
    <button className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-500/20 transition-colors text-left border border-gray-500/20">
      {getFileIcon(name)}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{folder}</div>
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: statusColors[status] }}
      >
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
          className="w-full min-h-[80px] px-3 py-2 bg-gray-500/10 border border-gray-500/20 rounded text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Enter commit message..."
        />
      </div>
      <div className="flex gap-2">
        <button className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
          Commit
        </button>
        <button className="px-3 py-1.5 text-xs font-medium hover:bg-gray-500/20 rounded transition-colors">
          Stash
        </button>
      </div>
    </div>
  );
};
