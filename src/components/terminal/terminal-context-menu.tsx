import { Clipboard, ClipboardPaste, Eraser, Pencil, Search, Trash2 } from 'lucide-react';

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
        <ContextMenuItem onClick={onCopy} disabled={!hasSelection}>
          <Clipboard className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onPaste}>
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onClear}>
          <Eraser className="mr-2 h-4 w-4" />
          Clear Terminal
        </ContextMenuItem>
        {onFind ? (
          <ContextMenuItem onClick={onFind}>
            <Search className="mr-2 h-4 w-4" />
            Find...
            <ContextMenuShortcut>⌘F</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={onKill} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Kill Terminal
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
