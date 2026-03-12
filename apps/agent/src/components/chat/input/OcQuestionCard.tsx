import { useCallback, useMemo, useState } from 'react';

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
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const answers = useMemo(() => {
    return question.questions.map((_item, index): OcQuestionAnswer => {
      const values = selected[index] ?? [];
      const value = custom[index]?.trim();
      return value ? [...values, value] : values;
    });
  }, [custom, question.questions, selected]);

  const submit = useCallback((): void => {
    void onReply(question.id, answers);
  }, [answers, onReply, question.id]);

  return (
    <div data-oc-question className="rounded-xl border border-border/60 bg-card/80 px-4 py-3">
      <div className="text-sm font-medium text-foreground">Additional input required</div>
      <div className="mt-3 space-y-4">
        {question.questions.map((item, index) => {
          const values = selected[index] ?? [];

          return (
            <div key={`${question.id}-${item.header}-${String(index)}`} className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.header}
                </div>
                <div className="mt-1 text-sm text-foreground">{item.question}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.options.map((option) => {
                  const isSelected = values.includes(option.label);
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
                        setSelected((state) => {
                          const current = state[index] ?? [];
                          const next = item.multiple
                            ? current.includes(option.label)
                              ? current.filter((value) => value !== option.label)
                              : [...current, option.label]
                            : [option.label];

                          return {
                            ...state,
                            [index]: next,
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
                  value={custom[index] ?? ''}
                  onChange={(event) => {
                    setCustom((state) => ({
                      ...state,
                      [index]: event.target.value,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
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
        <Button size="sm" onClick={submit}>
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
