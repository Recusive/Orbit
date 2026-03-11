import { useMemo, useState } from 'react';

import type { OcQuestionAnswer, OcQuestionRequest } from '@/types/opencode';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OcQuestionCardProps {
  readonly question: OcQuestionRequest;
  readonly onReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  readonly onReject: (requestId: string) => Promise<void>;
}

export const OcQuestionCard: FC<OcQuestionCardProps> = ({ question, onReply, onReject }) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [customValues, setCustomValues] = useState<Record<number, string>>({});

  const answers = useMemo(() => {
    return question.questions.map((_item, index): OcQuestionAnswer => {
      const selected = selectedOptions[index] ?? [];
      const customValue = customValues[index]?.trim();
      if (customValue) {
        return [...selected, customValue];
      }
      return selected;
    });
  }, [customValues, question.questions, selectedOptions]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-4 py-3">
      <div className="text-sm font-medium text-foreground">Additional input required</div>
      <div className="mt-3 space-y-4">
        {question.questions.map((item, index) => {
          const selected = selectedOptions[index] ?? [];

          return (
            <div key={`${question.id}-${item.header}-${String(index)}`} className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.header}
                </div>
                <div className="mt-1 text-sm text-foreground">{item.question}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.options.map((option: { label: string; description: string }) => {
                  const isSelected = selected.includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition-colors',
                        isSelected
                          ? 'border-foreground/20 bg-foreground text-background'
                          : 'border-border bg-control-fill text-foreground hover:bg-control-fill-hover'
                      )}
                      onClick={() => {
                        setSelectedOptions((current) => {
                          const currentValues = current[index] ?? [];
                          const nextValues = item.multiple
                            ? currentValues.includes(option.label)
                              ? currentValues.filter((value) => value !== option.label)
                              : [...currentValues, option.label]
                            : [option.label];

                          return {
                            ...current,
                            [index]: nextValues,
                          };
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {item.custom !== false ? (
                <Input
                  value={customValues[index] ?? ''}
                  onChange={(event) => {
                    setCustomValues((current) => ({
                      ...current,
                      [index]: event.target.value,
                    }));
                  }}
                  placeholder="Custom answer"
                  className="h-9"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            void onReply(question.id, answers);
          }}
        >
          Submit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void onReject(question.id);
          }}
        >
          Reject
        </Button>
      </div>
    </div>
  );
};
