import { useState } from 'react';

import { SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export const TabsSettings: FC = () => {
  const [closeOnComplete, setCloseOnComplete] = useState(false);
  const [maxTabs, setMaxTabs] = useState('10');
  const [showIcons, setShowIcons] = useState(true);

  return (
    <div className="animate-settings-in">
      <SectionHeader title="Tab Behavior">Configure how tabs work</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Close on Task Complete" description="Auto-close tab when task finishes">
          <Switch checked={closeOnComplete} onCheckedChange={setCloseOnComplete} />
        </SettingItem>

        <SettingItem label="Maximum Tabs" description="Limit the number of open tabs">
          <Input
            type="number"
            value={maxTabs}
            onChange={(e) => {
              setMaxTabs(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem label="Show Tab Icons" description="Display icons in tab headers">
          <Switch checked={showIcons} onCheckedChange={setShowIcons} />
        </SettingItem>
      </div>
    </div>
  );
};

export default TabsSettings;
