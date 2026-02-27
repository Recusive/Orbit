import { fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { FileContextMenu } from '@/components/files/file-context-menu';
import { isAddFileChipDetail } from '@/lib/events/chat-context-events';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('FileContextMenu Add to Chat', () => {
  beforeEach(() => {
    usePendingContextStore.setState({ pending: [] });
  });

  it('renders the "Add to Chat" menu item', () => {
    render(
      <FileContextMenu
        path="/repo/src/app.ts"
        isDirectory={false}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>row</div>
      </FileContextMenu>
    );

    expect(screen.getByRole('button', { name: /add to chat/i })).toBeInTheDocument();
  });

  it('enqueues the correct file chip payload when clicked', () => {
    render(
      <FileContextMenu
        path="/repo/src/app.ts"
        isDirectory={false}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>row</div>
      </FileContextMenu>
    );

    fireEvent.click(screen.getByRole('button', { name: /add to chat/i }));

    expect(usePendingContextStore.getState().pending).toEqual([
      {
        path: '/repo/src/app.ts',
        name: 'app.ts',
        isDirectory: false,
      },
    ]);
  });

  it('enqueued payload passes isAddFileChipDetail guard', () => {
    render(
      <FileContextMenu path="/repo/src" isDirectory={true} onRename={vi.fn()} onDelete={vi.fn()}>
        <div>row</div>
      </FileContextMenu>
    );

    fireEvent.click(screen.getByRole('button', { name: /add to chat/i }));

    const detail = usePendingContextStore.getState().pending[0];
    expect(detail).toEqual({
      path: '/repo/src',
      name: 'src',
      isDirectory: true,
    });
    expect(isAddFileChipDetail(detail)).toBe(true);
  });
});
