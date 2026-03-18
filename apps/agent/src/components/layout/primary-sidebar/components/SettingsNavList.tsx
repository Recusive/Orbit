import type { NavItemConfig, SettingsSection } from '@/components/modals/settings/types';
import type { FC, ReactNode } from 'react';

import { NAV_ITEMS } from '@/components/modals/settings/SettingsSidebar';
import { cn, SIDEBAR } from '@/lib/utils';
import { useSettingsSection, useUIStore } from '@/stores/ui/ui-store';

// ============================================================================
// Grouped nav structure
// ============================================================================

interface NavGroup {
  readonly label: string;
  readonly ids: readonly SettingsSection[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'General', ids: ['general', 'appearance', 'account', 'changelog'] },
  { label: 'Agent', ids: ['backend', 'agent', 'providers', 'subagents', 'commands'] },
  { label: 'Features', ids: ['editor', 'browser', 'git', 'shortcuts', 'notifications', 'tabs'] },
] as const;

/** Build a lookup from NAV_ITEMS once so groups can reference by id. */
const NAV_ITEM_MAP = new Map<SettingsSection, NavItemConfig>(
  NAV_ITEMS.map((item) => [item.id, item])
);

// ============================================================================
// Components
// ============================================================================

interface SettingsNavButtonProps {
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}

const SettingsNavButton: FC<SettingsNavButtonProps> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    className={cn(
      'flex items-center gap-1.5 w-[calc(100%-12px)] h-8 rounded-[9px] mx-1.5 overflow-hidden hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75',
      active
        ? 'bg-lg-sidebar-selected text-foreground'
        : 'text-sidebar-foreground hover:text-foreground'
    )}
    onClick={onClick}
  >
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
    >
      <span className="shrink-0">{icon}</span>
    </div>
    <span className="text-base whitespace-nowrap overflow-hidden w-auto">{label}</span>
  </button>
);

export const SettingsNavList: FC = () => {
  const activeSection = useSettingsSection();
  const openSettings = useUIStore((state) => state.openSettings);

  return (
    <div className="flex flex-col gap-0.5 py-1.5 animate-title-in">
      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.label} className={cn('flex flex-col gap-0.5', groupIndex > 0 && 'mt-2')}>
          <div className="flex items-center px-3 py-1 shrink-0">
            <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
              {group.label}
            </span>
          </div>
          {group.ids.map((id) => {
            const item = NAV_ITEM_MAP.get(id);
            if (item === undefined) return null;
            return (
              <SettingsNavButton
                key={id}
                active={activeSection === id}
                icon={item.icon}
                label={item.label}
                onClick={() => {
                  openSettings(id);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
