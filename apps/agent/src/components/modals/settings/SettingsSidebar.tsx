import { IconPaintBucket } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPaintBucket';
import { IconSettingsKnob } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSettingsKnob';
import { hexagons7, tab } from '@lucide/lab';
import {
  AppWindowMac,
  Bell,
  Bot,
  FlaskConical,
  GitBranch,
  Globe,
  Icon,
  Keyboard,
  Slash,
  User,
} from 'lucide-react';

import { NavItem } from './components';

import type { NavItemConfig, SettingsSection } from './types';
import type { FC } from 'react';

interface SettingsSidebarProps {
  readonly activeSection: SettingsSection;
  readonly onSectionChange: (section: SettingsSection) => void;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: <IconSettingsKnob className="h-4 w-4" />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <IconPaintBucket className="h-4 w-4" />,
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: <Icon iconNode={hexagons7} className="h-4 w-4" />,
  },
  {
    id: 'subagents',
    label: 'Subagents',
    icon: <Bot className="h-4 w-4" />,
  },
  {
    id: 'commands',
    label: 'Commands',
    icon: <Slash className="h-3.5 w-3.5 -rotate-25" />,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: <Keyboard className="h-4 w-4" />,
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: <Globe className="h-4 w-4" />,
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: <AppWindowMac className="h-4 w-4" />,
  },
  {
    id: 'git',
    label: 'Git',
    icon: <GitBranch className="h-4 w-4" />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell className="h-4 w-4" />,
  },
  {
    id: 'tabs',
    label: 'Tabs',
    icon: <Icon iconNode={tab} className="h-4 w-4" />,
  },
  {
    id: 'account',
    label: 'Account',
    icon: <User className="h-4 w-4" />,
  },
];

const FEEDBACK_ITEM: NavItemConfig = {
  id: 'feedback',
  label: 'Provide Feedback',
  icon: <FlaskConical className="h-4 w-4" />,
};

export const SettingsSidebar: FC<SettingsSidebarProps> = ({ activeSection, onSectionChange }) => {
  return (
    <div className="w-48 border-r border-border-panel p-2.5 bg-transparent flex flex-col">
      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={activeSection === item.id}
            onClick={() => {
              onSectionChange(item.id);
            }}
          />
        ))}
      </nav>
      {/* Feedback at bottom */}
      <div className="h-px bg-border/40 shrink-0 -mx-2.5 mt-2" />
      <div className="pt-2 -mx-2.5 px-2.5">
        <NavItem
          icon={FEEDBACK_ITEM.icon}
          label={FEEDBACK_ITEM.label}
          isActive={activeSection === 'feedback'}
          onClick={() => {
            onSectionChange('feedback');
          }}
        />
      </div>
    </div>
  );
};

// Export for external use if needed
export { FEEDBACK_ITEM, NAV_ITEMS };
