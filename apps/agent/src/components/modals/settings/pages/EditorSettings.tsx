import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFileViewerStore, useWordWrap } from '@/stores/file/file-viewer-store';

export const EditorSettings: FC = () => {
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('13');
  const [tabSize, setTabSize] = useState('2');
  const wordWrap = useWordWrap();
  const toggleWordWrap = useFileViewerStore((s) => s.toggleWordWrap);
  const [minimap, setMinimap] = useState(false);

  return (
    <div>
      <SectionHeader title="Appearance">Customize the editor appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Theme" description="Choose your preferred color theme">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Font Size" description="Editor font size in pixels">
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => {
              setFontSize(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>

        <SettingItem label="Tab Size" description="Number of spaces per tab">
          <Input
            type="number"
            value={tabSize}
            onChange={(e) => {
              setTabSize(e.target.value);
            }}
            className="w-20 h-8 text-sm"
          />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Features">Toggle editor features</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Word Wrap" description="Wrap long lines to fit the editor width">
          <Switch checked={wordWrap} onCheckedChange={toggleWordWrap} />
        </SettingItem>

        <SettingItem label="Minimap" description="Show code minimap on the side">
          <Switch checked={minimap} onCheckedChange={setMinimap} />
        </SettingItem>
      </div>
    </div>
  );
};

export default EditorSettings;
