/**
 * MessageItem - Individual chat message with tool widgets
 *
 * NOTE: Chat widths and spacing come from @/lib/utils/constants.
 * To change message widths or assistant padding, update CHAT_WIDTH,
 * CHAT_WIDTH_VAR, and CHAT_SPACING in constants.ts - DO NOT hardcode here.
 */
import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import { InterruptIndicator, ThinkingBox } from '../status';
import {
  BashToolWidget,
  EditToolWidget,
  GlobToolWidget,
  GrepToolWidget,
  ReadToolWidget,
  TaskToolWidget,
  TodoToolWidget,
  WebFetchToolWidget,
  WebSearchToolWidget,
  WriteToolWidget,
} from '../tools';

import { MessageActions } from './message-actions';

import type { ImageAttachment } from '../input/chat-input';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { FC } from 'react';

import { FileIcon } from '@/components/files';
import { CHAT_SPACING, CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils/constants';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  displayedContent: string;
  isStreaming?: boolean | undefined;
  isInterrupted?: boolean | undefined;
  thinking?: string | undefined;
  thinkingDurationMs?: number | undefined;
  /** Attached file paths for user messages */
  attachedFiles?: string[] | undefined;
  /** Attached images for user messages */
  attachedImages?: ImageAttachment[] | undefined;
}

interface MessageItemProps {
  readonly message: ChatMessage;
  readonly tools: ToolExecution[];
  readonly isLastAssistantMessage: boolean;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onFeedback: () => void;
}

// Helper to extract string from tool input
const getStringInput = (tool: ToolExecution, key: string, fallback: string): string => {
  const value = tool.toolInput[key];
  return typeof value === 'string' ? value : fallback;
};

// Segment type for interleaving content and tools
type Segment =
  | { type: 'content'; text: string; key: string }
  | { type: 'tool'; tool: ToolExecution; key: string };

// Custom comparison for memo - compares tools by content, not reference
const arePropsEqual = (prev: MessageItemProps, next: MessageItemProps): boolean => {
  // Fast path: same references
  if (prev === next) return true;

  // Compare simple props
  if (prev.message !== next.message) return false;
  if (prev.isLastAssistantMessage !== next.isLastAssistantMessage) return false;
  if (prev.onRewind !== next.onRewind) return false;
  if (prev.onOpenFile !== next.onOpenFile) return false;
  if (prev.onOpenUrl !== next.onOpenUrl) return false;
  if (prev.onFeedback !== next.onFeedback) return false;

  // Compare tools array by content (the main optimization)
  if (prev.tools.length !== next.tools.length) return false;
  for (let i = 0; i < prev.tools.length; i++) {
    const prevTool = prev.tools[i];
    const nextTool = next.tools[i];
    if (prevTool === undefined || nextTool === undefined) return false;
    // Compare by ID and status - if these match, tool is the same
    if (prevTool.id !== nextTool.id) return false;
    if (prevTool.status !== nextTool.status) return false;
    if (prevTool.toolOutput !== nextTool.toolOutput) return false;
  }

  return true;
};

