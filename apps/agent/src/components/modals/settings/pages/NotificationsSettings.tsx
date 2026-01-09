import { useState } from 'react';

import { SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Switch } from '@/components/ui/switch';

export const NotificationsSettings: FC = () => {
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);

  return (
    <div>
      <SectionHeader title="Notifications">Configure notification preferences</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Enable Notifications" description="Show system notifications">
          <Switch checked={enableNotifications} onCheckedChange={setEnableNotifications} />
        </SettingItem>

        <SettingItem label="Sound" description="Play sound for notifications">
          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
        </SettingItem>

        <SettingItem label="Show Errors" description="Display error notifications">
          <Switch checked={showErrors} onCheckedChange={setShowErrors} />
        </SettingItem>

        <SettingItem label="Show Warnings" description="Display warning notifications">
          <Switch checked={showWarnings} onCheckedChange={setShowWarnings} />
        </SettingItem>
      </div>
    </div>
  );
};

export default NotificationsSettings;
