import type { ChatMessage } from '@/components/chat/messages/types';

const ESTIMATED_CHARS_PER_LINE = 72;
const ESTIMATED_USER_BASE_HEIGHT = 48;
const ESTIMATED_USER_LINE_HEIGHT = 24;
const ESTIMATED_ASSISTANT_BASE_HEIGHT = 68;
const ESTIMATED_ASSISTANT_LINE_HEIGHT = 22;
const ESTIMATED_CODE_LINE_HEIGHT = 20;
const ESTIMATED_CODE_BLOCK_HEADER = 46;
const ESTIMATED_CODE_BLOCK_CONTAINER_PADDING = 32;
const ESTIMATED_MIN_CODE_BLOCK_HEIGHT = 96;
const ESTIMATED_TOOL_WIDGET_HEIGHT = 80;
const ESTIMATED_THINKING_HEIGHT = 96;
const ESTIMATED_IMAGE_GRID_HEIGHT = 144;
const ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT = 24;
// No artificial cap — messages in this app can be 70,000+ pixels tall
// (long conversations with extensive code blocks). Capping at 4000 caused
// the virtualizer's totalSize to be 10-20x too small for long conversations,
// creating a scroll ceiling at ~60% and constant jitter from measurement
// corrections. The virtualizer needs accurate estimates to compute scroll range.
const MAX_ESTIMATED_MESSAGE_HEIGHT = 200_000;

function estimateWrappedLines(text: string, charsPerLine: number): number {
  const lines = text.split('\n');
  let wrappedLines = 0;

  for (const line of lines) {
    wrappedLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }

  return Math.max(1, wrappedLines);
}

export function isNearBottom(
  container: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  threshold: number
): boolean {
  const remaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
  return remaining <= threshold;
}

export function scrollToBottom(
  container: Pick<HTMLElement, 'scrollHeight' | 'scrollTo'>,
  behavior: ScrollBehavior = 'auto'
): void {
  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });
}

export interface EstimateMessageHeightOptions {
  toolCount?: number;
  hasThinking?: boolean;
  imageCount?: number;
}

export function estimateMessageHeight(
  message: ChatMessage,
  options?: EstimateMessageHeightOptions
): number {
  const content = message.displayedContent.length > 0 ? message.displayedContent : message.content;
  let height =
    message.role === 'user' ? ESTIMATED_USER_BASE_HEIGHT : ESTIMATED_ASSISTANT_BASE_HEIGHT;

  if (message.role === 'user') {
    height += estimateWrappedLines(content, ESTIMATED_CHARS_PER_LINE) * ESTIMATED_USER_LINE_HEIGHT;
  } else {
    const parts = content.split('```');
    let proseLines = 0;
    let codeBlockHeight = 0;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? '';
      if (i % 2 === 0) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          proseLines += estimateWrappedLines(trimmed, ESTIMATED_CHARS_PER_LINE);
        }
      } else {
        const blockLineCount = Math.max(1, part.split('\n').length - 1);
        const rawBlockHeight =
          ESTIMATED_CODE_BLOCK_HEADER +
          blockLineCount * ESTIMATED_CODE_LINE_HEIGHT +
          ESTIMATED_CODE_BLOCK_CONTAINER_PADDING;
        codeBlockHeight += Math.max(ESTIMATED_MIN_CODE_BLOCK_HEIGHT, rawBlockHeight);
      }
    }

    height += proseLines * ESTIMATED_ASSISTANT_LINE_HEIGHT;
    height += codeBlockHeight;
  }

  // Thinking — options override, else introspect message
  const hasThinking =
    options?.hasThinking ??
    ((message.thinkingBlocks?.length ?? 0) > 0 ||
      (message.thinking !== undefined && message.thinking.length > 0));
  if (hasThinking) {
    height += ESTIMATED_THINKING_HEIGHT;
  }

  // Images — options override, else introspect message
  const imageCount = options?.imageCount ?? message.attachedImages?.length ?? 0;
  if (imageCount > 0) {
    height += ESTIMATED_IMAGE_GRID_HEIGHT;
    height += Math.max(0, imageCount - 1) * ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT;
  }

  // Tool widgets
  const toolCount = options?.toolCount ?? 0;
  height += toolCount * ESTIMATED_TOOL_WIDGET_HEIGHT;

  return Math.min(MAX_ESTIMATED_MESSAGE_HEIGHT, height);
}
