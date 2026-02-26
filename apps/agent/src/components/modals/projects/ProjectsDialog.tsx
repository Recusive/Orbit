/**
 * ProjectsDialog — Finder-style project browser.
 */
import { createLogger } from '@orbit/common/lib';
import { Facehash } from 'facehash';
import { FolderPlus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RecentProject } from '@/hooks/ui/use-recent-projects';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
// Project Tile
// ═══════════════════════════════════════════════════════════════

interface ProjectTileProps {
  readonly project: RecentProject;
  readonly onClick: () => void;
}

// Folder silhouette clip-path for 56×56 Facehash icons
const FOLDER_CLIP =
  'path("M6 0H18C20 0 21.5 1 22.5 3L25 9H50C53.3 9 56 11.7 56 15V50C56 53.3 53.3 56 50 56H6C2.7 56 0 53.3 0 50V6C0 2.7 2.7 0 6 0Z")';

const setFaceHover = (e: React.MouseEvent, hovered: boolean): void => {
  const face = e.currentTarget.querySelector('[data-facehash-face]');
  if (face instanceof HTMLElement) {
    if (hovered) {
      face.dataset['savedTransform'] = face.style.transform;
      face.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(12px)';
    } else if (face.dataset['savedTransform']) {
      face.style.transform = face.dataset['savedTransform'];
    }
  }
};

const ProjectTile: FC<ProjectTileProps> = ({ project, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseEnter={(e) => {
      setFaceHover(e, true);
    }}
    onMouseLeave={(e) => {
      setFaceHover(e, false);
    }}
    className={cn(
      'group flex flex-col items-center gap-3 p-5 rounded-2xl cursor-pointer',
      'text-lg-text-secondary hover:text-foreground hover:bg-lg-sidebar-hover',
      'active:scale-[0.97]',
      'outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
    )}
  >
    <Facehash
      name={project.name}
      size={56}
      variant="solid"
      colorClasses={['bg-[#945036] dark:bg-[#e9ad97]']}
      className="shrink-0 text-white dark:text-black"
      style={{ pointerEvents: 'none', clipPath: FOLDER_CLIP }}
    />
    <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
      <span className="text-[13px] font-medium text-foreground truncate max-w-full">
        {project.name}
      </span>
      <span className="text-[11px] text-muted-foreground/60 truncate max-w-full">
        {project.parentPath}
      </span>
    </div>
  </button>
);

// ═══════════════════════════════════════════════════════════════
// Add Project Tile
// ═══════════════════════════════════════════════════════════════

interface AddProjectTileProps {
  readonly onClick: () => void;
}

const AddProjectTile: FC<AddProjectTileProps> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex flex-col items-center gap-3 p-5 rounded-2xl cursor-pointer',
      'text-lg-text-secondary hover:text-foreground hover:bg-lg-sidebar-hover',
      'active:scale-[0.97]',
      'outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
    )}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-foreground/15">
      <Plus className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
    </div>
    <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
      <span className="text-[13px] font-medium text-muted-foreground/70">Open Folder</span>
    </div>
  </button>
);

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════

const ProjectsSkeleton: FC = () => (
  <div className="grid grid-cols-4 gap-2">
    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
      <div key={i} className="flex flex-col items-center gap-3 p-5">
        <div className="h-14 w-14 rounded-2xl bg-[var(--lg-control-bg)] animate-pulse" />
        <div className="flex flex-col items-center gap-1">
          <div className="h-3.5 w-20 rounded-md bg-[var(--lg-control-bg)] animate-pulse" />
          <div className="h-2.5 w-14 rounded-md bg-[var(--lg-control-bg)] animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Dialog
// ═══════════════════════════════════════════════════════════════

export interface ProjectsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ProjectsDialog: FC<ProjectsDialogProps> = ({ open, onOpenChange }) => {
  const { projects, isLoading } = useRecentProjects();
  const setRootPath = useFileStore((s) => s.setRootPath);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset search and autofocus on open
  useEffect(() => {
    if (open) {
      setSearch('');
      const isTouchDevice = 'ontouchstart' in window;
      if (!isTouchDevice) {
        setTimeout(() => {
          searchRef.current?.focus();
        }, 50);
      }
    }
  }, [open]);

  // Filter projects by search
  const filtered = useMemo(() => {
    if (search.trim().length === 0) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const openProject = useCallback(
    async (path: string): Promise<void> => {
      try {
        await initializeWorkspace(path);
        await addRecentProject(path);
        useUIStore.getState().initializeWorkspace(path);
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

  const hasProjects = projects.length > 0;
  const hasResults = filtered.length > 0;
  const isSearching = search.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[640px] sm:max-w-[640px] h-[520px] max-h-[85vh] flex flex-col gap-0 p-0 [&>button:last-child]:hidden">
        {/* Header — search bar + close */}
        <div className="flex items-center shrink-0 p-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder="Search projects"
              spellCheck={false}
              autoComplete="off"
              className={cn(
                'w-full h-9 rounded-[9px] bg-[var(--lg-alert-secondary-bg)] pl-9 pr-9 text-sm',
                'placeholder:text-muted-foreground/40 outline-none',
                'transition-[background-color] duration-150',
                'focus:bg-[var(--lg-control-bg)]'
              )}
            />
            <DialogClose className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          {/* Accessible title — visually hidden since search bar IS the title */}
          <DialogTitle className="sr-only">Projects</DialogTitle>
          <DialogDescription className="sr-only">Browse and open recent projects</DialogDescription>
        </div>

        {/* Grid content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <ProjectsSkeleton />
          ) : !hasProjects ? (
            /* Empty state — no projects at all */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--lg-control-bg)] mb-5">
                <FolderPlus className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground/80 mb-1">No projects yet</p>
              <p className="text-[13px] text-muted-foreground/50 mb-5">
                Open a folder to get started
              </p>
              <button
                type="button"
                className="liquid-glass-btn liquid-glass-btn-primary cursor-pointer transition-transform duration-75 active:scale-[0.97]"
                style={{ padding: '0 16px' }}
                onClick={() => void handleOpenFolder()}
              >
                <span className="inline-flex items-center gap-1.5">
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Open Folder
                </span>
              </button>
            </div>
          ) : !hasResults && isSearching ? (
            /* No search results */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-sm text-muted-foreground/50">
                No projects matching &ldquo;{search}&rdquo;
              </p>
            </div>
          ) : (
            /* Project grid */
            <div className="grid grid-cols-4 gap-2">
              {filtered.map((project) => (
                <ProjectTile
                  key={project.path}
                  project={project}
                  onClick={handleTileClick(project.path)}
                />
              ))}
              {/* "Add" tile — always last in grid, hidden when searching */}
              {!isSearching ? <AddProjectTile onClick={() => void handleOpenFolder()} /> : null}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 px-4 pb-3">
          <div className="p-3 rounded-[12px] bg-[var(--lg-control-bg)] text-sm text-muted-foreground/70">
            <p className="font-medium mb-1 text-foreground/70">Projects</p>
            <ul className="list-disc list-inside space-y-0.5 text-[12px]">
              <li>Each project gets a unique icon based on its name</li>
              <li>Click a project to open it, or use search to filter</li>
              <li>
                Use the{' '}
                <code className="bg-[var(--lg-control-bg-hover)] px-1 py-0.5 rounded-md">+</code>{' '}
                tile to add a new folder
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
