import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PermissionRequest } from '@/stores/agent/tool-store';

import { AskUserQuestionModal } from '@/components/chat/input/ask-user-question-modal';

function createRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    requestId: 'request-1',
    sessionId: 'session-1',
    toolName: 'AskUserQuestion',
    toolInput: {
      questions: [
        {
          question: 'Which path should I use?',
          header: 'Path',
          options: [
            { label: 'apps/agent', description: 'Frontend app' },
            { label: 'src-tauri', description: 'Rust app' },
          ],
          multiSelect: false,
        },
      ],
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('AskUserQuestionModal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the parsed question and options from tool input', () => {
    render(<AskUserQuestionModal request={createRequest()} onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByText('Which path should I use?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apps\/agent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /src-tauri/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Something else')).toBeInTheDocument();
  });

  it('converts presenter answers into the Claude answers map on submit', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    render(
      <AskUserQuestionModal
        request={createRequest({
          toolInput: {
            questions: [
              {
                question: 'Select targets',
                header: 'Targets',
                options: [
                  { label: 'apps/agent', description: 'Frontend app' },
                  { label: 'apps/common', description: 'Shared code' },
                ],
                multiSelect: true,
              },
            ],
          },
        })}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /apps\/agent/i }));
    await user.click(screen.getByRole('button', { name: /apps\/common/i }));
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(onApprove).toHaveBeenCalledWith('request-1', false, {
      'Select targets': 'apps/agent, apps/common',
    });
  });

  it('denies the request when dismissed', async () => {
    const user = userEvent.setup();
    const onDeny = vi.fn();

    render(<AskUserQuestionModal request={createRequest()} onApprove={vi.fn()} onDeny={onDeny} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDeny).toHaveBeenCalledWith('request-1');
  });

  it('auto-approves invalid question payloads to preserve the existing fallback', async () => {
    const onApprove = vi.fn();

    render(
      <AskUserQuestionModal
        request={createRequest({ toolInput: { questions: [] } })}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith('request-1');
    });
  });
});
