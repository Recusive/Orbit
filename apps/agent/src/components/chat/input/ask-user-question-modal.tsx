import { useCallback, useMemo } from 'react';

import { QuestionPrompt } from './question-prompt';

import type { QuestionItem } from './question-prompt';
import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { FC } from 'react';

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

function isRawQuestion(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'question' in value && 'options' in value;
}

function isRawOption(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'label' in value;
}

function parseQuestions(toolInput: Record<string, unknown>): Question[] {
  const rawQuestions = toolInput['questions'];
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  const questions: Question[] = [];
  for (const item of rawQuestions) {
    if (!isRawQuestion(item)) {
      continue;
    }
    if (typeof item['question'] !== 'string' || !Array.isArray(item['options'])) {
      continue;
    }

    const options: QuestionOption[] = [];
    for (const rawOption of item['options']) {
      if (!isRawOption(rawOption) || typeof rawOption['label'] !== 'string') {
        continue;
      }

      options.push({
        label: rawOption['label'],
        description: typeof rawOption['description'] === 'string' ? rawOption['description'] : '',
      });
    }

    questions.push({
      question: item['question'],
      header: typeof item['header'] === 'string' ? item['header'] : '',
      options,
      multiSelect: item['multiSelect'] === true,
    });
  }

  return questions;
}

export const AskUserQuestionModal: FC<AskUserQuestionModalProps> = ({
  request,
  onApprove,
  onDeny,
}) => {
  const questions = useMemo(() => parseQuestions(request.toolInput), [request.toolInput]);

  const items = useMemo<readonly QuestionItem[]>(() => {
    return questions.map((question) => ({
      header: question.header,
      prompt: question.question,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description,
      })),
      multiple: question.multiSelect,
      allowCustom: true,
    }));
  }, [questions]);

  const handleSubmit = useCallback(
    (answersByIndex: readonly string[][]): void => {
      const answersMap: Record<string, string> = {};

      for (const [index, question] of questions.entries()) {
        const selectedAnswers = answersByIndex[index];
        if (selectedAnswers !== undefined && selectedAnswers.length > 0) {
          answersMap[question.question] = selectedAnswers.join(', ');
        }
      }

      onApprove(request.requestId, false, answersMap);
    },
    [onApprove, questions, request.requestId]
  );

  const handleCancel = useCallback((): void => {
    onDeny(request.requestId);
  }, [onDeny, request.requestId]);

  const handleInvalid = useCallback((): void => {
    onApprove(request.requestId);
  }, [onApprove, request.requestId]);

  return (
    <QuestionPrompt
      questions={items}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onInvalid={handleInvalid}
    />
  );
};
