import { useState } from 'react';

import { SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Switch } from '@/components/ui/switch';

export const BrowserSettings: FC = () => {
  const [enableBrowser, setEnableBrowser] = useState(true);
  const [headless, setHeadless] = useState(true);

  return (
    <div>
      <SectionHeader title="Browser">Configure browser automation settings</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Enable Browser Tool" description="Allow the agent to browse websites">
          <Switch checked={enableBrowser} onCheckedChange={setEnableBrowser} />
        </SettingItem>

        <SettingItem label="Headless Mode" description="Run browser without visible window">
          <Switch checked={headless} onCheckedChange={setHeadless} />
        </SettingItem>
      </div>
    </div>
  );
};

export default BrowserSettings;
