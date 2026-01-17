/**
 * BranchSelector - Branch dropdown with checkout functionality
 */
import { Check, ChevronDown, GitBranch, Loader2 } from 'lucide-react';
import React from 'react';

import type { GitStatus } from '@/lib/api';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}

interface BranchSelectorProps {
  status: GitStatus;
  branches: BranchInfo[];
  isCheckingOut: boolean;
  onCheckout: (branch: string) => void;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  status,
  branches,
  isCheckingOut,
  onCheckout,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isCheckingOut || branches.length === 0}
        className="flex items-center gap-1.5 text-sm min-w-0 hover:bg-muted/50 rounded-md px-2 py-1 -ml-2 active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-40"
      >
        {isCheckingOut ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground/70" />
        ) : (
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}
        <span
          className={cn('font-medium truncate', !status.branch && 'text-muted-foreground italic')}
        >
          {status.branch || 'No commits yet'}
        </span>
        {branches.length > 0 ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.name}
            onClick={() => {
              if (branch.name !== status.branch) {
                onCheckout(branch.name);
              }
            }}
            className="flex items-center gap-2"
          >
            {branch.isCurrent ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <span className="w-3.5" />
            )}
            <span className="truncate">{branch.name}</span>
            {branch.upstream ? (
              <span className="text-xs text-muted-foreground ml-auto">→ {branch.upstream}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
