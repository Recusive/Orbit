import { createLogger } from '@orbit/common/lib';
import { open } from '@tauri-apps/plugin-shell';
import { Loader2, X } from 'lucide-react';
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
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-accent-11"
                aria-hidden="true"
              >
                <path
                  d="M5.29536 20.7808C5.17536 20.7808 5.08538 20.7807 4.84538 20.7607C3.39538 20.6907 2.22537 19.4507 2.24537 18.0007C2.24537 17.5907 2.58537 17.2607 2.99537 17.2607H3.00538C3.41538 17.2607 3.74537 17.6108 3.74537 18.0208C3.73537 18.6608 4.27536 19.2307 4.92536 19.2607C5.23536 19.2807 5.23536 19.2808 5.51536 19.2708C5.76536 19.2708 6.20537 19.2607 7.18537 19.2607C7.06537 18.6007 6.79538 17.9807 6.38538 17.4407C5.82538 16.7007 5.02538 16.1607 4.13538 15.9207C3.91538 15.8607 3.72536 15.7007 3.64536 15.4807C3.55536 15.2707 3.57537 15.0208 3.68537 14.8208C4.24537 13.8508 4.92538 12.6708 5.72538 11.2908C5.91538 10.9708 6.30537 10.8307 6.65537 10.9707C8.46537 11.7007 9.99537 12.9408 11.0854 14.5608C12.0354 15.9708 12.5954 17.5807 12.7254 19.2607H15.2354C14.9554 14.7707 12.2154 10.7508 8.08537 8.86084C7.89537 8.77084 7.74537 8.61063 7.68537 8.40063C7.62537 8.20063 7.64538 7.98078 7.75538 7.80078L9.59538 4.62085C10.0554 3.77085 11.0054 3.2207 11.9954 3.2207C12.9854 3.2207 13.9254 3.78062 14.4054 4.64062L21.5054 16.8906C21.5054 16.8906 21.5354 16.9507 21.5554 16.9907C21.8954 17.8307 21.7954 18.7908 21.2954 19.5508C20.7854 20.3008 19.9154 20.7708 19.0154 20.7708C18.5554 20.7708 17.5654 20.7708 16.7954 20.7708H12.0054C11.5954 20.7708 11.2554 20.4308 11.2554 20.0208C11.2554 18.3708 10.7654 16.7806 9.84538 15.4106C9.04538 14.2206 7.96537 13.2706 6.68537 12.6406C6.22537 13.4406 5.80536 14.1708 5.42536 14.8108C6.26536 15.2008 7.00536 15.8008 7.57536 16.5408C8.33536 17.5308 8.74537 18.7707 8.74537 20.0107C8.74537 20.4207 8.40537 20.7607 7.99537 20.7607C6.44537 20.7607 5.83538 20.7608 5.53538 20.7708C5.42538 20.7708 5.34538 20.7708 5.28538 20.7708L5.29536 20.7808ZM16.7454 19.2607H16.8054C17.5654 19.2607 18.5454 19.2607 19.0054 19.2607C19.4154 19.2607 19.8154 19.0507 20.0454 18.7107C20.2654 18.3807 20.3154 17.9508 20.1754 17.5808L13.0954 5.37085C12.8754 4.97085 12.4354 4.71069 11.9954 4.71069C11.5554 4.71069 11.1154 4.97083 10.9054 5.35083L9.45536 7.85083C13.6954 10.1108 16.4754 14.4507 16.7454 19.2507V19.2607Z"
                  fill="currentColor"
                />
              </svg>
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
