import { Copy, ClipboardPaste, Eraser, Pencil, Search, Trash2 } from 'lucide-react';

import type { FC, ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';

interface TerminalContextMenuProps {
  readonly children: ReactNode;
  readonly onCopy: () => void;
  readonly onPaste: () => void;
  readonly onClear: () => void;
  readonly onFind?: () => void;
  readonly onRename: () => void;
  readonly onKill: () => void;
  readonly hasSelection?: boolean;
}

export const TerminalContextMenu: FC<TerminalContextMenuProps> = ({
  children,
  onCopy,
  onPaste,
  onClear,
  onFind,
  onRename,
  onKill,
  hasSelection = false,
}) => {
  return (
    <ContextMenu>
      {children}
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onCopy} disabled={!hasSelection}>
          <Copy />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onPaste}>
          <ClipboardPaste />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onClear}>
          <Eraser />
          Clear Terminal
        </ContextMenuItem>
        {onFind ? (
          <ContextMenuItem onSelect={onFind}>
            <Search />
            Find...
            <ContextMenuShortcut>⌘F</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={onKill} className="text-destructive focus:text-destructive">
          <Trash2 />
          Kill Terminal
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
