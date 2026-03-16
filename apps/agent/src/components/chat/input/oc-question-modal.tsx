import { createLogger } from '@orbit/common/lib';
import { useCallback, useMemo } from 'react';

import { QuestionPrompt } from './question-prompt';

import type { QuestionItem } from './question-prompt';
import type { OcQuestionAnswer, OcQuestionRequest } from '@/types/opencode';
import type { FC } from 'react';

const logger = createLogger('OcQuestionModal');

interface OcQuestionModalProps {
  readonly question: OcQuestionRequest;
  readonly onReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  readonly onReject: (requestId: string) => Promise<void>;
}

export const OcQuestionModal: FC<OcQuestionModalProps> = ({ question, onReply, onReject }) => {
  const items = useMemo<readonly QuestionItem[]>(() => {
    return question.questions.map((item) => ({
      header: item.header,
      prompt: item.question,
      options: item.options.map((option) => ({
        label: option.label,
        description: option.description,
      })),
      multiple: item.multiple ?? false,
      allowCustom: item.custom !== false,
    }));
  }, [question.questions]);

  const handleSubmit = useCallback(
    (answersByIndex: readonly string[][]): void => {
      const answers: OcQuestionAnswer[] = answersByIndex.map((answer) => [...answer]);
      void onReply(question.id, answers);
    },
    [onReply, question.id]
  );

  const handleCancel = useCallback((): void => {
    void onReject(question.id);
  }, [onReject, question.id]);

  const handleInvalid = useCallback((): void => {
    logger.warn('OpenCode question has empty questions, rejecting request', {
      requestId: question.id,
    });
    void onReject(question.id);
  }, [onReject, question.id]);

  return (
    <QuestionPrompt
      questions={items}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onInvalid={handleInvalid}
    />
  );
};
