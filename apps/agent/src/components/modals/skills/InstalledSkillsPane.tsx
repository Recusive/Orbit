import { Facehash } from 'facehash';
import { Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SkillsSkeleton } from './SkillsSkeleton';

import type { ExtensionMessage, SkillDefinition } from '@/types/protocol';
import type { FC } from 'react';

import { useTauri } from '@/hooks/agent/use-tauri';
import { useSmoothScroll } from '@/hooks/ui';
import { cn } from '@/lib/utils';
import { OCTAGON_CLIP, setFaceHover } from '@/lib/utils/facehash-utils';
import { getSkillColor } from '@/lib/utils/skill-colors';

interface InstalledSkillsPaneProps {
  readonly open: boolean;
  readonly active: boolean;
  readonly search: string;
  readonly refreshToken: number;
  readonly onSkillSelect: (skill: SkillDefinition) => void;
}

interface SkillRowProps {
  readonly skill: SkillDefinition;
  readonly colorClass: string;
  readonly onClick: () => void;
}

const SOURCE_CONFIG: Record<string, { label: string; dot: string; facehash: string }> = {
  project: { label: 'Project', dot: 'bg-green-500', facehash: 'bg-avatar-project' },
  user: { label: 'Personal', dot: 'bg-orange-400', facehash: 'bg-avatar-user' },
  claude_project: {
    label: 'Workspace (Claude Code)',
    dot: 'bg-sky-400',
    facehash: 'bg-avatar-project',
  },
  claude_user: {
    label: 'Claude Code',
    dot: 'bg-blue-400',
    facehash: 'bg-avatar-user',
  },
  claude_plugin: {
    label: 'Claude Code Plugins',
    dot: 'bg-indigo-400',
    facehash: 'bg-avatar-system',
  },
  codex: {
    label: 'Codex',
    dot: 'bg-violet-400',
    facehash: 'bg-avatar-system',
  },
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
      size={28}
      variant="solid"
      className="shrink-0 text-white dark:text-black"
      style={{ pointerEvents: 'none', clipPath: OCTAGON_CLIP, backgroundImage: colorClass }}
    />
    <span className="text-[13px] font-medium text-foreground truncate min-w-0 flex-1">
      {skill.name}
    </span>
  </button>
);

export const InstalledSkillsPane: FC<InstalledSkillsPaneProps> = ({
  open,
  active,
  search,
  refreshToken,
  onSkillSelect,
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open || !active) {
      return;
    }

    setIsLoading(true);
    setError(null);
    postMessage({
      type: 'skills:list',
      uuid: crypto.randomUUID(),
    });
  }, [active, open, postMessage, refreshToken]);

  const filtered = useMemo(() => {
    if (search.trim().length === 0) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (skill) => skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
    );
  }, [search, skills]);

  const grouped = useMemo(() => {
    const groups: { source: string; skills: SkillDefinition[] }[] = [];
    const bySource = new Map<string, SkillDefinition[]>();

    for (const skill of filtered) {
      const existing = bySource.get(skill.source);
      if (existing !== undefined) {
        existing.push(skill);
      } else {
        const list = [skill];
        bySource.set(skill.source, list);
        groups.push({ source: skill.source, skills: list });
      }
    }

    return groups;
  }, [filtered]);

  const hasSkills = skills.length > 0;
  const hasResults = filtered.length > 0;
  const isSearching = search.trim().length > 0;

  return (
    <div className="h-full overflow-hidden">
      <div
        ref={smoothScrollRef}
        className="h-full overflow-auto overscroll-y-contain p-4 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)] mask-[linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)]"
      >
        {isLoading ? (
          <SkillsSkeleton />
        ) : error !== null ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          </div>
        ) : !hasSkills ? (
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
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-muted-foreground/50">
              No skills matching &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(({ source, skills: groupSkills }) => {
              const config = SOURCE_CONFIG[source] ?? {
                label: source,
                dot: 'bg-orbit-600',
                facehash: 'bg-avatar-system',
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
                        key={skill.filePath ?? `${skill.source}-${skill.name}`}
                        skill={skill}
                        colorClass={getSkillColor(skill.name, skill.description)}
                        onClick={() => {
                          onSkillSelect(skill);
                        }}
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
  );
};
