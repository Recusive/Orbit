/**
 * ActionsBar - VS Code-style vertical icon bar for activity tab switching
 *
 * NOTE: Icon column width comes from @/lib/utils/constants.
 * To change actions bar width, update SIDEBAR.iconColumnWidth in constants.ts.
 */
import { FileCode, GitBranch, GitCompareArrows, Globe } from 'lucide-react';

import type { ActivityTab } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getModifierSymbols, SIDEBAR } from '@/lib/utils';
import { useActivityTab, useUIStore } from '@/stores/ui/ui-store';

interface ActionButtonProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly shortcut?: readonly string[];
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly badge?: number;
}

const ActionButton: FC<ActionButtonProps> = ({
  icon: Icon,
  label,
  shortcut,
  isActive,
  onClick,
  badge,
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'relative flex items-center justify-center w-full h-12 transition-colors',
            isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={label}
          aria-selected={isActive}
          role="tab"
        >
          {/* Active indicator - overlays the left border (VS Code style) */}
          {isActive ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r"
              style={{ left: -3 }}
            />
          ) : null}

          <Icon className="h-5 w-5" />

          {/* Badge for counts (e.g., pending changes) */}
          {badge !== undefined && badge > 0 ? (
            <div className="absolute top-1.5 right-1.5 min-w-4 h-4 flex items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground px-1">
              {badge > 99 ? '99+' : badge}
            </div>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut ? (
          <KbdGroup>
            {shortcut.map((key, index) => (
              <Kbd key={index} className="bg-white/15 text-inherit border-white/20">
                {key}
              </Kbd>
            ))}
          </KbdGroup>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * Actions Bar - VS Code-style vertical icon bar for switching Activity Panel tabs.
 * Located on the right side of the app, controls which view is shown in the Activity Panel.
 */
export const ActionsBar: FC = () => {
  const activeTab = useActivityTab();
  const setActiveTab = useUIStore((state) => state.setActivityTab);
  const modifiers = getModifierSymbols();

  const handleTabClick = (tab: ActivityTab): void => {
    setActiveTab(tab);
  };

  return (
    <aside
      className="h-full flex flex-col border-l-[3px] border-border/50 bg-card"
      style={{ width: SIDEBAR.iconColumnWidth }}
      role="tablist"
      aria-label="Actions Bar"
    >
      {/* Main action buttons */}
      <div className="flex-1 flex flex-col py-1">
        <ActionButton
          icon={FileCode}
          label="Editor"
          shortcut={[modifiers.cmd, 'E']}
          isActive={activeTab === 'file'}
          onClick={() => {
            handleTabClick('file');
          }}
        />
        <ActionButton
          icon={GitCompareArrows}
          label="Changed Files"
          isActive={activeTab === 'files'}
          onClick={() => {
            handleTabClick('files');
          }}
        />
        <ActionButton
          icon={GitBranch}
          label="Source Control"
          shortcut={[modifiers.ctrl, modifiers.shift, 'G']}
          isActive={activeTab === 'source'}
          onClick={() => {
            handleTabClick('source');
          }}
        />
        <ActionButton
          icon={Globe}
          label="Browser"
          isActive={activeTab === 'browser'}
          onClick={() => {
            handleTabClick('browser');
          }}
        />
      </div>
    </aside>
  );
};
