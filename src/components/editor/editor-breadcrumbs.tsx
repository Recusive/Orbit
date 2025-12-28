import { ChevronRight, File, Hash } from 'lucide-react';
import { useMemo } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Document symbol/outline item
export interface OutlineItem {
  label: string;
  kind: 'heading' | 'function' | 'class' | 'method' | 'property' | 'variable';
  level?: number; // For headings: 1-6
  line: number;
}

interface EditorBreadcrumbsProps {
  readonly filePath: string;
  readonly outline?: OutlineItem[];
  readonly activeOutlineIndex?: number;
  readonly onPathClick?: (path: string) => void;
  readonly onOutlineClick?: (item: OutlineItem, index: number) => void;
}

interface BreadcrumbItemProps {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly isLast?: boolean;
  readonly onClick?: () => void;
}

const BreadcrumbItem: FC<BreadcrumbItemProps> = ({ label, icon, isLast, onClick }) => {
  return (
    <>
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-1.5 px-1 py-0.5 rounded text-xs transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          isLast && 'text-foreground'
        )}
      >
        {icon}
        <span className="truncate max-w-[120px]">{label}</span>
      </button>
      {!isLast && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
    </>
  );
};

// Extract headings from markdown content
export function extractMarkdownOutline(content: string): OutlineItem[] {
  const lines = content.split('\n');
  const outline: OutlineItem[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  lines.forEach((line, index) => {
    const match = headingRegex.exec(line);
    if (match?.[1] && match[2]) {
      const level = match[1].length;
      // Include the # symbols in the label like VS Code/Cursor does
      const label = `${match[1]} ${match[2].trim()}`;
      outline.push({
        label,
        kind: 'heading',
        level,
        line: index,
      });
    }
  });

  return outline;
}

// Get icon for outline item
function getOutlineIcon(item: OutlineItem): React.ReactNode {
  if (item.kind === 'heading') {
    return <Hash className="h-3 w-3 shrink-0 opacity-60" />;
  }
  // Add more icons for other kinds as needed
  return <Hash className="h-3 w-3 shrink-0 opacity-60" />;
}

export const EditorBreadcrumbs: FC<EditorBreadcrumbsProps> = ({
  filePath,
  outline = [],
  activeOutlineIndex,
  onPathClick,
  onOutlineClick,
}) => {
  // Extract just the filename from the path
  const fileName = useMemo(() => {
    const parts = filePath.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? filePath;
  }, [filePath]);

  // Get active outline items (path from root to current position)
  const activeOutlinePath = useMemo((): { item: OutlineItem; index: number }[] => {
    if (!outline.length || activeOutlineIndex === undefined || activeOutlineIndex < 0) {
      return [];
    }

    // For headings, build hierarchy based on level
    const result: { item: OutlineItem; index: number }[] = [];
    const activeItem = outline[activeOutlineIndex];

    if (!activeItem) {
      return [];
    }

    if (activeItem.kind === 'heading') {
      // Find parent headings (lower level numbers)
      const currentLevel = activeItem.level ?? 1;

      // Walk backwards to find parent headings
      for (let i = activeOutlineIndex; i >= 0; i--) {
        const item = outline[i];
        if (item?.kind === 'heading') {
          const itemLevel = item.level ?? 1;
          // Include this item if it's a parent (lower level) or the current item
          if (itemLevel < currentLevel || i === activeOutlineIndex) {
            // Check if we should add this (don't add if we already have same or lower level)
            const firstItem = result[0];
            const shouldAdd = !firstItem || (firstItem.item.level ?? 1) > itemLevel;
            if (shouldAdd) {
              result.unshift({ item, index: i });
            }
          }
        }
      }
    } else {
      // For non-headings, just show the item
      result.push({ item: activeItem, index: activeOutlineIndex });
    }

    return result;
  }, [outline, activeOutlineIndex]);

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-background border-b border-border overflow-x-auto scrollbar-hide">
      {/* Filename */}
      <BreadcrumbItem
        label={fileName}
        icon={<File className="h-3 w-3 shrink-0 opacity-60" />}
        isLast={activeOutlinePath.length === 0}
        onClick={(): void => onPathClick?.(filePath)}
      />

      {/* Outline items (document structure) */}
      {activeOutlinePath.map(({ item, index }, i) => (
        <BreadcrumbItem
          key={`outline-${String(index)}`}
          label={item.label}
          icon={getOutlineIcon(item)}
          isLast={i === activeOutlinePath.length - 1}
          onClick={(): void => onOutlineClick?.(item, index)}
        />
      ))}
    </div>
  );
};
