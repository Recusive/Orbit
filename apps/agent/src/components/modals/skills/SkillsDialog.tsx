/**
 * SkillsDialog — Finder-style skill browser with Facehash icons.
 *
 * Skills are filesystem artifacts (SKILL.md files with YAML frontmatter) discovered from
 * project (.claude/skills/) and user (~/.claude/skills/) directories. This dialog
 * fetches and displays them in a searchable list with Facehash icons, matching the ProjectsDialog shell.
 */
import { Facehash } from 'facehash';
import { Search, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExtensionMessage, SkillDefinition } from '@/types/protocol';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useSmoothScroll } from '@/hooks/ui';
import { dispatchAddContextChip } from '@/lib/events/chat-context-events';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SkillsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Skill Row
// ═══════════════════════════════════════════════════════════════

interface SkillRowProps {
  readonly skill: SkillDefinition;
  readonly colorClass: string;
  readonly onClick: () => void;
}

// Per-source config: header label, dot color, Facehash color
const SOURCE_CONFIG: Record<string, { label: string; dot: string; facehash: string }> = {
  project: { label: 'Project', dot: 'bg-green-500', facehash: 'bg-[#7EB4F0] dark:bg-[#7EB4F0]' },
  user: { label: 'Personal', dot: 'bg-orange-400', facehash: 'bg-[#e9ad97] dark:bg-[#e9ad97]' },
};

// Octagon clip-path for skill Facehash icons
const OCTAGON_CLIP =
  'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';

const REST_FLAT = 'rotateX(0deg) rotateY(0deg) translateZ(12px)';
const REST_TILT = 'rotateX(-15deg) rotateY(15deg) translateZ(12px)';

// Animate the Facehash face on row hover. Uses the parent button's mouseenter
// so the entire row triggers it (not just the 40px icon area).
// Faces that hash to a tilted rest position straighten on hover (default behavior).
// Faces that hash to a flat rest position get tilted at rest and straighten on hover
// so every face has the same "look at you" hover effect.
const setFaceHover = (e: React.MouseEvent, hovered: boolean): void => {
  const face = e.currentTarget.querySelector('[data-facehash-face]');
  if (face instanceof HTMLElement) {
    const isFlatFace = face.dataset['flatFace'] === 'true';

    // On first encounter, detect flat faces and tilt them at rest
    if (face.dataset['flatFace'] === undefined) {
      if (face.style.transform === REST_FLAT) {
        face.dataset['flatFace'] = 'true';
        face.style.transform = REST_TILT;
      } else {
        face.dataset['flatFace'] = 'false';
      }
    }

    if (hovered) {
      face.dataset['savedTransform'] = face.style.transform;
      face.style.transform = REST_FLAT;
    } else if (face.dataset['savedTransform']) {
      face.style.transform = isFlatFace ? REST_TILT : face.dataset['savedTransform'];
    }
  }
};

const SkillRow: FC<SkillRowProps> = ({ skill, colorClass, onClick }) => (
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
      'group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl cursor-pointer w-full text-left',
      'text-lg-text-secondary hover:text-foreground hover:bg-lg-sidebar-hover',
      'active:scale-[0.99]',
      'outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
    )}
  >
    <Facehash
      name={skill.name}
      size={40}
      variant="solid"
      colorClasses={[colorClass]}
      className="shrink-0 text-white dark:text-black"
      style={{ pointerEvents: 'none', clipPath: OCTAGON_CLIP }}
    />
    <span className="text-[13px] font-medium text-foreground truncate min-w-0 flex-1">
      {skill.name}
    </span>
  </button>
);

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════

