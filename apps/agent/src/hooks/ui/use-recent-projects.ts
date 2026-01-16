import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useState } from 'react';

import { addRecentProject, getRecentProjects } from '@/lib/api';

const logger = createLogger('useRecentProjects');

// Hoisted RegExp for path splitting (avoids recreation on each call)
const PATH_SEPARATOR_RE = /[/\\]/;

export interface RecentProject {
  /** Full path to the project */
  path: string;
  /** Project/folder name */
  name: string;
  /** Parent directory path */
  parentPath: string;
}

export interface UseRecentProjectsReturn {
  /** List of recent projects */
  projects: RecentProject[];
  /** Whether projects are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Add a project to recent list */
  addProject: (path: string) => Promise<void>;
  /** Refresh the recent projects list */
  refresh: () => Promise<void>;
}

/**
 * Extracts project info from a full path.
 */
function parseProjectPath(path: string): RecentProject {
  const segments = path.split(PATH_SEPARATOR_RE).filter(Boolean);
  const name = segments[segments.length - 1] ?? path;
  const parentSegments = segments.slice(0, -1);

  // Format parent path nicely (replace home dir with ~)
  let parentPath = '/' + parentSegments.join('/');
  const homeDir = '/Users/';
  if (parentPath.startsWith(homeDir)) {
    const afterHome = parentPath.slice(homeDir.length);
    const userEnd = afterHome.indexOf('/');
    if (userEnd !== -1) {
      parentPath = '~' + afterHome.slice(userEnd);
    }
  }

  return { path, name, parentPath };
}

/**
 * Hook to manage recent projects.
 */
export function useRecentProjects(): UseRecentProjectsReturn {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const paths = await getRecentProjects();
      setProjects(paths.map(parseProjectPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load recent projects';
      setError(message);
      logger.error(
        'Failed to load recent projects',
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addProject = useCallback(
    async (path: string): Promise<void> => {
      try {
        await addRecentProject(path);
        // Refresh the list after adding
        await refresh();
      } catch (err) {
        logger.error('Failed to add project', err instanceof Error ? err : new Error(String(err)));
      }
    },
    [refresh]
  );

  // Load recent projects on mount
  useEffect(() => {
    refresh().catch((err: unknown) => {
      logger.error(
        'Failed to refresh recent projects',
        err instanceof Error ? err : new Error(String(err))
      );
    });
  }, [refresh]);

  return {
    projects,
    isLoading,
    error,
    addProject,
    refresh,
  };
}
