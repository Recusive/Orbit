import { useEffect, useRef } from 'react';

import type { FileEntry } from '@/types/agent/context';
import type { FC } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils/utils';

// Measurable interface expected by Radix Popover
interface Measurable {
  getBoundingClientRect(): DOMRect;
}

interface MentionPopoverProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (file: FileEntry) => void;
  readonly files: FileEntry[];
  readonly anchorRef: React.RefObject<HTMLElement | null>;
  readonly selectedIndex: number;
  readonly onSelectedIndexChange: (index: number) => void;
}

export const MentionPopover: FC<MentionPopoverProps> = ({
  open,
  onOpenChange,
  query,
  onSelect,
  files,
  anchorRef,
  selectedIndex,
}) => {
  // Filter files based on query
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(query.toLowerCase()) ||
      file.path.toLowerCase().includes(query.toLowerCase())
  );

  // Separate files and folders, then combine for flat index access
  const folders = filteredFiles.filter((f) => f.isDirectory).slice(0, 5);
  const regularFiles = filteredFiles.filter((f) => !f.isDirectory).slice(0, 10);
  const allItems = [...folders, ...regularFiles];

  const handleSelect = (file: FileEntry): void => {
    onSelect(file);
    onOpenChange(false);
  };

  // Cast the anchor ref to Measurable (HTMLElement has getBoundingClientRect)
  const measurableRef = anchorRef as React.RefObject<Measurable>;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={measurableRef} />
      <PopoverContent
        className="w-[320px] p-0 rounded-lg border-border/50 bg-popover/98 backdrop-blur-sm shadow-lg"
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <Command shouldFilter={false} className="rounded-lg bg-transparent">
          <CommandList className="scroll-py-2">
            {allItems.length === 0 ? <CommandEmpty>No files found.</CommandEmpty> : null}

            {/* Folders group */}
            {folders.length > 0 ? (
              <CommandGroup
                heading="Folders"
                className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {folders.map((folder, idx) => (
                  <FileItem
                    key={folder.path}
                    file={folder}
                    isSelected={selectedIndex === idx}
                    isFirst={idx === 0}
                    isLast={regularFiles.length === 0 && idx === folders.length - 1}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {/* Files group */}
            {regularFiles.length > 0 ? (
              <CommandGroup
                heading="Files"
                className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {regularFiles.map((file, idx) => (
                  <FileItem
                    key={file.path}
                    file={file}
                    isSelected={selectedIndex === folders.length + idx}
                    isFirst={folders.length === 0 && idx === 0}
                    isLast={idx === regularFiles.length - 1}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Export helper to get filtered items count
export const getFilteredFilesCount = (files: FileEntry[], query: string): number => {
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(query.toLowerCase()) ||
      file.path.toLowerCase().includes(query.toLowerCase())
  );
  const folders = filteredFiles.filter((f) => f.isDirectory).slice(0, 5);
  const regularFiles = filteredFiles.filter((f) => !f.isDirectory).slice(0, 10);
  return folders.length + regularFiles.length;
};

// Export helper to get file at index
export const getFileAtIndex = (
  files: FileEntry[],
  query: string,
  index: number
): FileEntry | null => {
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(query.toLowerCase()) ||
      file.path.toLowerCase().includes(query.toLowerCase())
  );
  const folders = filteredFiles.filter((f) => f.isDirectory).slice(0, 5);
  const regularFiles = filteredFiles.filter((f) => !f.isDirectory).slice(0, 10);
  const allItems = [...folders, ...regularFiles];
  return allItems[index] ?? null;
};

interface FileItemProps {
  readonly file: FileEntry;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelect: (file: FileEntry) => void;
}

const FileItem: FC<FileItemProps> = ({ file, isSelected, isFirst, isLast, onSelect }) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected
  useEffect(() => {
    if (isSelected && itemRef.current) {
      const el = itemRef.current;
      const container = el.closest('[cmdk-list]');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        if (isFirst || elRect.top < containerRect.top) {
          // Scroll to show item at top with padding
          container.scrollTop = el.offsetTop - 8;
        } else if (isLast || elRect.bottom > containerRect.bottom) {
          // Scroll to show item at bottom with padding
          container.scrollTop = el.offsetTop - container.clientHeight + el.offsetHeight + 8;
        }
      }
    }
  }, [isSelected, isFirst, isLast]);

  // Get the directory path without the filename
  const dirPath = file.path.split('/').slice(0, -1).join('/');

  return (
    <div
      ref={itemRef}
      onClick={() => {
        onSelect(file);
      }}
      className={cn(
        'relative flex cursor-pointer gap-2.5 select-none items-center px-2.5 py-2 outline-none transition-all duration-150',
        isSelected
          ? 'rounded-r-md bg-primary/10 text-foreground border-l-2 border-primary/60 pl-2'
          : 'rounded-md hover:bg-muted/50 active:scale-[0.99]'
      )}
    >
      <FileIcon
        fileName={file.isDirectory ? `${file.name}/` : file.name}
        className="h-4 w-4 shrink-0"
        monochrome={false}
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-base font-medium">{file.name}</span>
        {dirPath ? (
          <span className="truncate text-sm text-muted-foreground/60">{dirPath}</span>
        ) : null}
      </div>
    </div>
  );
};
