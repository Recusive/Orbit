/**
 * MessageItem - Individual chat message with tool widgets
 *
 * NOTE: Chat widths and spacing come from @/lib/utils/constants.
 * To change message widths or assistant padding, update CHAT_WIDTH,
 * CHAT_WIDTH_VAR, and CHAT_SPACING in constants.ts - DO NOT hardcode here.
 */
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Max collapsed height for user message bubbles (px). Content taller than this gets a "Show more" toggle. */
const USER_MESSAGE_MAX_HEIGHT = 200;

// Disable Streamdown's built-in link safety modal. Links render as plain <a> tags instead
// of <button> elements, letting our handleContentClick route them through onOpenUrl → Tauri.
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Stable plugin arrays - defined outside component to prevent recreation on each render.
// This is critical for Streamdown performance as it compares plugin arrays by reference.
const REMARK_PLUGINS = [remarkGfm];

// Rehype configuration: wraps text in <span class="flow-token"> for per-word
// blur-in animation during streaming. These spans are visually inert when the
// message is complete — the CSS animation only applies via [data-streaming="true"].
//
// IMPORTANT: We use ONE pipeline for both streaming and completed messages.
// Previously, we switched from streaming→static (empty) plugins when isStreaming
// changed. This caused a massive DOM restructuring (removing hundreds of spans
// in one frame), creating a visible flash/glitch at the end of streaming.
// Keeping the spans avoids the restructuring. The extra DOM weight is negligible
// since the virtualizer limits to ~15 messages in the DOM.
const REHYPE_PLUGINS = [rehypeFlowTokens];

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

/** Collapsible user message bubble — clamps long content behind a "Show more" toggle. */
const UserMessageBubble: FC<{ readonly content: string; readonly animate: boolean | undefined }> =
  memo(function UserMessageBubble({ content, animate }) {
    const contentRef = useRef<HTMLParagraphElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Detect overflow after layout to decide whether the toggle is needed.
    // useLayoutEffect fires synchronously before paint → no flash of "Show more" on short messages.
    useLayoutEffect(() => {
      const el = contentRef.current;
      if (el === null) return;
      setIsOverflowing(el.scrollHeight > USER_MESSAGE_MAX_HEIGHT);
    }, [content]);

    const toggleExpanded = useCallback(() => {
      setIsExpanded((prev) => !prev);
    }, []);

    const isCollapsed = isOverflowing && !isExpanded;

    return (
      <div
        className={cn(
          'w-fit rounded-lg bg-gray-4 px-3.5 pt-2.5',
          isCollapsed ? 'pb-0' : 'pb-2.5',
          animate === true && 'animate-message-in'
        )}
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* Content area with optional height clamp */}
        <div className="relative">
          <p
            ref={contentRef}
            className="text-base leading-relaxed whitespace-pre-wrap select-text"
            style={
              isCollapsed
                ? { maxHeight: `${String(USER_MESSAGE_MAX_HEIGHT)}px`, overflow: 'hidden' }
                : undefined
            }
          >
            {content}
          </p>

          {/* Gradient fade overlay when collapsed */}
          {isCollapsed ? (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-4 to-transparent pointer-events-none" />
          ) : null}
        </div>

        {/* Show more / Show less toggle */}
        {isOverflowing ? (
          <button
            type="button"
            onClick={toggleExpanded}
            className="pt-1 pb-2.5 text-xs text-foreground/50 hover:text-foreground transition-colors w-3/4 text-left"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        ) : null}
      </div>
    );
  });

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

  // Use the same rehype pipeline for both streaming and completed messages.
  // Flow-token spans are inert when data-streaming="false" (no animation CSS applies).
  // See REHYPE_PLUGINS comment above for why we don't switch pipelines.
  const rehypePlugins = REHYPE_PLUGINS;

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
        /* User message — right-aligned bubble with collapsible long content */
        <div className="flex flex-col items-end gap-1">
          <UserMessageBubble content={message.displayedContent} animate={animate} />

          {/* Attached context — right-aligned alongside the bubble */}
          {hasAttachments ? (
            <div className="chat-attached-context flex flex-wrap justify-end gap-1.5">
              {message.attachedFiles?.map((filePath) => {
                const fileName = filePath.split('/').pop() ?? filePath;
                return (
                  <div
                    key={filePath}
                    className="chat-attached-context-attachment flex items-center gap-1.5 px-2 py-1 bg-gray-4 rounded-md hover:bg-accent transition-colors cursor-pointer"
                    title={filePath}
                  >
                    <FileIcon fileName={fileName} className="h-3.5 w-3.5" monochrome={false} />
                    <span className="text-sm text-foreground/70">{fileName}</span>
                  </div>
                );
              })}

              {message.attachedImages?.map((image, index) => (
                <div
                  key={`${image.name}-${String(index)}`}
                  className="chat-attached-context-attachment flex items-center gap-1.5 px-2 py-1 bg-gray-4 rounded-md hover:bg-accent transition-colors cursor-pointer"
                  title={image.name}
                >
                  <img
                    src={image.previewUrl}
                    alt={image.name}
                    className="h-4 w-4 object-cover rounded-md"
                  />
                  <span className="text-sm text-foreground/70">{image.name}</span>
                </div>
              ))}
            </div>
          ) : null}
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
                      <div className="p-2 rounded-md bg-gray-3 border border-gray-5 text-gray-12 text-sm">
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
    </div>
  );
}, arePropsEqual);
