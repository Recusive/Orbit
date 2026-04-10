/**
 * MessageItem - Individual chat message with tool widgets
 *
 * NOTE: Chat widths and spacing come from @/lib/utils/constants.
 * To change message widths or assistant padding, update CHAT_WIDTH,
 * CHAT_WIDTH_VAR, and CHAT_SPACING in constants.ts - DO NOT hardcode here.
 */
import { code as shikiCode } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import { CompactIndicator, InterruptIndicator, ThinkingBox } from '../status';
import {
  ToolWidgetLayoutFrozenContext,
  ToolWidgetSessionContext,
  useObservedSessionLayoutMutation,
} from '../tools/shared';

import { ImageAttachmentTiles } from './ImageAttachmentTiles';
import { ToolWidgetRenderer } from './ToolWidgetRenderer';
import { FeedbackDialog } from './feedback-dialog';
import { MessageActions } from './message-actions';
import { arePropsEqual, buildUnifiedSegments, hasVisibleContent } from './message-utils';

import type { MessageItemProps } from './types';
import type { FC } from 'react';

import { ErrorBoundary } from '@/components/shared';
import { rehypeFlowTokens } from '@/lib/rehype-flow-tokens';
import { rehypeInsightBlocks } from '@/lib/rehype-insight-blocks';
import { cn, CHAT_SPACING } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

/** Max collapsed height for user message bubbles (px). Content taller than this gets a "Show more" toggle. */
const USER_MESSAGE_MAX_HEIGHT = 200;

// Disable Streamdown's built-in link safety modal. Links render as plain <a> tags instead
// of <button> elements, letting our handleContentClick route them through onOpenUrl → Tauri.
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Custom table component — replaces Streamdown's built-in MarkdownTable which hardcodes
// `w-full border-collapse border border-border` on the <table> element and adds
// copy/download control buttons. Our component renders a clean <table> inside a
// .table-wrapper div, letting globals.css handle styling (rounded corners, fit-content).
const MarkdownTable: FC<{ readonly children?: React.ReactNode }> = ({ children }) => (
  <div className="table-wrapper">
    <table>{children}</table>
  </div>
);

// Stable components object — defined outside component to prevent recreation on each render.
// Streamdown compares components by reference; recreating this object would force full re-renders.
const STREAMDOWN_COMPONENTS = { table: MarkdownTable };

// Stable plugin arrays - defined outside component to prevent recreation on each render.
// This is critical for Streamdown performance as it compares plugin arrays by reference.
const REMARK_PLUGINS = [remarkGfm];

// Rehype configuration:
// 1. rehypeInsightBlocks: detects `★ Insight ───` / `───` border patterns and
//    restructures them into styled <aside class="insight-block"> elements.
//    Must run BEFORE rehypeFlowTokens so the DOM is finalized before tokenization.
// 2. rehypeFlowTokens: wraps text in <span class="flow-token"> for per-word
//    blur-in animation during streaming. Inert when data-streaming="false".
//
// IMPORTANT: We use ONE pipeline for both streaming and completed messages.
// Previously, we switched from streaming→static (empty) plugins when isStreaming
// changed. This caused a massive DOM restructuring (removing hundreds of spans
// in one frame), creating a visible flash/glitch at the end of streaming.
// Keeping the spans avoids the restructuring. The extra DOM weight is negligible
// relative to the cost of tearing down and rebuilding the markdown tree.
const REHYPE_PLUGINS = [rehypeInsightBlocks, rehypeFlowTokens];

// Streamdown plugins for diagram and code rendering - defined outside component for reference stability.
// The `code` plugin provides Shiki syntax highlighting with github-light/dark themes.
// Wrapper: unlabeled code blocks (```  with no language) default to markdown highlighting
// instead of Shiki's internal "text" fallback which produces no syntax colors.
const code: typeof shikiCode = {
  ...shikiCode,
  highlight: (...args: Parameters<typeof shikiCode.highlight>) => {
    const [options, callback] = args;
    const language = shikiCode.supportsLanguage(options.language)
      ? options.language
      : ('markdown' as typeof options.language);
    return shikiCode.highlight({ ...options, language }, callback);
  },
};
const STREAMDOWN_PLUGINS = { mermaid, code };
const STREAMDOWN_LAYOUT_STABLE_MS = 250;

