/**
 * FileContextMenu - Right-click context menu for file tree items
 *
 * Provides standard file operations: copy path, rename, delete, reveal in Finder.
 * Uses Radix ContextMenu primitives (same pattern as TerminalContextMenu, ConversationMenu).
 */
import {
  Clipboard,
  ClipboardCopy,
  ExternalLink,
  FolderOpen,
  Pencil,
  TextCursorInput,
  Trash2,
} from 'lucide-react';

import type { FC, ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { openInDefaultApp, revealInFileManager } from '@/lib/api';
import { getPathName, toRelativePath } from '@/lib/utils/path-utils';
import { useFileStore } from '@/stores/file/file-store';

interface FileContextMenuProps {
  readonly children: ReactNode;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly onRename: () => void;
  readonly onDelete: () => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export const FileContextMenu: FC<FileContextMenuProps> = ({
  children,
  path,
  isDirectory,
  onRename,
  onDelete,
  onOpenChange,
}) => {
  const rootPath = useFileStore((s) => s.rootPath);
  const fileName = getPathName(path);

  const handleCopyPath = (): void => {
    void navigator.clipboard.writeText(path);
  };

  const handleCopyRelativePath = (): void => {
    if (rootPath !== null) {
      const relative = toRelativePath(path, rootPath);
      if (relative !== null) {
        void navigator.clipboard.writeText(relative.length > 0 ? relative : fileName);
        return;
      }
      void navigator.clipboard.writeText(path);
    } else {
      void navigator.clipboard.writeText(path);
    }
  };

  const handleCopyName = (): void => {
    void navigator.clipboard.writeText(fileName);
  };

  const handleRevealInFinder = (): void => {
    void revealInFileManager(path);
  };

  const handleOpenInDefaultApp = (): void => {
    void openInDefaultApp(path);
  };

  return (
    <ContextMenu {...(onOpenChange !== undefined && { onOpenChange })}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {/* Open actions */}
        {!isDirectory ? (
          <>
            <ContextMenuItem onSelect={handleOpenInDefaultApp}>
              <ExternalLink />
              Open in Default App
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {/* Clipboard actions */}
        <ContextMenuItem onSelect={handleCopyPath}>
          <Clipboard />
          Copy Path
          <ContextMenuShortcut>⌥⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopyRelativePath}>
          <ClipboardCopy />
          Copy Relative Path
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopyName}>
          <TextCursorInput />
          Copy Name
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Reveal */}
        <ContextMenuItem onSelect={handleRevealInFinder}>
          <FolderOpen />
          Reveal in Finder
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Edit actions */}
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 />
          Delete
          <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
