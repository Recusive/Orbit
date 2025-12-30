import type { FC } from 'react';

export interface FilePathProps {
  path: string;
  maxLength?: number;
  showTooltip?: boolean;
  className?: string;
}

export const FilePath: FC<FilePathProps> = ({
  path,
  maxLength = 60,
  showTooltip = true,
  className = '',
}) => {
  const truncatePath = (fullPath: string, max: number): string => {
    if (fullPath.length <= max) return fullPath;

    const parts = fullPath.split('/');
    if (parts.length <= 2) {
      // If only 1-2 parts, just truncate the middle
      const start = fullPath.slice(0, Math.floor(max / 2) - 2);
      const end = fullPath.slice(-Math.floor(max / 2) + 2);
      return `${start}...${end}`;
    }

    // Keep first and last parts, truncate middle
    const first = parts[0] ?? '';
    const last = parts[parts.length - 1] ?? '';
    const remaining = max - first.length - last.length - 6; // account for "/.../""

    if (remaining <= 0) {
      return `${first}/.../${last}`;
    }

    // Try to include some middle parts
    let middle = parts.slice(1, -1).join('/');
    if (middle.length > remaining) {
      middle = middle.slice(0, remaining - 3) + '...';
    }

    return `${first}/${middle}/${last}`;
  };

  const displayPath = truncatePath(path, maxLength);

  return (
    <span
      className={`font-mono text-sm text-muted-foreground ${className}`}
      title={showTooltip ? path : undefined}
    >
      {displayPath}
    </span>
  );
};
