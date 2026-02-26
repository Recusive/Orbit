import { useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { WindowMode } from '@/providers/theme-provider';
import type { IconThemeId } from '@/stores/ui/icon-theme-store';
import type { WelcomeAnimationId } from '@/stores/ui/welcome-animation-store';
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
import { selectChatFullWidth, useChatWidthStore } from '@/stores/ui/chat-width-store';
import { AVAILABLE_THEMES, selectIconTheme, useIconThemeStore } from '@/stores/ui/icon-theme-store';
import {
  WELCOME_ANIMATIONS,
  selectWelcomeAnimation,
  useWelcomeAnimationStore,
} from '@/stores/ui/welcome-animation-store';

export const AppearanceSettings: FC = () => {
  // Color theme and window mode from ThemeProvider (persisted to localStorage)
  const { theme, setTheme, windowMode, setWindowMode } = useTheme();

  // TODO: These settings are placeholder UI - they don't persist or affect the app yet.
  // Implementation needed: Create a settings store and persist to localStorage or Tauri settings.
  const [fontSize, setFontSize] = useState('medium');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  // Icon theme from Zustand store (persisted)
  const currentIconTheme = useIconThemeStore(selectIconTheme);
  const setIconTheme = useIconThemeStore((state) => state.setTheme);

  // Welcome animation from Zustand store (persisted)
  const currentWelcomeAnimation = useWelcomeAnimationStore(selectWelcomeAnimation);
  const setWelcomeAnimation = useWelcomeAnimationStore((state) => state.setAnimation);

  // Chat width from Zustand store (persisted)
  const chatFullWidth = useChatWidthStore(selectChatFullWidth);
  const setChatFullWidth = useChatWidthStore((state) => state.setFullWidth);

  const handleThemeChange = (value: string): void => {
    setTheme(value as 'light' | 'dark' | 'system');
  };

  const handleWindowModeChange = (value: string): void => {
    setWindowMode(value as WindowMode);
  };

  const handleIconThemeChange = (value: string): void => {
    setIconTheme(value as IconThemeId);
  };

  const handleWelcomeAnimationChange = (value: string): void => {
    setWelcomeAnimation(value as WelcomeAnimationId);
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

        <SettingItem
          label="Window Mode"
          description="Liquid Glass uses transparency with macOS vibrancy"
        >
          <Select value={windowMode} onValueChange={handleWindowModeChange}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="liquid-glass">Liquid Glass</SelectItem>
              <SelectItem value="solid">Solid</SelectItem>
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
        <SettingItem
          label="Welcome Animation"
          description="Animation style for the welcome page logo"
        >
          <Select value={currentWelcomeAnimation} onValueChange={handleWelcomeAnimationChange}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WELCOME_ANIMATIONS.map((anim) => (
                <SelectItem key={anim.id} value={anim.id}>
                  {anim.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Layout">Chat area layout preferences</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Full Width Chat"
          description="Stretch the chat area to fill the available width"
        >
          <Switch checked={chatFullWidth} onCheckedChange={setChatFullWidth} />
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="Text">Customize text appearance</SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem label="Font Size" description="Adjust the interface font size">
          <Select value={fontSize} onValueChange={setFontSize} disabled>
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
          <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} disabled />
        </SettingItem>

        <SettingItem label="Compact Mode" description="Use a more compact interface layout">
          <Switch checked={compactMode} onCheckedChange={setCompactMode} disabled />
        </SettingItem>
      </div>
    </div>
  );
};

export default AppearanceSettings;
