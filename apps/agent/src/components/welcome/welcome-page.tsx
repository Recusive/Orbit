import { FolderOpen, GitBranch, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { CloneRepositoryDialog } from '@/components/modals/git';
import { SSHConnectionDialog } from '@/components/modals/ssh';
import { useRecentProjects } from '@/hooks/ui/use-recent-projects';
import { addRecentProject, openFileDialog, setWorkspacePath } from '@/lib/api/backend';
import { cn } from '@/lib/utils/utils';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

export interface WelcomePageProps {
  className?: string;
}

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
        // Persist workspace path to backend
        await setWorkspacePath(path);
        // Add to recent projects (moves to top if already exists)
        await addRecentProject(path);
        // Update UI store with workspace name
        useUIStore.getState().setWorkspace(path);
        // Update file store root path
        setRootPath(path);
      } catch (err) {
        console.error('[WelcomePage] Failed to open project:', err);
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
      console.error('[WelcomePage] Failed to open project:', err);
    }
  }, [openProject]);

  const handleRecentProjectClick = useCallback(
    (path: string) => {
      return (): void => {
        openProject(path).catch(console.error);
      };
    },
    [openProject]
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'min-w-[420px] mx-auto p-12 gap-6 box-border',
        'bg-background',
        className
      )}
    >
      {/* Logo/Branding - consistent with onboarding */}
      <div className="flex items-center gap-4 w-full max-w-[380px]">
        <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-primary/10">
          <OrbitLogo size={40} className="text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold text-foreground tracking-tight">Orbit</span>
          <span className="text-sm text-muted-foreground">AI Code Editor</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[380px]">
        <button
          type="button"
          onClick={handleOpenProject}
          className={cn(
            'flex flex-col items-start justify-center gap-1.5 p-3 rounded-lg cursor-pointer',
            'bg-muted/30 border border-border',
            'hover:bg-muted/50'
          )}
        >
          <FolderOpen className="h-4 w-4 text-foreground" />
          <span className="text-xs text-foreground">Open project</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCloneDialogOpen(true);
          }}
          className={cn(
            'flex flex-col items-start justify-center gap-1.5 p-3 rounded-lg cursor-pointer',
            'bg-muted/30 border border-border',
            'hover:bg-muted/50'
          )}
        >
          <GitBranch className="h-4 w-4 text-foreground" />
          <span className="text-xs text-foreground">Clone repo</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSshDialogOpen(true);
          }}
          className={cn(
            'flex flex-col items-start justify-center gap-1.5 p-3 rounded-lg cursor-pointer',
            'bg-muted/30 border border-border',
            'hover:bg-muted/50'
          )}
        >
          <Terminal className="h-4 w-4 text-foreground" />
          <span className="text-xs text-foreground">SSH</span>
        </button>
      </div>

      {/* Recent Projects */}
      <div className="w-full max-w-[380px]">
        {/* Header */}
        <div className="flex items-center justify-between px-1 py-0.5 text-base leading-tight mb-0.5">
          <span className="font-normal text-muted-foreground/60">Recent projects</span>
          {projects.length > 5 ? (
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-foreground cursor-pointer"
            >
              View all ({projects.length})
            </button>
          ) : null}
        </div>

        {/* Project List */}
        <div className="flex flex-col gap-0.5">
          {projects.length === 0 ? (
            <div className="text-base text-muted-foreground/50 px-1 py-2">No recent projects</div>
          ) : (
            projects.slice(0, 5).map((project) => (
              <button
                key={project.path}
                type="button"
                onClick={handleRecentProjectClick(project.path)}
                className={cn(
                  'flex items-center px-1 py-0.5 rounded cursor-pointer',
                  'hover:bg-accent/50',
                  'text-left outline-none'
                )}
              >
                <span className="flex-1 text-base text-foreground/80 truncate">{project.name}</span>
                <span className="text-base text-muted-foreground/60 ml-3 truncate max-w-[50%]">
                  {project.parentPath}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Clone Repository Dialog */}
      <CloneRepositoryDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />

      {/* SSH Connection Dialog */}
      <SSHConnectionDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />
    </div>
  );
};
