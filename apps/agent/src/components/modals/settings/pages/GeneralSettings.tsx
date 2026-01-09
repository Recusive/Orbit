import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export const GeneralSettings: FC = () => {
  const [language, setLanguage] = useState('en');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [telemetry, setTelemetry] = useState(false);

  return (
    <div>
      <SectionHeader title="Application">General application settings</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Language" description="Choose your preferred language">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="ja">日本語</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Auto Update" description="Automatically check for updates">
          <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
        </SettingItem>

        <SettingItem
          label="Telemetry"
          description="Send anonymous usage data to help improve the app"
        >
          <Switch checked={telemetry} onCheckedChange={setTelemetry} />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Data">Manage your data and storage</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Clear Cache" description="Rched data to free up space">
          <Button variant="outline" size="sm" className="h-8">
            Clear
          </Button>
        </SettingItem>

        <SettingItem label="Export Data" description="Download all your data as a backup">
          <Button variant="outline" size="sm" className="h-8">
            Export
          </Button>
        </SettingItem>
      </div>
    </div>
  );
};

export default GeneralSettings;
