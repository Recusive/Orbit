/**
 * PlanToolWidget - Displays plan files with markdown preview
 *
 * This widget is used when the SDK writes to ~/.claude/plans/ during plan mode.
 * Instead of showing raw diff lines like WriteToolWidget, it renders the plan
 * content as formatted markdown for better readability.
 */
import { ChevronDown, ClipboardList, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// Disable Streamdown's built-in link safety modal (desktop app opens URLs via Tauri)
const LINK_SAFETY_DISABLED = { enabled: false } as const;

// Stable plugin arrays - defined outside component to prevent recreation on each render
// This is critical for Streamdown performance as it compares plugin arrays by reference
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
  const shouldReduceMotion = useReducedMotion();

  const fileName = filePath.split('/').pop() ?? filePath;

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row with plan-mode accent */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Plan output' : 'Expand Plan output'}
        aria-expanded={isExpanded}
        className={cn(
          'group/status flex items-center gap-2 py-1.5 px-2.5 text-sm',
          'transition-colors duration-150 cursor-pointer w-full text-left',
          'rounded-lg hover:bg-muted/40',
          isFailed
            ? 'border-2 border-dotted border-destructive/40'
            : 'border-2 border-dotted border-mode-plan/40'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center shrink-0',
            'transition-colors duration-150',
            isFailed
              ? 'bg-destructive/8 group-hover/status:bg-destructive/12'
              : 'bg-mode-plan/8 group-hover/status:bg-mode-plan/12'
          )}
        >
          <ClipboardList
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-mode-plan/60 group-hover/status:text-mode-plan/80',
              isRunning && 'animate-pulse'
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
              'text-xs font-medium truncate cursor-pointer hover:underline',
              isFailed ? 'text-muted-foreground line-through' : 'text-foreground/80'
            )}
            onClick={handleFileClick}
            title={filePath}
          >
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <span className="text-xs">Creating plan...</span>
            </div>
          ) : !isFailed ? (
            <span className="text-xs text-mode-plan/60">Ready for review</span>
          ) : null}
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/70 transition-transform duration-200 ease-out shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col">
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div className="w-[2px] rounded-full h-full bg-mode-plan/30" />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-mode-plan/20 bg-mode-plan/5 overflow-hidden">
                  <div className="overflow-auto max-h-[400px]">
                    <div className="p-3">
                      {content.trim() ? (
                        <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown
                            remarkPlugins={REMARK_PLUGINS}
                            rehypePlugins={REHYPE_PLUGINS}
                            linkSafety={LINK_SAFETY_DISABLED}
                            mode="static"
                          >
                            {content}
                          </Streamdown>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground/40 italic">
                          Plan content is empty
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom connector stub */}
              <div className="flex flex-row h-1 px-2.5">
                <div className="w-5 flex justify-center">
                  <div className="w-[2px] rounded-full h-full bg-mode-plan/15" />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
