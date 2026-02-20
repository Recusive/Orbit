/**
 * ActionsBar - VS Code-style vertical icon bar for activity tab switching
 *
 * NOTE: Icon column width comes from @/lib/utils/constants.
 * To change actions bar width, update SIDEBAR.iconColumnWidth in constants.ts.
 */
import { CircleAlert, FileCode, GitBranch, Globe } from 'lucide-react';

import type { ActivityTab } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, SIDEBAR } from '@/lib/utils';
import { useActivityTab, useUIStore } from '@/stores/ui/ui-store';

interface ActionButtonProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly badge?: number;
}

const ActionButton: FC<ActionButtonProps> = ({ icon: Icon, label, isActive, onClick, badge }) => {
  return (
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
          className="absolute top-1/2 -translate-y-1/2 w-[2px] h-6 bg-primary rounded-r"
          style={{ left: -1.5 }}
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
  );
};

/**
 * Actions Bar - VS Code-style vertical icon bar for switching Activity Panel tabs.
 * Located on the right side of the app, controls which view is shown in the Activity Panel.
 */
export const ActionsBar: FC = () => {
  const activeTab = useActivityTab();
  const setActiveTab = useUIStore((state) => state.setActivityTab);
  const handleTabClick = (tab: ActivityTab): void => {
    setActiveTab(tab);
  };

  return (
    <aside
      className="h-full flex flex-col"
      style={{ width: SIDEBAR.iconColumnWidth }}
      role="tablist"
      aria-label="Actions Bar"
    >
      {/* Main action buttons */}
      <div className="flex-1 flex flex-col py-1">
        <ActionButton
          icon={FileCode}
          label="Editor"
          isActive={activeTab === 'file'}
          onClick={() => {
            handleTabClick('file');
          }}
        />
        <ActionButton
          icon={GitBranch}
          label="Source Control"
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

      {/* AI disclaimer icon - pinned to bottom */}
      <div className="shrink-0 flex items-center justify-center py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center h-8 w-8 text-muted-foreground/40">
              <CircleAlert className="h-4 w-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            AI may make mistakes. Double-check all generated code.
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
};
