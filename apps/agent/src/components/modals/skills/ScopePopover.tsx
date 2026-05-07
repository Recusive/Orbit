import { Folder, Loader2, Plus, User } from 'lucide-react';
import { useState } from 'react';

import type { ComponentType, FC } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ScopePopoverProps {
  readonly hasWorkspace: boolean;
  readonly isInstalling: boolean;
  readonly onSelectScope: (scope: 'project' | 'personal') => void;
}

interface ScopeOptionButtonProps {
  readonly disabled?: boolean;
  readonly icon: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly ariaLabel: string;
  readonly description: string;
  readonly onClick: () => void;
}

const ScopeOptionButton: FC<ScopeOptionButtonProps> = ({
  disabled = false,
  icon: Icon,
  label,
  ariaLabel,
  description,
  onClick,
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
      'text-foreground hover:bg-lg-control disabled:opacity-45 disabled:hover:bg-transparent',
      'outline-none focus-visible:ring-2 focus-visible:ring-foreground/20'
    )}
  >
    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-medium">{label}</span>
      <span className="block text-[11px] text-muted-foreground">{description}</span>
    </span>
  </button>
);

export const ScopePopover: FC<ScopePopoverProps> = ({
  hasWorkspace,
  isInstalling,
  onSelectScope,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isInstalling}
          className={cn(
            'relative inline-flex h-6 items-center gap-1 rounded-[9px] px-2 text-[11px] font-medium',
            'bg-[oklch(0.18_0.012_60)] text-white hover:bg-[oklch(0.22_0.012_60)] dark:bg-white dark:text-black dark:hover:bg-white/90',
            'active:scale-[0.97] transition-[transform,background-color] duration-150',
            'disabled:opacity-60 disabled:cursor-wait disabled:active:scale-100',
            'after:absolute after:inset-y-[-8px] after:inset-x-[-4px]'
          )}
        >
          {isInstalling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isInstalling ? 'Installing' : 'Add'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-2 border border-border/50">
        <div className="space-y-1">
          {hasWorkspace ? (
            <ScopeOptionButton
              icon={Folder}
              label="Project"
              ariaLabel="Install for this project"
              description="Install in this workspace"
              onClick={() => {
                onSelectScope('project');
                setOpen(false);
              }}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block">
                  <ScopeOptionButton
                    icon={Folder}
                    label="Project"
                    ariaLabel="Install for this project"
                    description="Install in this workspace"
                    disabled
                    onClick={() => {
                      // no-op
                    }}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Open a workspace to install project skills</p>
              </TooltipContent>
            </Tooltip>
          )}
          <ScopeOptionButton
            icon={User}
            label="Personal"
            ariaLabel="Install for all projects"
            description="Install in ~/.claude/skills"
            onClick={() => {
              onSelectScope('personal');
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