const FlowTokenSegment: FC<{
  readonly text: string;
  readonly onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = memo(function FlowTokenSegment({ text, onClick }) {
  return (
    <div
      className="chat-markdown prose prose-sm dark:prose-invert max-w-none select-text"
      onClick={onClick}
    >
      <Streamdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        plugins={STREAMDOWN_PLUGINS}
        components={STREAMDOWN_COMPONENTS}
        linkSafety={LINK_SAFETY_DISABLED}
        mode="static"
      >
        {text}
      </Streamdown>
    </div>
  );
});

/** Collapsible user message bubble — clamps long content behind a "Show more" toggle. */
const UserMessageBubble: FC<{
  readonly messageId: string;
  readonly content: string;
  readonly animate: boolean | undefined;
  readonly onAnimationComplete?: ((messageId: string) => void) | undefined;
  readonly onOpenFile?: (path: string) => void;
  readonly attachedFiles?: string[] | undefined;
}> = memo(function UserMessageBubble({
  messageId,
  content,
  animate,
  onAnimationComplete,
  onOpenFile,
  attachedFiles,
}) {
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

  // Render /slash-commands and @file tokens with special styling anywhere in the message.
  // Slash commands stay as plain blue text to match the chat input surface. @file tokens
  // remain clickable links that open the file in the code editor.
  const renderedContent = useMemo(() => {
    // Match /slash-commands and @file tokens anywhere in the string
    const tokenPattern = /(\/[\w-]+|@[\w./-]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchResult: RegExpExecArray | null;

    while ((matchResult = tokenPattern.exec(content)) !== null) {
      // Add plain text before this token
      if (matchResult.index > lastIndex) {
        parts.push(content.slice(lastIndex, matchResult.index));
      }

      const token = matchResult[0];
      const key = `${String(matchResult.index)}-${token}`;

      if (token.startsWith('@')) {
        const fileName = token.slice(1);
        parts.push(
          <button
            key={key}
            type="button"
            onClick={() => {
              // Resolve @filename to an absolute path:
              // 1. Try matching against attachedFiles (has full paths for current session)
              // 2. Fall back to workspacePath + filename (works for JSONL-loaded messages)
              const fromAttached = attachedFiles?.find(
                (f) => f.endsWith(`/${fileName}`) || f === fileName
              );
              if (fromAttached) {
                onOpenFile?.(fromAttached);
                return;
              }
              const ws = useUIStore.getState().workspacePath;
              const resolved = ws ? `${ws}/${fileName}` : fileName;
              onOpenFile?.(resolved);
            }}
            className="inline text-link hover:underline transition-colors cursor-pointer"
          >
            {fileName}
          </button>
        );
      } else {
        parts.push(
          <span key={key} className="text-git-untracked">
            {token}
          </span>
        );
      }

      lastIndex = matchResult.index + token.length;
    }

    // Add remaining plain text after last token
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    // No tokens found — return plain string (avoids wrapping in fragment)
    if (parts.length === 1 && typeof parts[0] === 'string') return content;

    return <>{parts}</>;
  }, [content, onOpenFile, attachedFiles]);

  const isCollapsed = isOverflowing && !isExpanded;

  return (
    <div
      className={cn(
        'w-fit max-w-full rounded-xl bg-user-bubble-bg px-3.5 pt-2.5',
        isCollapsed ? 'pb-0' : 'pb-2.5',
        animate === true && 'animate-message-in'
      )}
      onAnimationEnd={(e) => {
        // Kill the animation after first play — prevents WebKit from replaying
        // it on style recalculations triggered by sibling content changes
        // (thinking→text transition, tool widgets appearing, etc.)
        e.currentTarget.style.animation = 'none';
        onAnimationComplete?.(messageId);
      }}
    >
      {/* Content area with optional height clamp + mask fade when collapsed */}
      <div className="relative">
        <p
          ref={contentRef}
          className="text-base leading-relaxed whitespace-pre-wrap wrap-break-word select-text"
          style={
            isCollapsed
              ? {
                  maxHeight: `${String(USER_MESSAGE_MAX_HEIGHT)}px`,
                  overflow: 'hidden',
                  maskImage: 'linear-gradient(to bottom, black calc(100% - 48px), transparent)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, black calc(100% - 48px), transparent)',
                }
              : undefined
          }
        >
          {renderedContent}
        </p>
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
  isLastInAssistantGroup,
  isLastMessage,
  isAgentRunning,
  animate,
  onAnimationComplete,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onFeedback,
}) {
  const rewindDisabled = isAgentRunning || isLastAssistantMessage;
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [messageHovered, setMessageHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMouseEnterMessage = useCallback((): void => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setMessageHovered(true);
  }, []);
  const onMouseLeaveMessage = useCallback((): void => {
    hoverTimer.current = setTimeout(() => {
      setMessageHovered(false);
    }, 200);
  }, []);

  // Message is complete when streaming has finished
  // Note: displayedContent.length === content.length check removed. Streaming state
  // is the authoritative signal; displayedContent mirrors content incrementally.
  const isComplete = !message.isStreaming;

  // Derive interrupt state from tools at render time.
  // This survives chat switches because tools are restored from ToolStore session cache,
  // unlike message.isInterrupted/interruptReason which are client-only React state lost
  // when conversation:loaded rebuilds messages from JSONL (Rust only sets isInterrupted
  // for stop_reason=="max_tokens", not for permission denials).
  const rejectedQuestion = tools.find(
    (t) => t.toolName.toLowerCase() === 'askuserquestion' && t.success === false
  );
  const sessionId = useContext(ToolWidgetSessionContext);
  const showInterrupted = message.isInterrupted === true || rejectedQuestion !== undefined;
  const interruptReason =
    message.interruptReason ??
    (rejectedQuestion !== undefined ? 'User rejected to answer' : undefined);

  // Use displayedContent directly - the bridge now forwards granular chunks and the
  // flow-token hook handles visual smoothing without client-side substring reveals.
  const animatedContent = message.displayedContent;

  // Handle clicks on links in markdown content
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor?.href) {
        e.preventDefault();
        onOpenUrl(anchor.href);
      }
    },
    [onOpenUrl]
  );

  // Build interleaved segments for assistant messages
  // Memoized to prevent re-computation on every render - only recomputes when
  // content or tools change. This is critical for streaming performance.
  const effectiveThinkingBlocks = useMemo(
    () =>
      message.thinkingBlocks ??
      (message.thinking
        ? [{ content: message.thinking, durationMs: message.thinkingDurationMs ?? 0 }]
        : undefined),
    [message.thinkingBlocks, message.thinking, message.thinkingDurationMs]
  );

  // Only include tools whose position has been reached by the reveal cursor.
  // During streaming, displayedContent lags behind content. Without this filter,
  // tool widgets would appear prematurely at the end of partially-revealed text.
  const visibleTools = useMemo(
    () =>
      message.isStreaming === true
        ? tools.filter((t) => (t.contentOffset ?? 0) <= animatedContent.length)
        : tools,
    [tools, animatedContent, message.isStreaming]
  );

  const segments = useMemo(
    () =>
      message.role === 'assistant'
        ? buildUnifiedSegments(
            animatedContent,
            visibleTools,
            effectiveThinkingBlocks,
            message.isThinkingActive,
            message.isStreaming
          )
        : [],
    [
      message.role,
      animatedContent,
      visibleTools,
      effectiveThinkingBlocks,
      message.isThinkingActive,
      message.isStreaming,
    ]
  );
  const hasMarkdownSegments = useMemo(
    () => segments.some((segment) => segment.type === 'content'),
    [segments]
  );
  const isLayoutFrozen = useContext(ToolWidgetLayoutFrozenContext);
  const assistantContentRef = useObservedSessionLayoutMutation<HTMLDivElement>(
    sessionId,
    'assistant-markdown',
    `${message.id}:${String(animatedContent.length)}:${String(segments.length)}`,
    hasMarkdownSegments && !isLayoutFrozen,
    STREAMDOWN_LAYOUT_STABLE_MS
  );

  // Don't render empty assistant message bubbles
  if (!hasVisibleContent(message, segments, isComplete)) {
    return null;
  }

  return (
    <div
      className="message-item flex flex-col gap-2"
      data-streaming={message.isStreaming === true ? 'true' : 'false'}
    >
      {/* Message block */}
      {message.role === 'user' ? (
        /* User message — right-aligned bubble, or compact divider for /compact */
        message.displayedContent.trim() === '/compact' ? (
          <CompactIndicator messageId={message.id} />
        ) : (
          <div className="flex flex-col items-end gap-1 pb-3">
            {message.displayedContent.trim().length > 0 ? (
              <UserMessageBubble
                messageId={message.id}
                content={message.displayedContent}
                animate={animate}
                onAnimationComplete={onAnimationComplete}
                onOpenFile={onOpenFile}
                attachedFiles={message.attachedFiles}
              />
            ) : null}
            {message.attachedImages !== undefined && message.attachedImages.length > 0 ? (
              <ImageAttachmentTiles attachedImages={message.attachedImages} />
            ) : null}
          </div>
        )
      ) : (
        /* Assistant message - no bubble, content flows naturally */
        <div
          className="py-1"
          style={{
            paddingLeft: CHAT_SPACING.assistantPadding,
            paddingRight: CHAT_SPACING.assistantPadding,
          }}
          onMouseEnter={onMouseEnterMessage}
          onMouseLeave={onMouseLeaveMessage}
        >
          {/* Content and tool segments */}
          <div ref={assistantContentRef} className="flex flex-col gap-2">
            {segments.map((segment) => {
              if (segment.type === 'thinking') {
                return (
                  <ThinkingBox
                    key={segment.key}
                    thinking={segment.block.content}
                    thinkingDurationMs={segment.block.durationMs}
                    isStreaming={segment.isStreaming}
                  />
                );
              }
              if (segment.type === 'content') {
                // Use mode="static" to prevent scrollbar jumping during streaming.
                // Default "streaming" mode uses block splitting + useTransition which
                // causes height fluctuations that conflict with auto-scroll.
                return (
                  <FlowTokenSegment
                    key={segment.key}
                    text={segment.text}
                    onClick={handleContentClick}
                  />
                );
              }
              return (
                <div key={segment.key} className="tool-widget">
                  <ErrorBoundary
                    fallback={
                      <div className="p-2 rounded-md bg-lg-control border border-lg-separator text-foreground text-sm">
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

          {/* Message actions - shown on the last assistant message in a consecutive group.
           *  Multi-turn responses (tool use + text) produce multiple assistant messages;
           *  only the final one renders the action bar to avoid duplicate controls.
           *  Hide actions only for the active in-flight message (last message while
           *  agent is running). Previous turns remain visible after user sends.
           *  Rewind is still disabled while the agent is running. */}
          {isComplete && isLastInAssistantGroup && !(isAgentRunning && isLastMessage) ? (
            <>
              <MessageActions
                isHovered={messageHovered}
                showRewind
                rewindDisabled={rewindDisabled}
                turnDurationMs={message.turnDurationMs}
                onCopy={() => {
                  void navigator.clipboard.writeText(message.content);
                }}
                onDislike={() => {
                  setFeedbackDialogOpen(true);
                }}
                onRewind={() => {
                  onRewind(message.id);
                }}
              />
              <FeedbackDialog
                open={feedbackDialogOpen}
                onOpenChange={setFeedbackDialogOpen}
                messageContent={message.content}
              />
            </>
          ) : null}

          {/* Interrupt indicator - shown when message was interrupted or question rejected */}
          {showInterrupted ? (
            <div className="mt-2">
              <InterruptIndicator onFeedback={onFeedback} reason={interruptReason} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}, arePropsEqual);
