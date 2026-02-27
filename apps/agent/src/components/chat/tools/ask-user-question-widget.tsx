/**
 * AskUserQuestionWidget — Collapsible widget showing the question asked
 * and the user's answer in the message stream.
 *
 * Renders inline within the assistant message, showing:
 * - The question text
 * - The selected option (or custom text) when answered
 * - "Rejected" when the user dismissed the question
 *
 * Answers come from `toolInput.answers` (merged at approval time by
 * `mergeToolInputAnswers`) with `toolOutput` JSON as fallback.
 */
import { CheckCircle2, ChevronRight, MessageCircleQuestion, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface QuestionAnswer {
  question: string;
  answer: string;
}

interface AskUserQuestionWidgetProps {
  readonly questions: readonly Record<string, unknown>[];
  readonly answers?: Readonly<Record<string, string>> | undefined;
  readonly isRunning: boolean;
  readonly success: boolean | undefined;
  readonly output: string | undefined;
}

/** Build answer map — prefer injected answers, fall back to toolOutput JSON */
function resolveAnswers(
  injected: Readonly<Record<string, string>> | undefined,
  output: string | undefined
): Map<string, string> {
  // Primary: answers merged into toolInput at approval time
  if (injected !== undefined && Object.keys(injected).length > 0) {
    return new Map(Object.entries(injected));
  }

  // Fallback: parse toolOutput JSON (format varies by SDK version)
  if (!output) return new Map();
  try {
    const parsed: unknown = JSON.parse(output);
    if (typeof parsed !== 'object' || parsed === null) return new Map();

    const obj = parsed as Record<string, unknown>;
    const answersObj = obj['answers'];
    if (typeof answersObj !== 'object' || answersObj === null) return new Map();

    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(answersObj as Record<string, unknown>)) {
      if (typeof value === 'string') {
        map.set(key, value);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Extract question texts from tool input questions array */
function extractQuestions(questions: readonly Record<string, unknown>[]): string[] {
  const result: string[] = [];
  for (const q of questions) {
    const text = q['question'];
    if (typeof text === 'string') {
      result.push(text);
    }
  }
  return result;
}

export const AskUserQuestionWidget: FC<AskUserQuestionWidgetProps> = ({
  questions,
  answers: injectedAnswers,
  isRunning,
  success,
  output,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const isFailed = success === false;
  const isComplete = !isRunning && success !== undefined;

  const questionTexts = extractQuestions(questions);
  const answerMap = resolveAnswers(injectedAnswers, output);

  // Build question-answer pairs
  const pairs: QuestionAnswer[] = questionTexts.map((q) => ({
    question: q,
    answer: answerMap.get(q) ?? '',
  }));

  // Nothing to show
  if (pairs.length === 0) return null;

  const statusLabel = isRunning ? 'Asking question' : 'Asked question';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Collapsible header */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse question details' : 'Expand question details'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name */}
        <div className="flex items-center gap-2 shrink-0">
          <MessageCircleQuestion
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

          <span className={cn('text-sm font-medium truncate', 'text-lg-text-secondary')}>
            {statusLabel}
          </span>

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col">
              <div className="flex flex-row">
                {/* Gutter: vertical connector line — gradient to green/red like other tool widgets */}
                <div className="w-4 flex justify-center shrink-0">
                  <div
                    className={cn('w-[2px] rounded-full h-full', !isComplete && 'bg-lg-separator')}
                    style={
                      isComplete
                        ? {
                            background: isFailed
                              ? 'linear-gradient(to bottom, var(--lg-separator) 60%, color-mix(in oklch, #ef4444 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, var(--lg-separator) 60%, color-mix(in oklch, #22c55e 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-xl bg-lg-control overflow-hidden">
                  {pairs.map((pair, idx) => (
                    <div key={pair.question}>
                      <div className="px-3 py-2">
                        {/* Question text */}
                        <div className="text-sm text-foreground leading-snug">{pair.question}</div>

                        {/* Answer */}
                        {isComplete ? (
                          <div className="mt-1.5">
                            {isFailed ? (
                              <span className="inline-flex items-center gap-1 text-xs text-destructive/70 font-medium">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </span>
                            ) : pair.answer ? (
                              <span className="inline-block bg-lg-separator text-foreground text-xs font-medium px-2 py-0.5 rounded-md">
                                {pair.answer}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                No answer
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Separator between questions */}
                      {idx < pairs.length - 1 ? (
                        <div className="h-px bg-lg-separator mx-3" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom status indicator */}
              {isComplete ? (
                <div className="flex flex-row items-center py-1">
                  {isFailed ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500/80" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500/80" />
                  )}
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
                    {isFailed ? 'Rejected' : 'Answered'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1">
                  <div className="w-4 flex justify-center">
                    <div className="w-[2px] rounded-full h-full bg-border/20" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
