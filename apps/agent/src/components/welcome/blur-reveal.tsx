import { motion } from 'motion/react';

import type { FC } from 'react';

interface BlurRevealProps {
  readonly children: string;
  readonly className?: string;
  readonly speedReveal?: number;
  readonly speedSegment?: number;
  readonly trigger?: boolean;
  readonly onComplete?: (() => void) | undefined;
}

export const BlurReveal: FC<BlurRevealProps> = ({
  children,
  className,
  speedReveal = 2.5,
  speedSegment = 0.8,
  trigger = false,
  onComplete,
}) => {
  const stagger = 0.03 / speedReveal;
  const baseDuration = 0.3 / speedSegment;

  const state = trigger ? 'visible' : 'hidden';

  return (
    <motion.p
      initial="hidden"
      animate={state}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
          },
        },
      }}
      className={className}
      onAnimationComplete={(definition): void => {
        if (definition === 'visible') {
          onComplete?.();
        }
      }}
    >
      <span className="sr-only">{children}</span>
      {children.split(' ').map((word, wordIndex, wordsArray) => (
        <span
          key={`word-${String(wordIndex)}`}
          className="inline-block whitespace-nowrap"
          aria-hidden="true"
        >
          {word.split('').map((char, charIndex) => (
            <motion.span
              key={`char-${String(wordIndex)}-${String(charIndex)}`}
              variants={{
                hidden: { opacity: 0, filter: 'blur(12px)', y: 10 },
                visible: {
                  opacity: 1,
                  filter: 'blur(0px)',
                  y: 0,
                  transition: { duration: baseDuration },
                },
              }}
              className="inline-block"
            >
              {char}
            </motion.span>
          ))}
          {wordIndex < wordsArray.length - 1 ? (
            <motion.span
              key={`space-${String(wordIndex)}`}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { duration: baseDuration },
                },
              }}
              className="inline-block"
            >
              &nbsp;
            </motion.span>
          ) : null}
        </span>
      ))}
    </motion.p>
  );
};
