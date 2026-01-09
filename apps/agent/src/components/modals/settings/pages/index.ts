import { lazy } from 'react';

import type { SettingsSection } from '../types';
import type { ComponentType, LazyExoticComponent } from 'react';

export { AccountSettings } from './AccountSettings';
export { AgentSettings } from './AgentSettings';
export { AppearanceSettings } from './AppearanceSettings';
export { BrowserSettings } from './BrowserSettings';
export { EditorSettings } from './EditorSettings';
export { FeedbackSettings } from './FeedbackSettings';
export { GeneralSettings } from './GeneralSettings';
export { NotificationsSettings } from './NotificationsSettings';
export { ShortcutsSettings } from './ShortcutsSettings';
export { SlashCommandsSettings } from './SlashCommandsSettings';
export { SubagentsSettings } from './SubagentsSettings';
export { TabsSettings } from './TabsSettings';

// Lazy-loaded page components for code splitting
export const SETTINGS_PAGE_COMPONENTS: Partial<
  Record<SettingsSection, LazyExoticComponent<ComponentType>>
> = {
  general: lazy(() => import('./GeneralSettings')),
  appearance: lazy(() => import('./AppearanceSettings')),
  agent: lazy(() => import('./AgentSettings')),
  shortcuts: lazy(() => import('./ShortcutsSettings')),
  browser: lazy(() => import('./BrowserSettings')),
  editor: lazy(() => import('./EditorSettings')),
  notifications: lazy(() => import('./NotificationsSettings')),
  tabs: lazy(() => import('./TabsSettings')),
  account: lazy(() => import('./AccountSettings')),
  feedback: lazy(() => import('./FeedbackSettings')),
};
