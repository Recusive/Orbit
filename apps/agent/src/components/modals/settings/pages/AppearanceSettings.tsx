import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { IconThemeId } from '@/stores/ui/icon-theme-store';
import type { FC } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/providers/theme-provider';
import { AVAILABLE_THEMES, selectIconTheme, useIconThemeStore } from '@/stores/ui/icon-theme-store';

export const AppearanceSettings: FC = () => {
  // Color theme from ThemeProvider (persisted to localStorage)
  const { theme, setTheme } = useTheme();

  const [accentColor, setAccentColor] = useState('coral');
  const [fontSize, setFontSize] = useState('medium');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  // Icon theme from Zustand store (persisted)
  const currentIconTheme = useIconThemeStore(selectIconTheme);
  const setIconTheme = useIconThemeStore((state) => state.setTheme);

  const handleThemeChange = (value: string): void => {
    setTheme(value as 'light' | 'dark' | 'system');
  };

  const handleIconThemeChange = (value: string): void => {
    setIconTheme(value as IconThemeId);
  };

  return (
    <div>
      <SectionHeader title="Theme">Customize the look of the application</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Color Theme" description="Choose your preferred color theme">
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Accent Color" description="Primary color for buttons and highlights">
          <Select value={accentColor} onValueChange={setAccentColor}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coral">Coral</SelectItem>
              <SelectItem value="blue">Blue</SelectItem>
              <SelectItem value="green">Green</SelectItem>
              <SelectItem value="purple">Purple</SelectItem>
              <SelectItem value="orange">Orange</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem
          label="File Icon Theme"
          description="Icons for files and folders in the explorer"
        >
          <Select value={currentIconTheme} onValueChange={handleIconThemeChange}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_THEMES.map((iconTheme) => (
                <SelectItem key={iconTheme.id} value={iconTheme.id}>
                  {iconTheme.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Text">Customize text appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Font Size" description="Adjust the interface font size">
          <Select value={fontSize} onValueChange={setFontSize}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Accessibility">Accessibility options</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Reduce Motion" description="Minimize animations and transitions">
          <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
        </SettingItem>

        <SettingItem label="Compact Mode" description="Use a more compact interface layout">
          <Switch checked={compactMode} onCheckedChange={setCompactMode} />
        </SettingItem>
      </div>
    </div>
  );
};

export default AppearanceSettings;
