import { motion } from 'motion/react';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ShimmerTextProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Animation cycle duration in seconds (default: 1.5) */
  readonly duration?: number;
  /** Delay before first animation in seconds (default: 1.5) */
  readonly delay?: number;
}

export const ShimmerText: FC<ShimmerTextProps> = ({
  children,
  className,
  duration = 1.5,
  delay = 1.5,
}) => (
  <div className="group overflow-hidden">
    <div>
      <motion.div
        className={cn(
          'inline-block [--shimmer-contrast:rgba(255,255,255,0.6)] dark:[--shimmer-contrast:rgba(0,0,0,0.5)]',
          className
        )}
        style={{
          WebkitTextFillColor: 'transparent',
          background:
            'currentColor linear-gradient(to right, currentColor 0%, var(--shimmer-contrast) 40%, var(--shimmer-contrast) 60%, currentColor 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '50% 200%',
        }}
        initial={{ backgroundPositionX: '250%' }}
        animate={{ backgroundPositionX: ['-100%', '250%'] }}
        transition={{
          duration,
          delay,
          repeat: Infinity,
          repeatDelay: 1.5,
          ease: 'linear',
        }}
      >
        <span>{children}</span>
      </motion.div>
    </div>
  </div>
);
