import { Facehash } from 'facehash';
import { Download } from 'lucide-react';

import { ScopePopover } from './ScopePopover';

import type { MarketplaceSkill } from '@/lib/api/marketplace';
import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { OCTAGON_CLIP, setFaceHover } from '@/lib/utils/facehash-utils';

interface MarketplaceSkillCardProps {
  readonly skill: MarketplaceSkill;
  readonly isInstalled: boolean;
  readonly isInstalling: boolean;
  readonly hasWorkspace: boolean;
  readonly onInstall: (skill: MarketplaceSkill, scope: 'project' | 'personal') => void;
}

function formatInstalls(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

export const MarketplaceSkillCard: FC<MarketplaceSkillCardProps> = ({
  skill,
  isInstalled,
  isInstalling,
  hasWorkspace,
  onInstall,
}) => (
  <div
    onMouseEnter={(e) => {
      setFaceHover(e, true);
    }}
    onMouseLeave={(e) => {
      setFaceHover(e, false);
    }}
    className={cn(
      'rounded-xl border border-border/50 bg-control-fill/35 p-3',
      'hover:bg-control-fill/60 transition-colors'
    )}
  >
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0 flex items-center gap-2.5">
        <Facehash
          name={skill.name}
          size={36}
          variant="solid"
          colorClasses={['bg-avatar-system']}
          className="shrink-0 text-white dark:text-black"
          style={{ pointerEvents: 'none', clipPath: OCTAGON_CLIP }}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">{skill.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{skill.source}</p>
        </div>
      </div>
      {isInstalled ? (
        <span className="inline-flex h-8 items-center rounded-lg bg-emerald-500/20 px-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          Installed
        </span>
      ) : (
        <ScopePopover
          hasWorkspace={hasWorkspace}
          isInstalling={isInstalling}
          onSelectScope={(scope) => {
            onInstall(skill, scope);
          }}
        />
      )}
    </div>

    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Download className="h-3 w-3" aria-hidden="true" />
      <span>{formatInstalls(skill.installs)} installs</span>
    </div>
  </div>
);
