import type { FC } from 'react';

interface ToolInlinePreviewProps {
  /** One-line summary text to display in the collapsed tool header */
  readonly text: string;
}

/**
 * Inline preview strip shown in collapsed tool headers.
 * Fills remaining horizontal space between tool info and chevron.
 * Renders as a subtle, translucent box with monospace text.
 */
export const ToolInlinePreview: FC<ToolInlinePreviewProps> = ({ text }) => {
  if (!text) return <div className="flex-1" />;

  return (
    <div className="flex-1 min-w-0 mx-1.5">
      <div className="h-[22px] rounded-md bg-foreground/[0.04] flex items-center px-2 overflow-hidden">
        <span className="text-[11px] font-mono text-gray-9 truncate leading-none">{text}</span>
      </div>
    </div>
  );
};
