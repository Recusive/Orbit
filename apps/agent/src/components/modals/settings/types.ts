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
  | 'notifications'
  | 'tabs'
  | 'account'
  | 'feedback';

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly defaultSection?: SettingsSection;
}

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
