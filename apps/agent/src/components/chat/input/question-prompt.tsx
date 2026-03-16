import { ArrowRight, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface QuestionOptionItem {
  readonly label: string;
  readonly description: string;
}

export interface QuestionItem {
  readonly header: string;
  readonly prompt: string;
  readonly options: readonly QuestionOptionItem[];
  readonly multiple: boolean;
  readonly allowCustom: boolean;
}

interface QuestionPromptProps {
  readonly questions: readonly QuestionItem[];
  readonly onSubmit: (answers: readonly string[][]) => void;
  readonly onCancel: () => void;
  readonly onInvalid?: () => void;
}

const AUTO_ADVANCE_DELAY_MS = 150;

function buildAnswersForQuestion(
  question: QuestionItem,
  selectedOptionIndices: ReadonlySet<number>,
  customText: string
): string[] {
  const optionAnswers = Array.from(selectedOptionIndices)
    .sort((left, right) => left - right)
    .map((index) => question.options[index]?.label)
    .filter((label): label is string => label !== undefined);

  const trimmedCustomText = customText.trim();
  return trimmedCustomText.length > 0 ? [...optionAnswers, trimmedCustomText] : optionAnswers;
}

function restoreQuestionState(
  question: QuestionItem,
  storedAnswers: readonly string[]
): {
  readonly customText: string;
  readonly selectedOptionIndices: ReadonlySet<number>;
} {
  const indices = new Set<number>();
  const customAnswers: string[] = [];
  const optionLookup = new Map<string, number>();

  for (const [index, option] of question.options.entries()) {
    optionLookup.set(option.label, index);
  }

  for (const answer of storedAnswers) {
    const matchingIndex = optionLookup.get(answer);
    if (matchingIndex !== undefined) {
      indices.add(matchingIndex);
    } else {
      customAnswers.push(answer);
    }
  }

  return {
    customText: customAnswers.join(', '),
    selectedOptionIndices: indices,
  };
}

export const QuestionPrompt: FC<QuestionPromptProps> = ({
  questions,
  onSubmit,
  onCancel,
  onInvalid,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Map<number, string[]>>(() => new Map());
  const [selectedOptionIndices, setSelectedOptionIndices] = useState<Set<number>>(() => new Set());
  const [customText, setCustomText] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);
  const invalidFiredRef = useRef(false);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const currentAnswers = useMemo(() => {
    if (currentQuestion === undefined) {
      return [];
    }

    return buildAnswersForQuestion(currentQuestion, selectedOptionIndices, customText);
  }, [currentQuestion, customText, selectedOptionIndices]);

  const clearAutoAdvanceTimeout = useCallback((): void => {
    if (autoAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }, []);

  const storeAnswers = useCallback((index: number, answers: readonly string[]): void => {
    setSelectedAnswers((previous) => {
      const next = new Map(previous);
      if (answers.length === 0) {
        next.delete(index);
      } else {
        next.set(index, [...answers]);
      }
      return next;
    });
  }, []);

  const persistCurrentDraft = useCallback((): void => {
    if (currentQuestion === undefined) {
      return;
    }

    storeAnswers(currentIndex, currentAnswers);
  }, [currentAnswers, currentIndex, currentQuestion, storeAnswers]);

  const submitFromIndex = useCallback(
    (index: number, answersForCurrentQuestion: readonly string[]): void => {
      const allAnswers = new Map(selectedAnswers);
      if (answersForCurrentQuestion.length === 0) {
        allAnswers.delete(index);
      } else {
        allAnswers.set(index, [...answersForCurrentQuestion]);
      }

      onSubmit(
        questions.map((_question, questionIndex) => {
          return allAnswers.get(questionIndex) ?? [];
        })
      );
    },
    [onSubmit, questions, selectedAnswers]
  );

  const advanceTo = useCallback(
    (nextIndex: number): void => {
      clearAutoAdvanceTimeout();
      persistCurrentDraft();
      setCurrentIndex(nextIndex);
    },
    [clearAutoAdvanceTimeout, persistCurrentDraft]
  );

  const handleAdvance = useCallback(
    (answersForCurrentQuestion: readonly string[]): void => {
      if (currentQuestion === undefined) {
        return;
      }

      clearAutoAdvanceTimeout();
      storeAnswers(currentIndex, answersForCurrentQuestion);

      if (isLastQuestion) {
        submitFromIndex(currentIndex, answersForCurrentQuestion);
      } else {
        setCurrentIndex((previous) => previous + 1);
      }
    },
    [
      clearAutoAdvanceTimeout,
      currentIndex,
      currentQuestion,
      isLastQuestion,
      storeAnswers,
      submitFromIndex,
    ]
  );

  const handleOptionClick = useCallback(
    (optionIndex: number): void => {
      if (currentQuestion === undefined) {
        return;
      }

      if (currentQuestion.multiple) {
        setSelectedOptionIndices((previous) => {
          const next = new Set(previous);
          if (next.has(optionIndex)) {
            next.delete(optionIndex);
          } else {
            next.add(optionIndex);
          }
          return next;
        });
        return;
      }

      const nextSelection = new Set<number>([optionIndex]);
      const nextAnswers = buildAnswersForQuestion(currentQuestion, nextSelection, '');

      setSelectedOptionIndices(nextSelection);
      setCustomText('');
      storeAnswers(currentIndex, nextAnswers);
      clearAutoAdvanceTimeout();
      autoAdvanceTimeoutRef.current = window.setTimeout(() => {
        handleAdvance(nextAnswers);
      }, AUTO_ADVANCE_DELAY_MS);
    },
    [clearAutoAdvanceTimeout, currentIndex, currentQuestion, handleAdvance, storeAnswers]
  );

  const handleCustomSubmit = useCallback((): void => {
    if (currentQuestion === undefined) {
      return;
    }

    const nextAnswers = buildAnswersForQuestion(currentQuestion, selectedOptionIndices, customText);
    if (nextAnswers.length === 0) {
      return;
    }

    handleAdvance(nextAnswers);
  }, [currentQuestion, customText, handleAdvance, selectedOptionIndices]);

  useEffect(() => {
    clearAutoAdvanceTimeout();
    return () => {
      clearAutoAdvanceTimeout();
    };
  }, [clearAutoAdvanceTimeout]);

  useEffect(() => {
    if (questions.length === 0) {
      if (!invalidFiredRef.current) {
        invalidFiredRef.current = true;
        onInvalid?.();
      }
      return;
    }

    invalidFiredRef.current = false;
  }, [onInvalid, questions.length]);

  useEffect(() => {
    clearAutoAdvanceTimeout();
    setCurrentIndex(0);
    setSelectedAnswers(new Map());
    setSelectedOptionIndices(new Set());
    setCustomText('');
  }, [clearAutoAdvanceTimeout, questions]);

  useEffect(() => {
    if (questions.length === 0) {
      return;
    }

    setCurrentIndex((previous) => {
      const maxIndex = questions.length - 1;
      return previous > maxIndex ? maxIndex : previous;
    });
  }, [questions.length]);

  useEffect(() => {
    if (currentQuestion === undefined) {
      return;
    }

    const storedAnswersForQuestion = selectedAnswers.get(currentIndex) ?? [];
    const restoredState = restoreQuestionState(currentQuestion, storedAnswersForQuestion);
    setSelectedOptionIndices(new Set(restoredState.selectedOptionIndices));
    setCustomText(restoredState.customText);
  }, [currentIndex, currentQuestion, selectedAnswers]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearAutoAdvanceTimeout();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearAutoAdvanceTimeout, onCancel]);

  if (currentQuestion === undefined) {
    return null;
  }

  const continueButtonLabel = isLastQuestion ? 'Submit' : 'Continue';

  return (
    <div
      tabIndex={-1}
      className="relative z-10 flex flex-col overflow-hidden rounded-2xl bg-background/90 pt-4 outline-none backdrop-blur-md shadow-[0_0.25rem_1.25rem_hsl(var(--always-black,0_0%_0%)/7.5%),0_0_0_0.5px_hsla(var(--border)/0.3)]"
    >
      <div className="flex items-center gap-2 pl-5 pb-2 pr-3">
        <span className="flex-1 text-sm font-medium leading-snug text-foreground">
          {currentQuestion.prompt}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          {totalQuestions > 1 ? (
            <>
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => {
                  advanceTo(Math.max(0, currentIndex - 1));
                }}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-lg-control-hover disabled:opacity-30"
                aria-label="Previous question"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentIndex + 1} of {totalQuestions}
              </span>
              <button
                type="button"
                disabled={currentIndex === totalQuestions - 1}
                onClick={() => {
                  advanceTo(Math.min(totalQuestions - 1, currentIndex + 1));
                }}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-lg-control-hover disabled:opacity-30"
                aria-label="Next question"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => {
              clearAutoAdvanceTimeout();
              onCancel();
            }}
            className="ml-1 flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-lg-control-hover hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-1.5">
        <div className="flex flex-col">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedOptionIndices.has(index);

            return (
              <div key={`${String(currentIndex)}-${option.label}-${String(index)}`}>
                <button
                  type="button"
                  onClick={() => {
                    handleOptionClick(index);
                  }}
                  title={option.description.length > 0 ? option.description : undefined}
                  className={cn(
                    'group/row flex h-[3.25rem] w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left outline-none transition-transform duration-75 active:scale-[0.99]',
                    isSelected ? 'bg-foreground/8' : 'hover:bg-lg-control-hover'
                  )}
                >
                  <span
                    className={cn(
                      'relative flex size-[28px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-sm transition-colors',
                      isSelected
                        ? 'bg-foreground/10 text-foreground'
                        : 'bg-lg-control text-muted-foreground'
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {option.label}
                  </span>
                  <span
                    className="mr-1 shrink-0 text-sm text-muted-foreground/40 opacity-0 transition-opacity group-hover/row:opacity-100"
                    aria-hidden="true"
                  >
                    &rarr;
                  </span>
                </button>
                {index < currentQuestion.options.length - 1 ? (
                  <div className="mx-3 h-px bg-lg-control" />
                ) : null}
              </div>
            );
          })}
        </div>

        {currentQuestion.allowCustom || currentQuestion.multiple ? (
          <div className="mx-3 h-px bg-lg-control my-0.5" />
        ) : null}

        {currentQuestion.allowCustom ? (
          <div className="group/row flex h-[3.25rem] w-full items-center gap-3 px-3">
            <button
              type="button"
              className="relative flex size-[28px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-lg-control"
              onClick={() => {
                customInputRef.current?.focus();
              }}
              aria-label="Focus custom answer"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <input
              ref={customInputRef}
              placeholder="Something else"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
              type="text"
              value={customText}
              onChange={(event) => {
                setCustomText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && customText.trim().length > 0) {
                  event.preventDefault();
                  handleCustomSubmit();
                }
              }}
            />
            {customText.trim().length > 0 ? (
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground transition-colors hover:bg-foreground/15"
                aria-label="Submit custom answer"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        {currentQuestion.multiple ? (
          <div className="flex justify-end px-3 pt-2">
            <button
              type="button"
              onClick={() => {
                handleAdvance(currentAnswers);
              }}
              disabled={currentAnswers.length === 0}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                currentAnswers.length === 0
                  ? 'cursor-not-allowed bg-lg-control text-muted-foreground'
                  : 'bg-foreground text-background hover:opacity-90'
              )}
            >
              <span>{continueButtonLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
