import { Plus, X } from 'lucide-react';

import type { ContextItem } from '@/types/context';
import type { FC } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { cn } from '@/lib/utils';

interface ContextChipsProps {
  readonly items: ContextItem[];
  readonly onRemove: (id: string) => void;
  readonly onAddClick?: () => void;
  readonly className?: string;
}

export const ContextChips: FC<ContextChipsProps> = ({
  items,
  onRemove,
  onAddClick,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto scrollbar-thin',
        className
      )}
    >
      {/* Add context button */}
      {onAddClick ? (
        <button
          onClick={onAddClick}
          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md border border-dashed border-border hover:border-foreground/30 transition-colors shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span>Add context</span>
        </button>
      ) : null}

      {/* Context chips */}
      {items.map((item) => (
        <ContextChip key={item.id} item={item} onRemove={onRemove} />
      ))}
    </div>
  );
};

interface ContextChipProps {
  readonly item: ContextItem;
  readonly onRemove: (id: string) => void;
}

const ContextChip: FC<ContextChipProps> = ({ item, onRemove }) => {
  const isImage = item.type === 'image';

  return (
    <div
      className="group flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs bg-muted/50 hover:bg-muted rounded-md border border-border/50 transition-colors shrink-0 max-w-[180px]"
    >
      {/* Image thumbnail or file icon */}
      {isImage && item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          className="h-5 w-5 object-cover rounded-sm shrink-0"
        />
      ) : (
        <FileIcon
          fileName={item.name}
          className="h-3.5 w-3.5"
          monochrome={false}
        />
      )}

      {/* File name */}
      <span className="truncate text-foreground/80">{item.name}</span>

      {/* Remove button - slides in on hover */}
      <button
        onClick={() => { onRemove(item.id); }}
        className="h-4 w-4 flex items-center justify-center rounded transition-all opacity-0 group-hover:opacity-100 hover:bg-accent shrink-0 -mr-0.5"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
