/**
 * MessageItem - Individual chat message with tool widgets
 *
 * NOTE: Chat widths and spacing come from @/lib/utils/constants.
 * To change message widths or assistant padding, update CHAT_WIDTH,
 * CHAT_WIDTH_VAR, and CHAT_SPACING in constants.ts - DO NOT hardcode here.
 */
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

// Stable plugin arrays - defined outside component to prevent recreation on each render.
// This is critical for Streamdown performance as it compares plugin arrays by reference.
const REMARK_PLUGINS = [remarkGfm];

// Two rehype configurations: streaming wraps text in <span class="flow-token">
// for per-word blur-in animation; static renders plain text with zero DOM overhead.
const REHYPE_PLUGINS_STATIC: never[] = [];
const REHYPE_PLUGINS_STREAMING = [rehypeFlowTokens];

// Mermaid plugin for diagram rendering - defined outside component for reference stability
const STREAMDOWN_PLUGINS = { mermaid };

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

  // Dynamic animation speed: short responses get slower, more visible animations;
  // long responses speed up so animation doesn't impede reading.
  // Content naturally grows during streaming, so this accelerates organically.
  //   0 chars   → 0.8s  (short reply, savor each word)
  //   400 chars → 0.6s  (medium, balanced)
  //   800+ chars → 0.4s (long output, stay out of the way)
  const flowDuration = message.isStreaming
    ? `${String(Math.max(0.4, Math.min(0.8, 0.8 - (animatedContent.length / 800) * 0.4)))}s`
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
            'p-2 rounded-lg bg-card border border-border/40 shadow-sm',
            animate && 'animate-message-in'
          )}
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

          {/* Content and tool segments */}
          <div className="space-y-2">
            {segments.map((segment) => {
              if (segment.type === 'content') {
                // Use mode="static" to prevent scrollbar jumping during streaming.
                // Default "streaming" mode uses block splitting + useTransition which
                // causes height fluctuations that conflict with auto-scroll.
                return (
                  <div
                    key={segment.key}
                    className="chat-markdown prose prose-sm dark:prose-invert max-w-none"
                    onClick={handleContentClick}
                  >
                    <Streamdown
                      remarkPlugins={REMARK_PLUGINS}
                      rehypePlugins={rehypePlugins}
                      plugins={STREAMDOWN_PLUGINS}
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
