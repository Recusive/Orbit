import { AlertCircle, RefreshCw, Store } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { MarketplaceSkillCard } from './MarketplaceSkillCard';
import { SkillsSkeleton } from './SkillsSkeleton';

import type { BrowseCategory, MarketplaceSkill } from '@/lib/api/marketplace';
import type { FC } from 'react';

import { useSmoothScroll } from '@/hooks/ui';
import {
  browseMarketplaceSkills,
  getInstalledMarketplaceIds,
  getWorkspacePath,
  installMarketplaceSkill,
  searchMarketplaceSkills,
} from '@/lib/api';
import { IS_TAURI } from '@/lib/api/core';
import { cn } from '@/lib/utils';

interface MarketplacePaneProps {
  readonly active: boolean;
  readonly search: string;
  readonly onInstalled: () => void;
}

interface BrowseCacheEntry {
  readonly data: MarketplaceSkill[];
  readonly fetchedAt: number;
}

const BROWSE_CACHE_TTL_MS = 300_000;

export const MarketplacePane: FC<MarketplacePaneProps> = ({ active, search, onInstalled }) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const [results, setResults] = useState<MarketplaceSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [browseCategory, setBrowseCategory] = useState<BrowseCategory>('trending');
  const [isInitialized, setIsInitialized] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const trimmedSearch = search.trim();
  const isSearchActive = trimmedSearch.length > 0;

  const requestSequenceRef = useRef(0);
  const browseCacheRef = useRef<Partial<Record<BrowseCategory, BrowseCacheEntry>>>({});
  const lastIssuedQueryRef = useRef<string | null>(null);
  const previousSearchActiveRef = useRef(isSearchActive);

  const refreshInstalled = useCallback(async (workspace: string | null): Promise<void> => {
    const ids = await getInstalledMarketplaceIds(workspace ?? undefined);
    setInstalledIds(new Set(ids));
  }, []);

  const invalidatePending = useCallback((): void => {
    requestSequenceRef.current += 1;
  }, []);

  const applyBrowseFromCache = useCallback(
    (category: BrowseCategory): boolean => {
      const entry = browseCacheRef.current[category];
      if (entry === undefined || Date.now() - entry.fetchedAt > BROWSE_CACHE_TTL_MS) {
        return false;
      }

      invalidatePending();
      lastIssuedQueryRef.current = null;
      setError(null);
      setIsLoading(false);
      setHasLoaded(true);
      setResults(entry.data);
      return true;
    },
    [invalidatePending]
  );

  const runSearch = useCallback(async (query: string): Promise<void> => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    lastIssuedQueryRef.current = query;

    setIsLoading(true);
    setError(null);

    try {
      const skills = await searchMarketplaceSkills(query, 50);
      if (requestId !== requestSequenceRef.current) {
        return;
      }
      setResults(skills);
    } catch (err: unknown) {
      if (requestId !== requestSequenceRef.current) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load marketplace skills';
      setError(message);
      setResults([]);
    } finally {
      if (requestId === requestSequenceRef.current) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  const loadBrowse = useCallback(
    async (category: BrowseCategory): Promise<void> => {
      if (applyBrowseFromCache(category)) {
        return;
      }

      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;
      lastIssuedQueryRef.current = null;

      setIsLoading(true);
      setError(null);

      try {
        const skills = await browseMarketplaceSkills(category);
        if (requestId !== requestSequenceRef.current) {
          return;
        }

        browseCacheRef.current[category] = {
          data: skills,
          fetchedAt: Date.now(),
        };
        setResults(skills);
      } catch (err: unknown) {
        if (requestId !== requestSequenceRef.current) {
          return;
        }

        const staleEntry = browseCacheRef.current[category];
        if (staleEntry !== undefined) {
          setResults(staleEntry.data);
          setError(null);
        } else {
          const message =
            err instanceof Error ? err.message : 'Failed to load marketplace browse skills';
          setError(message);
          setResults([]);
        }
      } finally {
        if (requestId === requestSequenceRef.current) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    },
    [applyBrowseFromCache]
  );

  const switchCategory = useCallback(
    (category: BrowseCategory): void => {
      setBrowseCategory(category);
      if (isSearchActive) {
        return;
      }

      if (applyBrowseFromCache(category)) {
        return;
      }

      void loadBrowse(category);
    },
    [applyBrowseFromCache, isSearchActive, loadBrowse]
  );

  useEffect(() => {
    if (!active || !IS_TAURI) {
      return;
    }

    let cancelled = false;
    setIsInitialized(false);
    previousSearchActiveRef.current = false;
    setError(null);

    const loadInitial = async (): Promise<void> => {
      try {
        const path = await getWorkspacePath();
        if (cancelled) return;
        setWorkspacePath(path);
        await refreshInstalled(path);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load installed marketplace skills';
          setError(message);
        }
      }

      if (!cancelled) {
        setBrowseCategory('trending');
        await loadBrowse('trending');
        setIsInitialized(true);
      }
    };

    void loadInitial();

    return () => {
      cancelled = true;
      setIsInitialized(false);
    };
  }, [active, loadBrowse, refreshInstalled]);

  useEffect(() => {
    if (!active || !IS_TAURI || !isInitialized) {
      return;
    }

    const wasSearchActive = previousSearchActiveRef.current;
    previousSearchActiveRef.current = isSearchActive;

    if (isSearchActive) {
      if (trimmedSearch === lastIssuedQueryRef.current) {
        return;
      }

      const timerId = window.setTimeout(() => {
        void runSearch(trimmedSearch);
      }, 300);

      return () => {
        window.clearTimeout(timerId);
      };
    }

    if (applyBrowseFromCache(browseCategory)) {
      return;
    }

    if (wasSearchActive) {
      void loadBrowse(browseCategory);
    }

    return undefined;
  }, [
    active,
    applyBrowseFromCache,
    browseCategory,
    isSearchActive,
    loadBrowse,
    runSearch,
    trimmedSearch,
    isInitialized,
  ]);

  const handleRetry = useCallback((): void => {
    if (isSearchActive) {
      void runSearch(trimmedSearch);
      return;
    }

    void loadBrowse(browseCategory);
  }, [browseCategory, isSearchActive, loadBrowse, runSearch, trimmedSearch]);

  const handleInstall = useCallback(
    async (skill: MarketplaceSkill, scope: 'project' | 'personal'): Promise<void> => {
      if (installingIds.has(skill.id)) {
        return;
      }

      setInstallingIds((previous) => {
        const next = new Set(previous);
        next.add(skill.id);
        return next;
      });

      try {
        const result = await installMarketplaceSkill(
          skill.source,
          skill.skillId,
          scope,
          scope === 'project' ? (workspacePath ?? undefined) : undefined
        );

        if (!result.success) {
          toast.error('Failed to install skill', {
            description: result.error ?? 'Unknown install error',
          });
          return;
        }

        setInstalledIds((previous) => {
          const next = new Set(previous);
          next.add(skill.id);
          return next;
        });

        if (result.warnings !== undefined && result.warnings.length > 0) {
          for (const warning of result.warnings) {
            toast.warning('Skill installed with warning', { description: warning });
          }
        } else {
          toast.success(`Installed ${skill.name}`);
        }

        onInstalled();
        await refreshInstalled(workspacePath);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Install failed';
        toast.error('Failed to install skill', { description: message });
      } finally {
        setInstallingIds((previous) => {
          const next = new Set(previous);
          next.delete(skill.id);
          return next;
        });
      }
    },
    [installingIds, onInstalled, refreshInstalled, workspacePath]
  );

  if (!IS_TAURI) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-lg-control">
            <Store className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground/80">
            Marketplace requires the desktop app
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground/60">
            Open Orbit with Tauri to browse and install marketplace skills.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div ref={smoothScrollRef} className="h-full overflow-auto overscroll-y-contain p-4">
        {!isSearchActive && (
          <div className="mb-3 inline-flex rounded-xl bg-lg-control p-1">
            <button
              type="button"
              onClick={() => {
                switchCategory('trending');
              }}
              className={cn(
                'h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
                browseCategory === 'trending'
                  ? 'bg-control-fill text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Trending
            </button>
            <button
              type="button"
              onClick={() => {
                switchCategory('top');
              }}
              className={cn(
                'h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
                browseCategory === 'top'
                  ? 'bg-control-fill text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Top
            </button>
          </div>
        )}

        {isLoading ? (
          <SkillsSkeleton variant="grid" rows={6} />
        ) : error !== null ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
              <AlertCircle className="mx-auto mb-2 h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive mb-3">{error}</p>
              <button
                type="button"
                onClick={handleRetry}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-[12px] font-medium',
                  'bg-control-fill hover:bg-control-fill-hover text-foreground transition-colors'
                )}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        ) : hasLoaded && results.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center text-center">
            <div className="max-w-sm">
              {isSearchActive ? (
                <>
                  <p className="text-sm font-medium text-foreground/80 mb-1">No results found</p>
                  <p className="text-[13px] text-muted-foreground/60">
                    Try a different keyword than &quot;{trimmedSearch}&quot;.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground/80 mb-1">
                    Couldn&apos;t load {browseCategory === 'trending' ? 'trending' : 'top'} skills
                  </p>
                  <p className="mb-3 text-[13px] text-muted-foreground/60">
                    Retry to fetch the latest marketplace ranking.
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-[12px] font-medium',
                      'bg-control-fill hover:bg-control-fill-hover text-foreground transition-colors'
                    )}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {results.map((skill) => (
              <MarketplaceSkillCard
                key={skill.id}
                skill={skill}
                isInstalled={installedIds.has(skill.id)}
                isInstalling={installingIds.has(skill.id)}
                hasWorkspace={workspacePath !== null}
                onInstall={(selectedSkill, scope) => {
                  void handleInstall(selectedSkill, scope);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
