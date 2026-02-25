/**
 * AskUserQuestionModal — Interactive question card for SDK's AskUserQuestion tool.
 *
 * Renders inside the ChatInput box, overlaying the input area with a Claude.ai-style
 * question card showing numbered options, pagination for multiple questions,
 * and a "Something else" free-text input.
 *
 * Flow:
 *   1. SDK calls AskUserQuestion → permission:request arrives with questions in toolInput
 *   2. This component renders the questions one at a time
 *   3. User selects an option (or types custom text) for each question
 *   4. After last question answered → sends permission:response with answers map
 */
import { ArrowRight, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { FC } from 'react';

// ============================================
// Types — mirrors SDK's AskUserQuestionInput
// ============================================

interface QuestionOption {
  readonly label: string;
  readonly description: string;
}

interface Question {
  readonly question: string;
  readonly header: string;
  readonly options: readonly QuestionOption[];
  readonly multiSelect: boolean;
}

interface AskUserQuestionModalProps {
  readonly request: PermissionRequest;
  readonly onApprove: (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ) => void;
  readonly onDeny: (requestId: string) => void;
}

// ============================================
// Helpers
// ============================================

/** Type guard for raw question objects from tool input */
function isRawQuestion(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'question' in value && 'options' in value;
}

/** Type guard for raw option objects from tool input */
function isRawOption(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'label' in value;
}

/** Parse and validate questions from the tool input. Returns empty array on invalid data. */
function parseQuestions(toolInput: Record<string, unknown>): Question[] {
  const raw = toolInput['questions'];
  if (!Array.isArray(raw)) return [];

  const items = raw as unknown[];
  const questions: Question[] = [];
  for (const item of items) {
    if (!isRawQuestion(item)) continue;
    if (typeof item['question'] !== 'string') continue;
    if (!Array.isArray(item['options'])) continue;

    const rawOpts = item['options'] as unknown[];
    const options: QuestionOption[] = [];
    for (const rawOpt of rawOpts) {
      if (!isRawOption(rawOpt)) continue;
      if (typeof rawOpt['label'] !== 'string') continue;
      options.push({
        label: rawOpt['label'],
        description: typeof rawOpt['description'] === 'string' ? rawOpt['description'] : '',
      });
    }

    const headerVal = item['header'];
    const multiVal = item['multiSelect'];
    questions.push({
      question: item['question'],
      header: typeof headerVal === 'string' ? headerVal : '',
      options,
      multiSelect: multiVal === true,
    });
  }
  return questions;
}

// ============================================
// Component
// ============================================

export const AskUserQuestionModal: FC<AskUserQuestionModalProps> = ({
  request,
  onApprove,
  onDeny,
}) => {
  const questions = useMemo(() => parseQuestions(request.toolInput), [request.toolInput]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Reset selection state when navigating between questions
  useEffect(() => {
    setSelectedOption(null);
    setCustomText('');
    // Restore previous answer if navigating back
    if (currentQuestion) {
      const prev = answers[currentQuestion.question];
      if (prev !== undefined) {
        const optIdx = currentQuestion.options.findIndex((o) => o.label === prev);
        if (optIdx >= 0) {
          setSelectedOption(optIdx);
        } else {
          setCustomText(prev);
        }
      }
    }
  }, [currentIndex, currentQuestion, answers]);

  /** Submit all answers and approve the permission */
  const submitAnswers = useCallback(
    (finalAnswers: Record<string, string>) => {
      onApprove(request.requestId, false, finalAnswers);
    },
    [request.requestId, onApprove]
  );

  /** Record answer for current question, advance or submit */
  const selectAnswer = useCallback(
    (answerText: string) => {
      if (!currentQuestion) return;

      const updated = { ...answers, [currentQuestion.question]: answerText };
      setAnswers(updated);

      if (isLastQuestion) {
        submitAnswers(updated);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    },
    [currentQuestion, answers, isLastQuestion, submitAnswers]
  );

  /** Handle clicking a numbered option */
  const handleOptionClick = useCallback(
    (index: number) => {
      if (!currentQuestion) return;
      const option = currentQuestion.options[index];
      if (!option) return;

      setSelectedOption(index);
      // Small delay for visual feedback before advancing
      setTimeout(() => {
        selectAnswer(option.label);
      }, 150);
    },
    [currentQuestion, selectAnswer]
  );

  /** Handle submitting custom text */
  const handleCustomSubmit = useCallback(() => {
    if (customText.trim()) {
      selectAnswer(customText.trim());
    }
  }, [customText, selectAnswer]);

  /** Dismiss = deny the permission (stops the agent) */
  const handleDismiss = useCallback(() => {
    onDeny(request.requestId);
  }, [request.requestId, onDeny]);

  /** Keyboard: Enter submits custom text, Escape dismisses */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDismiss]);

  // Guard: if no valid questions, fall back to simple approve.
  // Moved to useEffect to avoid side effects during render (React Strict Mode safety).
  const fallbackFired = useRef(false);
  useEffect(() => {
    if ((totalQuestions === 0 || !currentQuestion) && !fallbackFired.current) {
      fallbackFired.current = true;
      onApprove(request.requestId);
    }
  }, [totalQuestions, currentQuestion, onApprove, request.requestId]);

  if (totalQuestions === 0 || !currentQuestion) {
    return null;
  }

  return (
    <div
      tabIndex={-1}
      className="flex flex-col bg-background/90 backdrop-blur-md relative z-10 rounded-2xl outline-none overflow-hidden pt-4 shadow-[0_0.25rem_1.25rem_hsl(var(--always-black,0_0%_0%)/7.5%),0_0_0_0.5px_hsla(var(--border)/0.3)]"
    >
      {/* Header: Question text + pagination + close */}
      <div className="flex items-center gap-2 pl-5 pb-2 pr-3">
        <span className="flex-1 text-foreground font-medium text-sm leading-snug">
          {currentQuestion.question}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          {totalQuestions > 1 ? (
            <>
              <button
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex((i) => Math.max(0, i - 1));
                }}
                className="size-6 flex items-center justify-center rounded-md text-muted-foreground disabled:opacity-30 hover:bg-lg-control-hover transition-colors"
                aria-label="Previous question"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {currentIndex + 1} of {totalQuestions}
              </span>
              <button
                disabled={currentIndex === totalQuestions - 1}
                onClick={() => {
                  setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1));
                }}
                className="size-6 flex items-center justify-center rounded-md text-muted-foreground disabled:opacity-30 hover:bg-lg-control-hover transition-colors"
                aria-label="Next question"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}

          <button
            onClick={handleDismiss}
            className="size-5 flex items-center justify-center rounded-md text-muted-foreground hover:bg-lg-control-hover hover:text-foreground transition-colors ml-1"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Options list */}
      <div className="flex-1 p-1.5">
        <div className="flex flex-col">
          {currentQuestion.options.map((option, idx) => (
            <div key={option.label}>
              <button
                type="button"
                onClick={() => {
                  handleOptionClick(idx);
                }}
                className={`group/row flex w-full items-center gap-3 h-[3.25rem] px-3 text-left cursor-pointer rounded-2xl outline-none transition-transform duration-75 active:scale-[0.99] ${
                  selectedOption === idx ? 'bg-foreground/8' : 'hover:bg-lg-control-hover'
                }`}
              >
                <span
                  className={`relative flex size-[28px] shrink-0 items-center justify-center rounded-[10px] overflow-hidden text-sm transition-colors ${
                    selectedOption === idx
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-lg-control text-muted-foreground'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm truncate text-foreground">
                  {option.label}
                </span>
                <span
                  className="text-muted-foreground/40 text-sm shrink-0 mr-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </button>
              {idx < currentQuestion.options.length - 1 ? (
                <div className="h-px bg-lg-control mx-3" />
              ) : null}
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="h-px bg-lg-control mx-3 my-0.5" />

        {/* "Something else" row */}
        <div className="group/row flex w-full items-center gap-3 h-[3.25rem] px-3">
          <span className="relative flex size-[28px] shrink-0 items-center justify-center rounded-[10px] overflow-hidden bg-lg-control">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <input
            ref={customInputRef}
            placeholder="Something else"
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none ring-0 border-0 shadow-none focus:ring-0 focus:outline-none focus:border-0 focus:shadow-none"
            type="text"
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customText.trim()) {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
          />
          {customText.trim() ? (
            <button
              onClick={handleCustomSubmit}
              className="size-7 flex items-center justify-center rounded-lg transition-colors bg-foreground/10 hover:bg-foreground/15 text-foreground shrink-0"
              type="button"
              aria-label="Submit"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
