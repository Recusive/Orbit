/**
 * BranchSelector - Branch picker with search and create+checkout flow
 *
 * Source-control header trigger that opens a BranchPickerContent popover.
 * The CreateBranchDialog is rendered as a sibling to the Popover (not inside it)
 * so it doesn't unmount when the popover closes.
 */
import { IconBranch } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBranch';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import type { GitBranch, GitStatus } from '@/lib/api';
import type { FC } from 'react';

import { BranchPickerContent, CreateBranchDialog } from '@/components/git/branch-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface BranchSelectorProps {
  readonly status: GitStatus;
  readonly branches: GitBranch[];
  readonly isCheckingOut: boolean;
  readonly onCheckout: (branch: string) => void;
  readonly onCreateAndCheckout: (branchName: string) => Promise<void>;
}

export const BranchSelector: FC<BranchSelectorProps> = ({
  status,
  branches,
  isCheckingOut,
  onCheckout,
  onCreateAndCheckout,
}) => {
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suggestedName, setSuggestedName] = useState('');
  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches]);

  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    setOpen(nextOpen);
  }, []);

  const handleClose = useCallback((): void => {
    setOpen(false);
  }, []);

  const handleRequestCreate = useCallback((name: string): void => {
    setSuggestedName(name);
    setCreateDialogOpen(true);
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={isCheckingOut || branches.length === 0}
            className="flex items-center gap-1.5 text-[12px] min-w-0 hover:bg-lg-control-hover data-[state=open]:bg-lg-control-hover rounded-[9px] px-2.5 py-1 active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-40"
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <IconBranch className="h-4 w-4 shrink-0" />
            )}
            <span
              className={cn(
                'font-medium truncate',
                !status.branch && 'text-muted-foreground italic'
              )}
            >
              {status.branch || 'No commits yet'}
            </span>
            {branches.length > 0 ? (
              <ChevronDown className="h-[11px] w-[11px] shrink-0 text-muted-foreground" />
            ) : null}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[260px] p-0 bg-white/70 dark:bg-lg-control/80 backdrop-blur-sm dark:backdrop-blur-xl border-white dark:border-white/5 rounded-[9px] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1),0_8px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <BranchPickerContent
            currentBranch={status.branch}
            branches={localBranches}
            onCheckout={onCheckout}
            onRequestCreate={handleRequestCreate}
            onClose={handleClose}
          />
        </PopoverContent>
      </Popover>

      <CreateBranchDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={onCreateAndCheckout}
        suggestedName={suggestedName}
      />
    </>
  );
};
