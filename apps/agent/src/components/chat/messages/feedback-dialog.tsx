import { createLogger } from '@orbit/common/lib';
import { open } from '@tauri-apps/plugin-shell';
import { Bug, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { enhanceBugReport } from '@/lib/api/agent';

const logger = createLogger('FeedbackDialog');

const BUG_REPORT_URL =
  'https://github.com/Recusive/Orbit/issues/new?labels=bug&template=bug_report.md';

interface FeedbackDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly messageContent: string;
}

export const FeedbackDialog: FC<FeedbackDialogProps> = ({
  open: isOpen,
  onOpenChange,
  messageContent,
}) => {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state and autofocus on open
  // Skip autofocus on touch devices — opens keyboard unexpectedly
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setIsLoading(false);
      const isTouchDevice = 'ontouchstart' in window;
      if (!isTouchDevice) {
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 50);
      }
    }
  }, [isOpen]);

  const openGitHubIssue = useCallback(
    (title?: string, body?: string): void => {
      let url = BUG_REPORT_URL;
      if (title !== undefined && body !== undefined) {
        const params = new URLSearchParams({
          labels: 'bug',
          title,
          body,
        });
        url = `https://github.com/Recusive/Orbit/issues/new?${params.toString()}`;
      }
      void open(url);
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const handleSubmit = useCallback((): void => {
    if (description.trim().length === 0) return;

    setIsLoading(true);

    const truncatedContent =
      messageContent.length > 500 ? `${messageContent.slice(0, 500)}...` : messageContent;

    enhanceBugReport(description, truncatedContent)
      .then((resultJson) => {
        const result = JSON.parse(resultJson) as { title: string; body: string };
        openGitHubIssue(result.title, result.body);
      })
      .catch((error: unknown) => {
        logger.warn('Failed to enhance bug report, falling back to plain URL', { error });
        openGitHubIssue();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [description, messageContent, openGitHubIssue]);

  // Cmd+Enter / Ctrl+Enter to submit (forms-controls: keyboard submission)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const isSubmitDisabled = description.trim().length === 0 || isLoading;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContentGlass className="liquid-glass-dialog gap-0 overflow-hidden p-0 bg-chat-area border-0 shadow-none">
        {/* Content — macOS 26 alert layout: padding 20px 16px 16px, gap 16px */}
        <div
          className="relative flex flex-col items-center"
          style={{ padding: '20px 16px 16px', gap: 16 }}
        >
          {/* Icon + Title + Description + Close — tighter internal gap */}
          <div
            className="flex w-full flex-col items-start"
            style={{ padding: '0 6px 2px', gap: 10 }}
          >
            {/* Close button — top-right inside padded area */}
            <DialogClose className="absolute right-[22px] top-[20px] z-10 rounded-[9px] p-1.5 bg-foreground/6 text-muted-foreground transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text active:bg-destructive-subtle-hover">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
            <div
              className="liquid-glass-icon flex shrink-0 items-center justify-center bg-accent-9/10"
              style={{ filter: 'none' }}
            >
              <Bug className="h-7 w-7 text-accent-11" aria-hidden="true" />
            </div>
            <DialogTitle className="liquid-glass-title w-full">Report an Issue</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              Describe the problem and we&apos;ll create a structured bug report for you.
            </DialogDescription>
          </div>

          {/* Textarea — glass input surface */}
          <div className="w-full" style={{ padding: '0 6px' }}>
            <textarea
              ref={textareaRef}
              placeholder="What went wrong?"
              value={description}
              onChange={(e): void => {
                setDescription(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              rows={4}
              disabled={isLoading}
              className="liquid-glass-textarea w-full resize-none"
              spellCheck={false}
            />
          </div>

          {/* Buttons — pill-shaped, 32px height, gap 8px */}
          <div className="flex w-full items-center" style={{ gap: 8 }}>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Enhancing&hellip;
                </span>
              ) : (
                'Enhance & Report'
              )}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
