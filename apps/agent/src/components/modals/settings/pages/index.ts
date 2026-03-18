import { lazy } from 'react';

import type { SettingsSection } from '../types';
import type { ComponentType, LazyExoticComponent } from 'react';

export { AccountSettings } from './AccountSettings';
export { AgentSettings } from './AgentSettings';
export { AppearanceSettings } from './AppearanceSettings';
export { BackendSettings } from './BackendSettings';
export { BrowserSettings } from './BrowserSettings';
export { ChangelogSettings } from './ChangelogSettings';
export { EditorSettings } from './EditorSettings';
export { FeedbackSettings } from './FeedbackSettings';
export { GeneralSettings } from './GeneralSettings';
export { GitSettings } from './GitSettings';
export { NotificationsSettings } from './NotificationsSettings';
export { ProvidersSettings } from './ProvidersSettings';
export { ShortcutsSettings } from './ShortcutsSettings';
export { SlashCommandsSettings } from './SlashCommandsSettings';
export { SubagentsSettings } from './SubagentsSettings';
export { TabsSettings } from './TabsSettings';

/** Minimum time (ms) the skeleton fallback stays visible during tab switches */
const MIN_SKELETON_MS = 500;

/**
 * Wraps a dynamic import with a minimum delay so the Suspense fallback
 * (skeleton) is visible long enough to not flash. The module load and
 * the timer run in parallel — if the import takes longer than the
 * minimum, no extra delay is added.
 */
function lazyWithMinDelay<T extends ComponentType>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() =>
    Promise.all([
      factory(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, MIN_SKELETON_MS);
      }),
    ]).then(([module]) => module)
  );
}

// Lazy-loaded page components for code splitting
export const SETTINGS_PAGE_COMPONENTS: Partial<
  Record<SettingsSection, LazyExoticComponent<ComponentType>>
> = {
  backend: lazyWithMinDelay(() => import('./BackendSettings')),
  general: lazyWithMinDelay(() => import('./GeneralSettings')),
  appearance: lazyWithMinDelay(() => import('./AppearanceSettings')),
  agent: lazyWithMinDelay(() => import('./AgentSettings')),
  providers: lazyWithMinDelay(() => import('./ProvidersSettings')),
  subagents: lazyWithMinDelay(() => import('./SubagentsSettings')),
  commands: lazyWithMinDelay(() => import('./SlashCommandsSettings')),
  shortcuts: lazyWithMinDelay(() => import('./ShortcutsSettings')),
  browser: lazyWithMinDelay(() => import('./BrowserSettings')),
  changelog: lazyWithMinDelay(() => import('./ChangelogSettings')),
  editor: lazyWithMinDelay(() => import('./EditorSettings')),
  git: lazyWithMinDelay(() => import('./GitSettings')),
  notifications: lazyWithMinDelay(() => import('./NotificationsSettings')),
  tabs: lazyWithMinDelay(() => import('./TabsSettings')),
  account: lazyWithMinDelay(() => import('./AccountSettings')),
  feedback: lazyWithMinDelay(() => import('./FeedbackSettings')),
};
