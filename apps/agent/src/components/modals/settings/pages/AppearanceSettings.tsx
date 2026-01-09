import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export const AppearanceSettings: FC = () => {
  const [theme, setTheme] = useState('system');
  const [accentColor, setAccentColor] = useState('coral');
  const [fontSize, setFontSize] = useState('medium');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  return (
    <div>
      <SectionHeader title="Theme">Customize the look of the application</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Color Theme" description="Choose your preferred color theme">
          <Select value={theme} onValueChange={setTheme}>
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
