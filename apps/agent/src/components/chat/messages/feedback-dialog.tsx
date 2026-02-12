import { createLogger } from '@orbit/common/lib';
import { open } from '@tauri-apps/plugin-shell';
import { Bug, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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

  // Focus textarea when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setIsLoading(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
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

    // Truncate messageContent to ~500 chars to keep the prompt reasonable
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" aria-hidden="true" />
            Report an Issue
          </DialogTitle>
          <DialogDescription>
            Describe the problem and we&apos;ll create a structured bug report for you.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          ref={textareaRef}
          placeholder="What went wrong? (e.g., 'The response was completely off-topic' or 'It suggested code that doesn't compile')"
          value={description}
          onChange={(e): void => {
            setDescription(e.target.value);
          }}
          rows={4}
          className="resize-none"
          disabled={isLoading}
        />

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={description.trim().length === 0 || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Enhancing...
              </>
            ) : (
              'Enhance & Report'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
