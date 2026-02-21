/**
 * ProjectsDialog — Icon grid dialog showing recent projects.
 */
import { createLogger } from '@orbit/common/lib';
import { FolderOpen, FolderPlus, X } from 'lucide-react';
import { useCallback } from 'react';

import type { RecentProject } from '@/hooks/ui/use-recent-projects';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRecentProjects } from '@/hooks/ui/use-recent-projects';
import { addRecentProject, conversationList, initializeWorkspace, openFileDialog } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('ProjectsDialog');

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ProjectsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Project Tile
// ═══════════════════════════════════════════════════════════════

interface ProjectTileProps {
  readonly project: RecentProject;
  readonly onClick: () => void;
}

const ProjectTile: FC<ProjectTileProps> = ({ project, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer',
      'transition-[background-color,transform] duration-150',
      'hover:bg-lg-control-hover dark:hover:bg-lg-control-hover',
      'active:scale-[0.96]',
      'outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
    )}
  >
    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-lg-control dark:bg-lg-separator">
      <FolderOpen
        className="h-6 w-6 text-lg-text-secondary dark:text-lg-text-secondary"
        aria-hidden="true"
      />
    </div>
    <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
      <span className="text-sm font-medium text-foreground truncate max-w-full">
        {project.name}
      </span>
      <span className="text-[11px] text-muted-foreground/70 truncate max-w-full">
        {project.parentPath}
      </span>
    </div>
  </button>
);

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════

const ProjectsSkeleton: FC = () => (
  <div className="grid grid-cols-4 gap-4">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex flex-col items-center gap-2 p-4">
        <div className="h-12 w-12 rounded-xl bg-lg-control animate-pulse" />
        <div className="h-3.5 w-20 rounded bg-lg-control animate-pulse" />
        <div className="h-2.5 w-16 rounded bg-lg-control animate-pulse" />
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Dialog
// ═══════════════════════════════════════════════════════════════

export const ProjectsDialog: FC<ProjectsDialogProps> = ({ open, onOpenChange }) => {
  const { projects, isLoading } = useRecentProjects();
  const setRootPath = useFileStore((s) => s.setRootPath);

  const openProject = useCallback(
    async (path: string): Promise<void> => {
      try {
        await initializeWorkspace(path);
        await addRecentProject(path);
        useUIStore.getState().setWorkspace(path);
        setRootPath(path);

        const conversations = await conversationList(path);
        useUIStore.getState().setConversations(toConversationSummaries(conversations));

        onOpenChange(false);
      } catch (err) {
        logger.error('Failed to open project', err);
      }
    },
    [setRootPath, onOpenChange]
  );

  const handleTileClick = useCallback(
    (path: string) => (): void => {
      openProject(path).catch((err: unknown) => {
        logger.error('Failed to open project from tile', err);
      });
    },
    [openProject]
  );

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    try {
      const selected = await openFileDialog({ directory: true });

      if (selected !== null && typeof selected === 'string') {
        await openProject(selected);
      }
    } catch (err) {
      logger.error('Failed to open folder', err instanceof Error ? err : new Error(String(err)));
    }
  }, [openProject]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[480px] max-h-[85vh] flex flex-col gap-0 p-0 [&>button:last-child]:hidden">
        <DialogHeader className="px-4 py-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Projects
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-sm text-lg-text-secondary"
                onClick={() => void handleOpenFolder()}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Open Folder
              </Button>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-lg-text-secondary hover:bg-red-500/10 hover:text-red-500 active:bg-red-500/15"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="h-px bg-border/40 shrink-0" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <ProjectsSkeleton />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" aria-hidden="true" />
              <p className="text-base text-muted-foreground/90 mb-1">No recent projects</p>
              <p className="text-sm text-muted-foreground/60 mb-4">Open a folder to get started</p>
              <Button onClick={() => void handleOpenFolder()}>
                <FolderPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                Open Folder
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {projects.map((project) => (
                <ProjectTile
                  key={project.path}
                  project={project}
                  onClick={handleTileClick(project.path)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
