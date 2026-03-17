import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { OcQuestionRequest } from '@/types/opencode';

import { OcQuestionModal } from '@/components/chat/input/oc-question-modal';

function createQuestion(overrides: Partial<OcQuestionRequest> = {}): OcQuestionRequest {
  return {
    id: 'question-1',
    sessionID: 'session-1',
    questions: [
      {
        question: 'Select the files to update',
        header: 'Files',
        options: [
          { label: 'apps/agent', description: 'Frontend app' },
          { label: 'apps/common', description: 'Shared package' },
        ],
        multiple: true,
        custom: false,
      },
    ],
    ...overrides,
  };
}

describe('OcQuestionModal', () => {
  it('preserves multiple/custom settings and forwards positional answers on submit', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn().mockResolvedValue(undefined);

    render(<OcQuestionModal question={createQuestion()} onReply={onReply} onReject={vi.fn()} />);

    expect(screen.queryByPlaceholderText('Something else')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /apps\/agent/i }));
    await user.click(screen.getByRole('button', { name: /apps\/common/i }));
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(onReply).toHaveBeenCalledWith('question-1', [['apps/agent', 'apps/common']]);
  });

  it('rejects the request when dismissed', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn().mockResolvedValue(undefined);

    render(<OcQuestionModal question={createQuestion()} onReply={vi.fn()} onReject={onReject} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onReject).toHaveBeenCalledWith('question-1');
  });

  it('rejects invalid question payloads instead of replying with empty answers', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);

    render(
      <OcQuestionModal
        question={createQuestion({ questions: [] })}
        onReply={vi.fn()}
        onReject={onReject}
      />
    );

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith('question-1');
    });
  });
});
