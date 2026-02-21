import { Plus, X } from 'lucide-react';

import type { ContextItem } from '@/types/agent/context';
import type { FC } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { IconSkills } from '@/components/layout/primary-sidebar/components/IconSkills';
import { cn } from '@/lib/utils';

interface ContextChipsProps {
  readonly items: ContextItem[];
  readonly onRemove: (id: string) => void;
  readonly onAddClick?: () => void;
  readonly className?: string;
}

export const ContextChips: FC<ContextChipsProps> = ({ items, onRemove, onAddClick, className }) => {
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
  const isSkill = item.type === 'skill';

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs rounded-md border transition-colors shrink-0 max-w-[180px]',
        isSkill
          ? 'bg-foreground/8 hover:bg-foreground/12 border-foreground/20'
          : 'bg-lg-control hover:bg-lg-control-hover border-lg-border'
      )}
    >
      {/* Icon: skill / image / file */}
      {isSkill ? (
        <IconSkills className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
      ) : isImage && item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          className="h-5 w-5 object-cover rounded-md shrink-0"
        />
      ) : (
        <FileIcon fileName={item.name} className="h-3.5 w-3.5" monochrome={false} />
      )}

      {/* Display name — skills prefixed with / */}
      <span className="truncate text-foreground/80">{isSkill ? `/${item.name}` : item.name}</span>

      {/* Remove button - slides in on hover */}
      <button
        onClick={() => {
          onRemove(item.id);
        }}
        className="h-4 w-4 flex items-center justify-center rounded transition-opacity opacity-0 group-hover:opacity-100 hover:bg-lg-control-hover shrink-0 -mr-0.5"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
