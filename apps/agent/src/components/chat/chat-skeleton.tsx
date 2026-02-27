/**
 * ChatSkeleton - Skeleton placeholder during conversation switching
 *
 * Mimics the visual rhythm of a real chat conversation with alternating
 * user (right-aligned pill) and assistant (left-aligned multi-line) blocks.
 * Each block staggers in with a fade-in-up animation for a polished reveal.
 *
 * Purely decorative — no state, no effects, no subscriptions.
 */
import type { FC } from 'react';

import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';

/**
 * Static skeleton block definitions.
 * Defined outside the component for reference stability (rendering-hoist-jsx).
 */
const SKELETON_BLOCKS = [
  // User message — short right-aligned pill
  {
    align: 'right' as const,
    bars: [{ width: '45%' }],
  },
  // Assistant response — multi-line left-aligned
  {
    align: 'left' as const,
    bars: [{ width: '85%' }, { width: '70%' }, { width: '40%' }],
  },
  // User message — slightly wider
  {
    align: 'right' as const,
    bars: [{ width: '55%' }],
  },
  // Assistant response — shorter reply
  {
    align: 'left' as const,
    bars: [{ width: '90%' }, { width: '60%' }],
  },
] as const;

export const ChatSkeleton: FC = () => {
  return (
    <div
      className="mx-auto pt-4 px-4 animate-skeleton-in"
      style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      aria-hidden="true"
      role="presentation"
    >
      {SKELETON_BLOCKS.map((block, blockIndex) => (
        <div
          key={blockIndex}
          className={`mb-3 flex ${block.align === 'right' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`flex flex-col gap-2 ${block.align === 'right' ? 'items-end' : 'items-start'}`}
            style={{ width: block.align === 'right' ? '60%' : '100%' }}
          >
            {block.bars.map((bar, barIndex) => (
              <div
                key={barIndex}
                className={`h-4 rounded-lg bg-muted/60 ${block.align === 'right' ? 'rounded-2xl h-8' : ''}`}
                style={{ width: bar.width }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
