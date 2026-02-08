import { createLogger } from '@orbit/common/lib';
import { ChevronRight, FolderOpen, GitBranch, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC } from 'react';

import { CloneRepositoryDialog } from '@/components/modals/git';
import { SSHConnectionDialog } from '@/components/modals/ssh';
import { AccountBanner } from '@/components/welcome/account-banner';
import { OrbitAsciiLogo } from '@/components/welcome/orbit-ascii-logo';
import { useRecentProjects } from '@/hooks/ui/use-recent-projects';
import { addRecentProject, conversationList, initializeWorkspace, openFileDialog } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('WelcomePage');

export interface WelcomePageProps {
  className?: string;
}

/** Action button config to eliminate repetition */
/** Hardcoded solid-mode colors so welcome page is unaffected by liquid glass */
const ACTION_BUTTON_CLASS = cn(
  'group relative flex flex-col items-start gap-3 p-4 rounded-2xl cursor-pointer',
  'bg-[oklch(0.87_0.02_75_/_50%)] dark:bg-[oklch(0.2_0.015_58_/_50%)]',
  'border-[3px] border-[#8B7355]/50 dark:border-border',
  'transition-[background-color,transform,border-color] duration-200 ease',
  'hover:bg-[oklch(0.87_0.02_75_/_65%)] dark:hover:bg-[oklch(0.2_0.015_58_/_65%)]',
  'hover:border-primary/30',
  'active:scale-[0.97]'
);

/**
 * Welcome page shown on startup when no workspace is open.
 * Displays branding, action buttons, and recent projects.
 */
export const WelcomePage: FC<WelcomePageProps> = ({ className }) => {
  const setRootPath = useFileStore((s) => s.setRootPath);
  const { projects } = useRecentProjects();
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [sshDialogOpen, setSshDialogOpen] = useState(false);

  const openProject = useCallback(
    async (path: string): Promise<void> => {
      try {
        // Persist workspace path to backend and build file index for fuzzy search
        await initializeWorkspace(path);
        // Add to recent projects (moves to top if already exists)
        await addRecentProject(path);
        // Update UI store with workspace name
        useUIStore.getState().setWorkspace(path);
        // Update file store root path
        setRootPath(path);

        // Load conversations for this workspace (Claude Code-style folder isolation)
        const conversations = await conversationList(path);
        useUIStore.getState().setConversations(toConversationSummaries(conversations));
      } catch (err) {
        logger.error('Failed to open project', err);
      }
    },
    [setRootPath]
  );

  const handleOpenProject = useCallback(async (): Promise<void> => {
    try {
      const selected = await openFileDialog({
        title: 'Open Project',
        directory: true,
        multiple: false,
      });

      if (selected !== null && typeof selected === 'string') {
        await openProject(selected);
      }
    } catch (err) {
      logger.error('Failed to open project', err);
    }
  }, [openProject]);

  const handleRecentProjectClick = useCallback(
    (path: string) => {
      return (): void => {
        openProject(path).catch((err: unknown) => {
          logger.error('Failed to open recent project', err);
        });
      };
    },
    [openProject]
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'min-w-[420px] mx-auto p-12 gap-10 box-border',
        'select-none',
        className
      )}
    >
      {/* Hero — ASCII block art wordmark */}
      <OrbitAsciiLogo />

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[420px]">
        <button
          type="button"
          aria-label="Open project folder"
          onClick={handleOpenProject}
          className={ACTION_BUTTON_CLASS}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-xs font-medium text-foreground">Open project</span>
        </button>

        <button
          type="button"
          aria-label="Clone a git repository"
          onClick={() => {
            setCloneDialogOpen(true);
          }}
          className={ACTION_BUTTON_CLASS}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-xs font-medium text-foreground">Clone repo</span>
        </button>

        <button
          type="button"
          aria-label="Connect via SSH"
          onClick={() => {
            setSshDialogOpen(true);
          }}
          className={ACTION_BUTTON_CLASS}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Terminal className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="text-xs font-medium text-foreground">SSH</span>
        </button>
      </div>

      {/* Recent Projects — frosted glass card */}
      {projects.length > 0 ? (
        <div className="w-full max-w-[420px] rounded-2xl bg-[oklch(0.87_0.02_75)] dark:bg-[oklch(0.25_0.02_58)] border-[3px] border-[#8B7355]/50 dark:border-border p-3">
          {/* Section header */}
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-semibold tracking-widest text-foreground/60 dark:text-muted-foreground/50 uppercase">
              Recent
            </span>
            {projects.length > 5 ? (
              <button
                type="button"
                className={cn(
                  'text-[10px] font-medium text-foreground/50 cursor-pointer',
                  'transition-colors duration-150 ease',
                  'hover:text-foreground'
                )}
              >
                View all
              </button>
            ) : null}
          </div>

          {/* Project rows */}
          <div className="flex flex-col gap-0.5">
            {projects.slice(0, 5).map((project) => (
              <button
                key={project.path}
                type="button"
                onClick={handleRecentProjectClick(project.path)}
                className={cn(
                  'group flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer',
                  'transition-[background-color] duration-150 ease',
                  'hover:bg-foreground/8 dark:hover:bg-card/60',
                  'text-left outline-none'
                )}
              >
                {/* Folder icon */}
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </div>

                {/* Name + path stacked */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground truncate">
                    {project.name}
                  </span>
                  <span className="text-[10px] text-foreground/50 dark:text-muted-foreground/50 truncate">
                    {project.parentPath}
                  </span>
                </div>

                {/* Arrow hint on hover */}
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-foreground/0 shrink-0',
                    'transition-[color] duration-150 ease',
                    'group-hover:text-foreground/40'
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Account Status Banner */}
      <AccountBanner />

      {/* Clone Repository Dialog */}
      <CloneRepositoryDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />

      {/* SSH Connection Dialog */}
      <SSHConnectionDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />
    </div>
  );
};
