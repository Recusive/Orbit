/**
 * MessageItem - Individual chat message with tool widgets
 *
 * NOTE: Chat widths and spacing come from @/lib/utils/constants.
 * To change message widths or assistant padding, update CHAT_WIDTH,
 * CHAT_WIDTH_VAR, and CHAT_SPACING in constants.ts - DO NOT hardcode here.
 */
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import { InterruptIndicator, ThinkingBox } from '../status';

import { ToolWidgetRenderer } from './ToolWidgetRenderer';
import { MessageActions } from './message-actions';
import { arePropsEqual, buildSegments, hasVisibleContent } from './message-utils';

import type { MessageItemProps } from './types';
import type { FC } from 'react';

import { FileIcon } from '@/components/files';
import { ErrorBoundary } from '@/components/shared';
import { rehypeFlowTokens } from '@/lib/rehype-flow-tokens';
import { cn, CHAT_SPACING, CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';

// Disable Streamdown's built-in link safety modal. Links render as plain <a> tags instead
// of <button> elements, letting our handleContentClick route them through onOpenUrl → Tauri.
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Stable plugin arrays - defined outside component to prevent recreation on each render.
// This is critical for Streamdown performance as it compares plugin arrays by reference.
const REMARK_PLUGINS = [remarkGfm];

// Two rehype configurations: streaming wraps text in <span class="flow-token">
// for per-word blur-in animation; static renders plain text with zero DOM overhead.
const REHYPE_PLUGINS_STATIC: never[] = [];
const REHYPE_PLUGINS_STREAMING = [rehypeFlowTokens];

// Streamdown plugins for diagram and code rendering - defined outside component for reference stability.
// The `code` plugin provides Shiki syntax highlighting with github-light/dark themes.
const STREAMDOWN_PLUGINS = { mermaid, code };

/**
 * Calculate dynamic animation duration based on content length.
 *
 * Short responses get slower animations (0.8s) so each word is savored.
 * Long responses get faster animations (0.4s) to stay out of the way.
 * Linear interpolation between 0 and 800 characters.
 *
 * @param contentLength - Current length of the streaming content
 * @returns Duration string like "0.6s", or undefined if not streaming
 */
function calculateFlowDuration(contentLength: number): string {
  // Constants for the linear interpolation
  const MAX_DURATION = 0.8; // seconds at 0 chars
  const MIN_DURATION = 0.4; // seconds at 800+ chars
  const THRESHOLD_CHARS = 800;

  const ratio = Math.min(contentLength / THRESHOLD_CHARS, 1);
  const duration = MAX_DURATION - ratio * (MAX_DURATION - MIN_DURATION);
  return `${duration.toString()}s`;
}

export const MessageItem: FC<MessageItemProps> = memo(function MessageItem({
  message,
  tools,
  isLastAssistantMessage,
  animate,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onFeedback,
}) {
  // Message is complete when streaming has finished
  // Note: displayedContent.length === content.length check removed - with backend batching,
  // both fields are always equal. Streaming state is the authoritative signal.
  const isComplete = !message.isStreaming;

  // Use displayedContent directly - backend batching (50ms) provides smooth streaming
  // Note: JS animation hooks cause flash when combined with auto-scroll during streaming
  const animatedContent = message.displayedContent;

  // Choose rehype plugins based on streaming state.
  // During streaming, rehypeFlowTokens wraps words in <span class="flow-token"> for
  // per-word fade-in animation. Once complete, we switch to the static (empty) pipeline
  // so completed messages carry zero extra DOM weight.
  const rehypePlugins = message.isStreaming ? REHYPE_PLUGINS_STREAMING : REHYPE_PLUGINS_STATIC;

  // Dynamic animation speed based on content length (see calculateFlowDuration)
  const flowDuration = message.isStreaming
    ? calculateFlowDuration(animatedContent.length)
    : undefined;

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
  // Memoized to prevent re-computation on every render - only recomputes when
  // content or tools change. This is critical for streaming performance.
  const segments = useMemo(
    () => (message.role === 'assistant' ? buildSegments(animatedContent, tools) : []),
    [message.role, animatedContent, tools]
  );

  // Check for attachments
  const hasFiles = (message.attachedFiles?.length ?? 0) > 0;
  const hasImages = (message.attachedImages?.length ?? 0) > 0;
  const hasAttachments = hasFiles || hasImages;

  // Don't render empty assistant message bubbles
  if (!hasVisibleContent(message, segments, isComplete)) {
    return null;
  }

  return (
    <div
      className="message-item space-y-2"
      data-streaming={message.isStreaming === true ? 'true' : 'false'}
      style={
        flowDuration !== undefined
          ? ({ '--flow-duration': flowDuration } as React.CSSProperties)
          : undefined
      }
    >
      {/* Message block */}
      {message.role === 'user' ? (
        /* User message bubble */
        <div
          className={cn(
            'p-2 rounded-xl bg-muted/30 dark:bg-card border-[3px] border-border/50 shadow-none',
            animate && 'animate-message-in'
          )}
          style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap select-text">
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
          {/* Content and tool segments */}
          <div className="space-y-2">
            {/* Thinking Boxes - one per thinking phase, inside space-y-2 for consistent spacing */}
            {message.thinkingBlocks !== undefined && message.thinkingBlocks.length > 0 ? (
              message.thinkingBlocks.map((block, i) => (
                <ThinkingBox
                  key={i}
                  thinking={block.content}
                  thinkingDurationMs={block.durationMs}
                  isStreaming={
                    message.isStreaming === true &&
                    message.isThinkingActive === true &&
                    i === (message.thinkingBlocks?.length ?? 0) - 1
                  }
                />
              ))
            ) : message.thinking ? (
              <ThinkingBox
                thinking={message.thinking}
                thinkingDurationMs={message.thinkingDurationMs}
                isStreaming={message.isStreaming}
              />
            ) : null}

            {segments.map((segment) => {
              if (segment.type === 'content') {
                // Use mode="static" to prevent scrollbar jumping during streaming.
                // Default "streaming" mode uses block splitting + useTransition which
                // causes height fluctuations that conflict with auto-scroll.
                return (
                  <div
                    key={segment.key}
                    className="chat-markdown prose prose-sm dark:prose-invert max-w-none select-text"
                    onClick={handleContentClick}
                  >
                    <Streamdown
                      remarkPlugins={REMARK_PLUGINS}
                      rehypePlugins={rehypePlugins}
                      plugins={STREAMDOWN_PLUGINS}
                      linkSafety={LINK_SAFETY_DISABLED}
                      mode="static"
                    >
                      {segment.text}
                    </Streamdown>
                  </div>
                );
              }
              return (
                <div key={segment.key} className="tool-widget">
                  <ErrorBoundary
                    fallback={
                      <div className="p-2 rounded-md bg-muted/50 border border-border/50 text-muted-foreground text-sm">
                        Failed to render tool: {segment.tool.toolName}
                      </div>
                    }
                  >
                    <ToolWidgetRenderer
                      tool={segment.tool}
                      onOpenFile={onOpenFile}
                      onOpenUrl={onOpenUrl}
                    />
                  </ErrorBoundary>
                </div>
              );
            })}
          </div>

          {/* Message actions - shown when complete */}
          {isComplete ? (
            <MessageActions
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