const SkillsSkeleton: FC = () => (
  <div className="flex flex-col gap-1">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-center gap-3.5 px-3.5 py-2.5">
        <div className="h-10 w-10 rounded-[12px] bg-lg-control animate-pulse shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3.5 w-36 rounded-md bg-lg-control animate-pulse" />
          <div className="h-2.5 w-16 rounded-md bg-lg-control animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Dialog
// ═══════════════════════════════════════════════════════════════

export const SkillsDialog: FC<SkillsDialogProps> = ({ open, onOpenChange }) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Handle incoming skill messages
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'skills:list:response') {
      setSkills(message.skills);
      setError(null);
      setIsLoading(false);
    } else if (message.type === 'skills:error') {
      setError(message.error);
      setIsLoading(false);
    }
  }, []);

  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Fetch skills and reset search whenever dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setError(null);
      setSearch('');
      postMessage({
        type: 'skills:list',
        uuid: crypto.randomUUID(),
      });

      const isTouchDevice = 'ontouchstart' in window;
      if (!isTouchDevice) {
        setTimeout(() => {
          searchRef.current?.focus();
        }, 50);
      }
    }
  }, [open, postMessage]);

  // Client-side filtering by name and description
  const filtered = useMemo(() => {
    if (search.trim().length === 0) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [skills, search]);

  // Group filtered skills by source
  const grouped = useMemo(() => {
    const groups: { source: string; skills: SkillDefinition[] }[] = [];
    const bySource = new Map<string, SkillDefinition[]>();
    for (const skill of filtered) {
      const existing = bySource.get(skill.source);
      if (existing !== undefined) {
        existing.push(skill);
      } else {
        const arr = [skill];
        bySource.set(skill.source, arr);
        groups.push({ source: skill.source, skills: arr });
      }
    }
    return groups;
  }, [filtered]);

  // Clicking a skill adds it as a context chip above the input and closes the dialog
  const handleSkillSelect = useCallback(
    (skill: SkillDefinition) => (): void => {
      dispatchAddContextChip({
        id: crypto.randomUUID(),
        type: 'skill',
        name: skill.name,
        path: skill.name,
      });
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const hasSkills = skills.length > 0;
  const hasResults = filtered.length > 0;
  const isSearching = search.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[640px] sm:max-w-[640px] h-[520px] max-h-[85vh] flex flex-col gap-0 p-0 [&>button:last-child]:hidden">
        {/* Header — search bar + close */}
        <div className="flex items-center shrink-0 p-3">
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
              placeholder="Search skills"
              spellCheck={false}
              autoComplete="off"
              className={cn(
                'w-full h-9 rounded-[9px] bg-(--lg-alert-secondary-bg) pl-9 pr-9 text-sm',
                'placeholder:text-muted-foreground/40 outline-none',
                'transition-[background-color] duration-150',
                'focus:bg-lg-control'
              )}
            />
            <DialogClose className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          <DialogTitle className="sr-only">Skills</DialogTitle>
          <DialogDescription className="sr-only">
            Browse and add skills to your conversation
          </DialogDescription>
        </div>

        {/* Scrollable content with edge fade */}
        <div className="flex-1 min-h-0">
          <div
            ref={smoothScrollRef}
            className="h-full overflow-auto overscroll-y-contain p-4 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)] mask-[linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)]"
          >
            {isLoading ? (
              <SkillsSkeleton />
            ) : error !== null ? (
              /* Error state */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              </div>
            ) : !hasSkills ? (
              /* Empty state — no skills at all */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lg-control mb-5">
                  <Zap className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-foreground/80 mb-1">No skills found</p>
                <p className="text-[13px] text-muted-foreground/50">
                  Add skills to{' '}
                  <code className="bg-lg-control px-1 py-0.5 rounded-md">.claude/skills/</code> or{' '}
                  <code className="bg-lg-control px-1 py-0.5 rounded-md">~/.claude/skills/</code>
                </p>
              </div>
            ) : !hasResults && isSearching ? (
              /* No search results */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-muted-foreground/50">
                  No skills matching &ldquo;{search}&rdquo;
                </p>
              </div>
            ) : (
              /* Skill list grouped by source */
              <div className="flex flex-col gap-5">
                {grouped.map(({ source, skills: groupSkills }) => {
                  const config = SOURCE_CONFIG[source] ?? {
                    label: source,
                    dot: 'bg-gray-400',
                    facehash: 'bg-[#2B5EA7] dark:bg-[#7EB4F0]',
                  };
                  return (
                    <div key={source}>
                      <div className="flex items-center gap-2 px-3.5 mb-1.5">
                        <span className={cn('h-2 w-2 rounded-full', config.dot)} />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                          {config.label}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {groupSkills.map((skill) => (
                          <SkillRow
                            key={`${skill.source}-${skill.name}`}
                            skill={skill}
                            colorClass={config.facehash}
                            onClick={handleSkillSelect(skill)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="shrink-0 px-4 pb-3">
          <div className="p-3 rounded-[12px] bg-lg-control text-sm text-muted-foreground/70">
            <p className="font-medium mb-1 text-foreground/70">How Skills Work</p>
            <ul className="list-disc list-inside space-y-0.5 text-[12px]">
              <li>
                Project skills live in{' '}
                <code className="bg-lg-control-hover px-1 rounded-md">.claude/skills/</code>
              </li>
              <li>
                Personal skills live in{' '}
                <code className="bg-lg-control-hover px-1 rounded-md">~/.claude/skills/</code>
              </li>
              <li>Each skill is a SKILL.md file with YAML frontmatter</li>
              <li>Skills are automatically loaded when matched by triggers</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
