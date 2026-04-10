import type { ChatMessage } from '@/components/chat/messages/types';

const ESTIMATED_CHARS_PER_LINE = 72;
const ESTIMATED_USER_BASE_HEIGHT = 48;
const ESTIMATED_USER_LINE_HEIGHT = 24;
const ESTIMATED_ASSISTANT_BASE_HEIGHT = 68;
const ESTIMATED_ASSISTANT_LINE_HEIGHT = 22;
const ESTIMATED_CODE_LINE_HEIGHT = 20;
const ESTIMATED_CODE_BLOCK_PADDING = 40;
const ESTIMATED_THINKING_HEIGHT = 96;
const ESTIMATED_IMAGE_GRID_HEIGHT = 144;
const ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT = 24;
const MAX_ESTIMATED_MESSAGE_HEIGHT = 4000;

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

export function estimateMessageHeight(message: ChatMessage): number {
  const content = message.displayedContent.length > 0 ? message.displayedContent : message.content;
  let height =
    message.role === 'user' ? ESTIMATED_USER_BASE_HEIGHT : ESTIMATED_ASSISTANT_BASE_HEIGHT;

  if (message.role === 'user') {
    height += estimateWrappedLines(content, ESTIMATED_CHARS_PER_LINE) * ESTIMATED_USER_LINE_HEIGHT;
  } else {
    const parts = content.split('```');
    let proseLines = 0;
    let codeLines = 0;
    let codeBlockCount = 0;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? '';
      if (i % 2 === 0) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          proseLines += estimateWrappedLines(trimmed, ESTIMATED_CHARS_PER_LINE);
        }
      } else {
        const blockLineCount = part.split('\n').length;
        codeLines += Math.max(1, blockLineCount - 1);
        codeBlockCount += 1;
      }
    }

    height += proseLines * ESTIMATED_ASSISTANT_LINE_HEIGHT;
    height +=
      codeLines * ESTIMATED_CODE_LINE_HEIGHT + codeBlockCount * ESTIMATED_CODE_BLOCK_PADDING;
  }

  if ((message.thinkingBlocks?.length ?? 0) > 0 || message.thinking) {
    height += ESTIMATED_THINKING_HEIGHT;
  }

  if ((message.attachedImages?.length ?? 0) > 0) {
    height += ESTIMATED_IMAGE_GRID_HEIGHT;
    height +=
      Math.max(0, (message.attachedImages?.length ?? 1) - 1) * ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT;
  }

  return Math.min(MAX_ESTIMATED_MESSAGE_HEIGHT, height);
}
