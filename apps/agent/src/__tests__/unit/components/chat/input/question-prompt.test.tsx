import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { QuestionItem } from '@/components/chat/input/question-prompt';

import { QuestionPrompt } from '@/components/chat/input/question-prompt';

function createQuestion(overrides: Partial<QuestionItem> = {}): QuestionItem {
  return {
    header: 'Header',
    prompt: 'Choose an option',
    options: [
      { label: 'Option A', description: 'First option' },
      { label: 'Option B', description: 'Second option' },
    ],
    multiple: false,
    allowCustom: true,
    ...overrides,
  };
}

describe('QuestionPrompt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits a single-select answer after the auto-advance delay', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();

    render(
      <QuestionPrompt questions={[createQuestion()]} onSubmit={onSubmit} onCancel={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Option A/i }));
    await vi.advanceTimersByTimeAsync(160);

    expect(onSubmit).toHaveBeenCalledWith([['Option A']]);
  });

  it('accumulates multi-select answers and advances explicitly before final submit', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();

    render(
      <QuestionPrompt
        questions={[
          createQuestion({
            prompt: 'Select all that apply',
            multiple: true,
            allowCustom: false,
          }),
          createQuestion({
            prompt: 'Choose the follow-up',
            options: [{ label: 'Later', description: 'Answer later' }],
          }),
        ]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Option A/i }));
    fireEvent.click(screen.getByRole('button', { name: /Option B/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue/i }));

    expect(screen.getByText('Choose the follow-up')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Later/i }));
    await vi.advanceTimersByTimeAsync(160);

    expect(onSubmit).toHaveBeenCalledWith([['Option A', 'Option B'], ['Later']]);
  });

  it('submits selected options and custom text together for multi-select questions', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuestionPrompt
        questions={[
          createQuestion({
            prompt: 'Select and add context',
            multiple: true,
          }),
        ]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Option A/i }));
    await user.type(screen.getByPlaceholderText('Something else'), 'Custom note');
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    expect(onSubmit).toHaveBeenCalledWith([['Option A', 'Custom note']]);
  });

  it('hides the custom row when allowCustom is false', () => {
    render(
      <QuestionPrompt
        questions={[createQuestion({ allowCustom: false })]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText('Something else')).not.toBeInTheDocument();
  });

  it('submits custom text from the keyboard when allowCustom is true', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuestionPrompt
        questions={[createQuestion({ options: [] })]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Something else');
    await user.type(input, 'Typed answer');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith([['Typed answer']]);
  });

  it('calls onInvalid instead of onSubmit when no questions are available', async () => {
    const onSubmit = vi.fn();
    const onInvalid = vi.fn();

    render(
      <QuestionPrompt questions={[]} onSubmit={onSubmit} onCancel={vi.fn()} onInvalid={onInvalid} />
    );

    await waitFor(() => {
      expect(onInvalid).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports pagination controls and shows the page counter', async () => {
    const user = userEvent.setup();

    render(
      <QuestionPrompt
        questions={[
          createQuestion({ prompt: 'First question' }),
          createQuestion({ prompt: 'Second question' }),
        ]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('First question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next question' }));

    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Second question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous question' }));

    expect(screen.getByText('First question')).toBeInTheDocument();
  });

  it('cancels when Escape is pressed', () => {
    const onCancel = vi.fn();

    render(
      <QuestionPrompt questions={[createQuestion()]} onSubmit={vi.fn()} onCancel={onCancel} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
