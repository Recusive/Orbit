import type { ReactNode } from 'react';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'agent'
  | 'subagents'
  | 'commands'
  | 'shortcuts'
  | 'browser'
  | 'editor'
  | 'git'
  | 'notifications'
  | 'tabs'
  | 'account'
  | 'changelog'
  | 'feedback';

export interface NavItemProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

export interface SettingItemProps {
  readonly label: string;
  readonly description?: string;
  readonly children: ReactNode;
}

export interface SectionHeaderProps {
  readonly title: string;
  readonly children?: ReactNode;
}

export interface ShortcutItemProps {
  readonly label: string;
  readonly keys: string[];
}

export interface NavItemConfig {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: ReactNode;
}