export const MessageItem: FC<MessageItemProps> = memo(function MessageItem({
  message,
  tools,
  isLastAssistantMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onFeedback,
}) {
  const isComplete =
    !message.isStreaming && message.displayedContent.length === message.content.length;

  // Handle clicks on links in markdown content
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor?.href) {
      e.preventDefault();
      onOpenUrl(anchor.href);
    }
  };

  // Build interleaved segments for assistant messages
  const buildSegments = (): Segment[] => {
    const content = message.displayedContent;
    const sortedTools = [...tools].sort((a, b) => (a.contentOffset ?? 0) - (b.contentOffset ?? 0));

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

    return segments;
  };

  // Render a tool widget based on tool name
  const renderToolWidget = (tool: ToolExecution): React.ReactNode => {
    const toolName = tool.toolName.toLowerCase();

    if (toolName === 'write') {
      return (
        <WriteToolWidget
          key={tool.id}
          filePath={getStringInput(tool, 'file_path', 'unknown')}
          content={getStringInput(tool, 'content', '')}
          isRunning={tool.status === 'running'}
          success={tool.status === 'error' ? false : tool.success}
          onOpenFile={onOpenFile}
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
          success={tool.status === 'error' ? false : tool.success}
          onOpenFile={onOpenFile}
        />
      );
    }
    if (toolName === 'read') {
      return (
        <ReadToolWidget
          key={tool.id}
          filePath={getStringInput(tool, 'file_path', 'unknown')}
          isRunning={tool.status === 'running'}
          success={tool.status === 'error' ? false : tool.success}
          content={typeof tool.toolOutput === 'string' ? tool.toolOutput : undefined}
          onOpenFile={onOpenFile}
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
          success={tool.status === 'error' ? false : tool.success}
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
          success={tool.status === 'error' ? false : tool.success}
          onOpenFile={onOpenFile}
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
          success={tool.status === 'error' ? false : tool.success}
          onOpenFile={onOpenFile}
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
          success={tool.status === 'error' ? false : tool.success}
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
          success={tool.status === 'error' ? false : tool.success}
          onOpenUrl={onOpenUrl}
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
          success={tool.status === 'error' ? false : tool.success}
          onOpenUrl={onOpenUrl}
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
          success={tool.status === 'error' ? false : tool.success}
        />
      );
    }
    return null;
  };

  const hasFiles = (message.attachedFiles?.length ?? 0) > 0;
  const hasImages = (message.attachedImages?.length ?? 0) > 0;
  const hasAttachments = hasFiles || hasImages;

  // For assistant messages, check if there's anything to render
  const segments = message.role === 'assistant' ? buildSegments() : [];
  const hasThinking = Boolean(message.thinking);
  const hasSegments = segments.length > 0;
  const hasVisibleContent =
    message.role === 'user' || hasThinking || hasSegments || isComplete || message.isInterrupted;

  // Don't render empty assistant message bubbles
  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div className="message-item space-y-2">
      {/* Message block */}
      {message.role === 'user' ? (
        /* User message bubble */
        <div
          className="p-2 rounded-lg bg-card border border-border/40 shadow-sm"
          style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap">
            {message.displayedContent}
          </p>
        </div>
      ) : (
        /* Assistant message - no bubble, content flows naturally */
        <div
          className="py-1"
          style={{
            paddingLeft: CHAT_SPACING.assistantPadding,
            paddingRight: CHAT_SPACING.assistantPadding,
          }}
        >
          {/* Thinking Box - show when thinking content exists */}
          {message.thinking ? (
            <ThinkingBox
              thinking={message.thinking}
              thinkingDurationMs={message.thinkingDurationMs}
              isStreaming={message.isStreaming}
            />
          ) : null}
          <div className="space-y-2">
            {segments.map((segment) => {
              if (segment.type === 'content') {
                return (
                  <div
                    key={segment.key}
                    className="chat-markdown prose prose-sm dark:prose-invert max-w-none"
                    onClick={handleContentClick}
                  >
                    <Streamdown remarkPlugins={[remarkGfm]} rehypePlugins={[]}>
                      {segment.text}
                    </Streamdown>
                  </div>
                );
              }
              return (
                <div key={segment.key} className="tool-widget">
                  {renderToolWidget(segment.tool)}
                </div>
              );
            })}
          </div>
          {isComplete ? (
            <MessageActions
              showDisclaimer={isLastAssistantMessage}
              rewindDisabled={isLastAssistantMessage}
              onCopy={() => {
                void navigator.clipboard.writeText(message.content);
              }}
              onRewind={() => {
                onRewind(message.id);
              }}
            />
          ) : null}
          {/* Interrupt indicator - shown when message was interrupted */}
          {message.isInterrupted ? <InterruptIndicator onFeedback={onFeedback} /> : null}
        </div>
      )}

      {/* Attached context - outside the bubble */}
      {message.role === 'user' && hasAttachments ? (
        <div className="chat-attached-context flex flex-wrap gap-1.5 px-3.5">
          {/* Attached files */}
          {message.attachedFiles?.map((filePath) => {
            const fileName = filePath.split('/').pop() ?? filePath;
            return (
              <div
                key={filePath}
                className="chat-attached-context-attachment flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors cursor-pointer"
                title={filePath}
              >
                <FileIcon fileName={fileName} className="h-3.5 w-3.5" monochrome={false} />
                <span className="text-sm text-foreground/70">{fileName}</span>
              </div>
            );
          })}
          {/* Attached images */}
          {message.attachedImages?.map((image, index) => (
            <div
              key={`${image.name}-${String(index)}`}
              className="chat-attached-context-attachment flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors cursor-pointer"
              title={image.name}
            >
              <img
                src={image.previewUrl}
                alt={image.name}
                className="h-4 w-4 object-cover rounded-sm"
              />
              <span className="text-sm text-foreground/70">{image.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}, arePropsEqual);
