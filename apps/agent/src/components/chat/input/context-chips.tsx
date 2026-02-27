import { Plus, X } from 'lucide-react';

import type { ContextItem } from '@/types/agent/context';
import type { FC, ReactNode } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { IconSkills } from '@/components/layout/primary-sidebar/components/IconSkills';
import { cn } from '@/lib/utils';

interface ContextChipsProps {
  readonly items: ContextItem[];
  readonly onRemove: (id: string) => void;
  readonly onAddClick?: () => void;
  readonly className?: string;
  readonly children?: ReactNode;
}

export const ContextChips: FC<ContextChipsProps> = ({
  items,
  onRemove,
  onAddClick,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-thin',
        className
      )}
    >
      {/* Add context button */}
      {onAddClick ? (
        <button
          onClick={onAddClick}
          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-[7px] border border-dashed border-foreground/15 hover:border-foreground/30 transition-colors shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span>Add context</span>
        </button>
      ) : null}

      {/* Extra chips (e.g. element context from browser selection) */}
      {children}

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
        'group flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs rounded-[7px] shrink-0 max-w-[200px] transition-all duration-150',
        isSkill
          ? 'bg-foreground/[0.06] hover:bg-foreground/[0.1] text-foreground/70 hover:text-foreground/90'
          : 'bg-foreground/[0.06] hover:bg-foreground/[0.1] text-foreground/70 hover:text-foreground/90'
      )}
    >
      {/* Icon: skill / image / file */}
      {isSkill ? (
        <IconSkills className="h-3.5 w-3.5 shrink-0 opacity-60" />
      ) : isImage && item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          className="h-5 w-5 object-cover rounded-[5px] shrink-0"
        />
      ) : (
        <FileIcon fileName={item.name} className="h-3.5 w-3.5 shrink-0" monochrome={false} />
      )}

      {/* Display name — skills prefixed with / */}
      <span className="truncate">{isSkill ? `/${item.name}` : item.name}</span>

      {/* Remove button — fades in on hover */}
      <button
        onClick={() => {
          onRemove(item.id);
        }}
        className="h-4 w-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 shrink-0 transition-opacity duration-150"
        title="Remove"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
};
