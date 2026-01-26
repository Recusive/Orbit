/**
 * PlanToolWidget - Displays plan files with markdown preview
 *
 * This widget is used when the SDK writes to ~/.claude/plans/ during plan mode.
 * Instead of showing raw diff lines like WriteToolWidget, it renders the plan
 * content as formatted markdown for better readability.
 */
import { ChevronDown, ClipboardList, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Stable plugin arrays - defined outside component to prevent recreation on each render
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: never[] = [];

interface PlanToolWidgetProps {
  readonly filePath: string;
  readonly content: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string) => void;
}

export const PlanToolWidget: FC<PlanToolWidgetProps> = ({
  filePath,
  content,
  isRunning = false,
  success,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // Plans start expanded
  const isFailed = success === false;

  const fileName = filePath.split('/').pop() ?? filePath;

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-[border-color,opacity,box-shadow] duration-200',
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
            : 'border-2 border-dotted border-mode-plan/40', // Match input box in plan mode
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          aria-expanded={isExpanded}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 transition-colors duration-150"
        >
          {/* Icon container - amber/plan mode color */}
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              isFailed ? 'bg-destructive/10' : 'bg-mode-plan/10'
            )}
          >
            <ClipboardList
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/70' : 'text-mode-plan/70',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          {/* Plan info */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span
              className={cn(
                'text-xs font-medium',
                isFailed ? 'text-muted-foreground line-through' : 'text-mode-plan'
              )}
            >
              Plan
            </span>
            <span
              className={cn(
                'text-xs font-medium hover:underline truncate cursor-pointer',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground/80'
              )}
              onClick={handleFileClick}
              title={filePath}
            >
              {fileName}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span className="text-sm">Creating plan...</span>
              </div>
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : (
              <span className="text-xs text-mode-plan/60">Ready for review</span>
            )}
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Markdown preview */}
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              style={{ overflow: 'hidden' }}
            >
              <div className="overflow-auto max-h-[400px] bg-mode-plan/5 border-t border-mode-plan/20">
                <div className="p-3">
                  {content.trim() ? (
                    <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none">
                      <Streamdown
                        remarkPlugins={REMARK_PLUGINS}
                        rehypePlugins={REHYPE_PLUGINS}
                        mode="static"
                      >
                        {content}
                      </Streamdown>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground/60 italic">
                      Plan content is empty
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
