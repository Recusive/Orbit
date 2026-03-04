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
import { ChevronRight, MessageCircleQuestion, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_ENTER, TOOL_EXPAND_EXIT, TOOL_EXPAND_TRANSITION_NONE } from './shared';

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
          'cursor-pointer w-full text-left rounded-xl'
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

          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

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
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
          >
            {/* Content */}
            <div className="min-w-0 my-1.5 rounded-xl bg-lg-control overflow-hidden">
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
                          <span className="text-xs text-muted-foreground italic">No answer</span>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Separator between questions */}
                  {idx < pairs.length - 1 ? <div className="h-px bg-lg-separator mx-3" /> : null}
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
