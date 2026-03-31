/**
 * ActionsBar - VS Code-style vertical icon bar for activity tab switching
 *
 * NOTE: Icon column width comes from @/lib/utils/constants.
 * To change actions bar width, update SIDEBAR.iconColumnWidth in constants.ts.
 */
import { CircleAlert, Code, FileCode, GitBranch, Globe, MessageSquare } from 'lucide-react';

import type { ActivityTab, HeaderTab } from '@/stores/ui/ui-store';
import type { FC, ReactNode } from 'react';

import { SFSymbol } from '@/components/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, SIDEBAR } from '@/lib/utils';
import { useActiveTab, useActivityTab, useUIStore } from '@/stores/ui/ui-store';

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
          className="absolute top-1/2 -translate-y-1/2 w-[2px] h-6 bg-foreground rounded-r"
          style={{ left: -1.5 }}
        />
      ) : null}

      <Icon className="h-5 w-5" />

      {/* Badge for counts (e.g., pending changes) */}
      {badge !== undefined && badge > 0 ? (
        <div className="absolute top-1.5 right-1.5 min-w-4 h-4 flex items-center justify-center rounded-full bg-foreground text-xs font-medium text-background px-1">
          {badge > 99 ? '99+' : badge}
        </div>
      ) : null}
    </button>
  );
};

interface ModeButtonProps {
  readonly id: HeaderTab;
  readonly label: string;
  readonly sfSymbol: string;
  readonly fallback: ReactNode;
  readonly disabled?: boolean;
  readonly tooltipOverride?: string;
}

const ModeButton: FC<ModeButtonProps> = ({
  id,
  label,
  sfSymbol,
  fallback,
  disabled,
  tooltipOverride,
}) => {
  const activeMode = useActiveTab();
  const setMode = useUIStore((s) => s.setActiveTab);
  const isActive = activeMode === id;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => {
            if (!disabled) {
              setMode(id);
            }
          }}
          disabled={disabled}
          aria-label={`Switch to ${label}`}
          aria-pressed={isActive}
          aria-disabled={disabled}
          className={cn(
            'flex items-center justify-center w-full h-10 transition-colors',
            disabled
              ? 'text-muted-foreground/25 cursor-not-allowed'
              : isActive
                ? 'text-foreground'
                : 'text-muted-foreground/50 hover:text-foreground'
          )}
        >
          <SFSymbol name={sfSymbol} size={18} weight="medium" fallback={fallback} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        {tooltipOverride ?? label}
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

      {/* Mode switcher — pinned to bottom, above disclaimer */}
      <div className="shrink-0 flex flex-col items-center py-1 gap-1">
        <ModeButton
          id="editor"
          label="Editor"
          sfSymbol="chevron.left.forwardslash.chevron.right"
          fallback={<Code className="h-5 w-5" />}
        />
        <ModeButton
          id="agent"
          label="Agent"
          sfSymbol="command"
          fallback={<MessageSquare className="h-5 w-5" />}
        />
      </div>

      {/* AI disclaimer — chat bubble on hover */}
      <div className="group/disclaimer shrink-0 relative flex items-center justify-center py-1">
        <div className="flex items-center justify-center h-8 w-8 text-muted-foreground/40 cursor-default">
          <CircleAlert className="h-4 w-4" />
        </div>
        <div className="pointer-events-none absolute bottom-full right-full mb-[-8px] mr-[-6px] w-[170px] rounded-[12px] bg-menu-bg border border-border-tool px-3 py-2.5 text-[11px] font-[510] leading-snug text-muted-foreground shadow-menu opacity-0 scale-95 origin-bottom-right transition-all duration-150 ease-out group-hover/disclaimer:opacity-100 group-hover/disclaimer:scale-100">
          AI may make mistakes. Double-check all generated code.
        </div>
      </div>
    </aside>
  );
};
