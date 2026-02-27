import {
  CheckCircle2,
  ChevronRight,
  Globe,
  Loader2,
  Monitor,
  MousePointerClick,
  Navigation,
  ScrollText,
  Type,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface BrowserToolWidgetProps {
  /** Raw tool name from SDK (may be MCP-prefixed like mcp__orbit-browser__browser_open) */
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenUrl?: (url: string) => void;
}

interface StepLabel {
  /** Text before the link, e.g., "Navigate to " */
  readonly text: string;
  /** Optional URL to render as a clickable link */
  readonly linkUrl?: string | undefined;
  /** Display text for the link (e.g., hostname), falls back to linkUrl */
  readonly linkText?: string | undefined;
}

/**
 * Extract the action name from an MCP-prefixed or plain tool name.
 * e.g., "mcp__orbit-browser__browser_open" → "browser_open"
 *       "browser_navigate" → "browser_navigate"
 */
function extractActionName(toolName: string): string {
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return parts.slice(2).join('__');
  }
  return toolName;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Get a small icon for the step row based on action type */
function getStepIcon(actionName: string): ReactNode {
  const cls = 'h-4 w-4 text-violet-500/70';
  switch (actionName) {
    case 'browser_open':
      return <Monitor className={cls} />;
    case 'browser_navigate':
      return <Navigation className={cls} />;
    case 'browser_click':
      return <MousePointerClick className={cls} />;
    case 'browser_type':
      return <Type className={cls} />;
    case 'browser_get_text':
    case 'browser_get_html':
    case 'browser_console_logs':
      return <ScrollText className={cls} />;
    case 'browser_screenshot':
      return <Monitor className={cls} />;
    default:
      return <Globe className={cls} />;
  }
}

/**
 * Build a human-readable step label from the action + input.
 * Returns structured data so URLs can be rendered as clickable links.
 */
function getStepLabel(
  actionName: string,
  toolInput: Record<string, unknown>,
  isRunning: boolean
): StepLabel {
  const url = typeof toolInput['url'] === 'string' ? toolInput['url'] : null;
  const selector = typeof toolInput['selector'] === 'string' ? toolInput['selector'] : null;
  const script = typeof toolInput['script'] === 'string' ? toolInput['script'] : null;

  switch (actionName) {
    case 'browser_open':
      return url
        ? {
            text: isRunning ? 'Opening browser → ' : 'Open browser → ',
            linkUrl: url,
            linkText: getHostname(url),
          }
        : { text: isRunning ? 'Opening browser' : 'Open browser' };
    case 'browser_navigate':
      return url
        ? {
            text: isRunning ? 'Navigating to ' : 'Navigate to ',
            linkUrl: url,
            linkText: getHostname(url),
          }
        : { text: isRunning ? 'Navigating to page' : 'Navigate to page' };
    case 'browser_click':
      return {
        text: isRunning ? `Clicking ${selector ?? 'element'}` : `Click ${selector ?? 'element'}`,
      };
    case 'browser_type':
      return {
        text: isRunning
          ? `Typing${selector ? ` into ${selector}` : ''}`
          : `Type text${selector ? ` into ${selector}` : ''}`,
      };
    case 'browser_get_text':
      return { text: isRunning ? 'Extracting text' : 'Get text' };
    case 'browser_get_html':
      return { text: isRunning ? 'Extracting HTML' : 'Get HTML' };
    case 'browser_console_logs':
      return { text: isRunning ? 'Reading console logs' : 'Read console logs' };
    case 'browser_screenshot':
      return { text: isRunning ? 'Capturing viewport' : 'Capture viewport' };
    case 'browser_back':
      return { text: isRunning ? 'Going back' : 'Go back' };
    case 'browser_forward':
      return { text: isRunning ? 'Going forward' : 'Go forward' };
    case 'browser_reload':
      return { text: isRunning ? 'Reloading page' : 'Reload page' };
    case 'browser_close':
      return { text: isRunning ? 'Closing browser' : 'Close browser' };
    case 'browser_eval':
      return {
        text: isRunning
          ? 'Running script'
          : `Run script${script ? `: ${script.slice(0, 60)}${script.length > 60 ? '…' : ''}` : ''}`,
      };
    default:
      return { text: actionName.replace(/^browser_/, '').replace(/_/g, ' ') };
  }
}

export const BrowserToolWidget: FC<BrowserToolWidgetProps> = ({
  toolName,
  toolInput,
  isRunning = false,
  success,
  onOpenUrl,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const actionName = extractActionName(toolName);
  const stepLabel = getStepLabel(actionName, toolInput, isRunning);
  const stepIcon = getStepIcon(actionName);

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Collapsed header — "Browser" */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Browser output' : 'Expand Browser output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <Globe
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

          <span
            className={cn(
              'text-sm font-medium shrink-0',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-lg-text-secondary'
            )}
          >
            Browser
          </span>

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
          ) : null}

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Expanded — vertical timeline of steps */}
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
              {/* Connector line: header icon → step icon */}
              <div className="flex flex-row mb-1">
                <div className="w-4 flex justify-center shrink-0">
                  <div className="w-[2px] rounded-full h-3 bg-violet-500/30" />
                </div>
              </div>

              {/* Step row: action icon + label */}
              <div className="flex flex-row items-center">
                {stepIcon}
                <span className="ml-2.5 text-xs text-lg-text-secondary min-w-0 truncate">
                  {stepLabel.text}
                  {stepLabel.linkUrl ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenUrl?.(stepLabel.linkUrl ?? '');
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-transparent bg-border/50 text-secondary-foreground hover:bg-border/70 transition-[color,box-shadow] overflow-hidden gap-1 px-2 py-0.5 font-normal text-xs ml-1"
                    >
                      {stepLabel.linkText ?? stepLabel.linkUrl}
                    </button>
                  ) : null}
                </span>
                {isRunning ? (
                  <Loader2 className="ml-1.5 h-2.5 w-2.5 animate-spin text-lg-text-secondary/60 shrink-0" />
                ) : null}
              </div>

              {/* Connector line: step icon → status icon (gap via my-1) */}
              <div className="flex flex-row my-1">
                <div className="w-4 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-3',
                      success === undefined && 'bg-violet-500/20'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, #8b5cf6 30%, transparent), color-mix(in oklch, #22c55e 50%, transparent))'
                              : 'linear-gradient(to bottom, color-mix(in oklch, #8b5cf6 30%, transparent), color-mix(in oklch, #ef4444 50%, transparent))',
                          }
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Bottom status row */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center pb-1">
                  {isFailed ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500/80" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500/80" />
                  )}
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : isRunning ? (
                <div className="flex flex-row items-center pb-1">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500/60" />
                  <span className="ml-2.5 text-xs text-muted-foreground">Working…</span>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
