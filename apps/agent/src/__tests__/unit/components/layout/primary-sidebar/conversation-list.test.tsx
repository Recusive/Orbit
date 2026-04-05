import { fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { ConversationList } from '@/components/layout/primary-sidebar/components/ConversationList';

vi.mock('@/components/sidebar', () => ({
  ConversationContextMenu: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  ConversationDropdownMenu: () => null,
}));

vi.mock('@/stores/ui', () => ({
  useIsTitleLoading: () => false,
}));

describe('ConversationList prefetch wiring', () => {
  it('prefetches on hover and keyboard focus without changing click behavior', () => {
    const onLoadConversation = vi.fn();
    const onPrefetchConversation = vi.fn();

    render(
      <ConversationList
        conversations={[
          {
            sessionId: 'session-1',
            title: 'Session One',
            updatedAt: 1,
            messageCount: 2,
          },
        ]}
        expanded
        activeConversationId={null}
        editingConversationId={null}
        onLoadConversation={onLoadConversation}
        onPrefetchConversation={onPrefetchConversation}
        onStartEditConversation={vi.fn()}
        onRenameConversation={vi.fn()}
        onCancelEditConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onDuplicateConversation={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Session One' });

    fireEvent.pointerEnter(button);
    expect(onPrefetchConversation).toHaveBeenCalledWith('session-1');

    fireEvent.focus(button);
    expect(onPrefetchConversation).toHaveBeenCalledTimes(2);

    fireEvent.click(button);
    expect(onLoadConversation).toHaveBeenCalledWith('session-1');
  });
});
