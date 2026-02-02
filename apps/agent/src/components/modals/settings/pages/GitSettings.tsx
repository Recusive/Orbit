import { useCallback, useEffect, useState } from 'react';

import { SectionHeader, SettingItem } from '../components';

import type { GitSettings as GitSettingsType, Settings } from '@/lib/api';
import type { FC } from 'react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getSettings, updateSettings } from '@/lib/api';

export const GitSettings: FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [gitSettings, setGitSettings] = useState<GitSettingsType>({
    autoFetchEnabled: true,
    autoFetchInterval: 180,
  });
  const [intervalInput, setIntervalInput] = useState('180');

  // Load settings on mount
  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded);
      setGitSettings(loaded.git);
      setIntervalInput(String(loaded.git.autoFetchInterval));
    });
  }, []);

  // Persist settings change
  const saveSettings = useCallback(
    async (newGitSettings: GitSettingsType): Promise<void> => {
      if (!settings) return;
      const updated = { ...settings, git: newGitSettings };
      await updateSettings(updated);
      setSettings(updated);
      setGitSettings(newGitSettings);
    },
    [settings]
  );

  // Handle auto-fetch toggle
  const handleAutoFetchToggle = (enabled: boolean): void => {
    void saveSettings({ ...gitSettings, autoFetchEnabled: enabled });
  };

  // Handle interval change (with validation)
  const handleIntervalChange = (value: string): void => {
    setIntervalInput(value);
    const parsed = parseInt(value, 10);
    // Validate: must be between 60 and 3600 seconds
    if (!isNaN(parsed) && parsed >= 60 && parsed <= 3600) {
      void saveSettings({ ...gitSettings, autoFetchInterval: parsed });
    }
  };

  return (
    <div>
      <SectionHeader title="Auto-Fetch">
        Automatically fetch from remote to keep tracking refs updated
      </SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Enable Auto-Fetch"
          description="Periodically fetch from remote to update ahead/behind counts"
        >
          <Switch checked={gitSettings.autoFetchEnabled} onCheckedChange={handleAutoFetchToggle} />
        </SettingItem>

        <SettingItem
          label="Fetch Interval"
          description="How often to fetch from remote (60-3600 seconds)"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={60}
              max={3600}
              value={intervalInput}
              onChange={(e) => {
                handleIntervalChange(e.target.value);
              }}
              disabled={!gitSettings.autoFetchEnabled}
              className="w-24 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground/90">seconds</span>
          </div>
        </SettingItem>
      </div>

      <div className="mt-4 p-3 bg-muted/30 rounded-md">
        <p className="text-xs text-muted-foreground/90">
          Auto-fetch keeps your local repository in sync with the remote by periodically running{' '}
          <code className="bg-muted px-1 rounded">git fetch</code>. This updates the ahead/behind
          counts shown in source control without modifying your working directory.
        </p>
      </div>
    </div>
  );
};

export default GitSettings;
