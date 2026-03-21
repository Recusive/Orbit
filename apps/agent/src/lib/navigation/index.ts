export {
  applySnapshot,
  isNavigationRestoreInProgress,
  resetNavigationRestoreState,
} from './apply-snapshot';
export type { NavigationSnapshot, TabSnapshot } from './apply-snapshot';
export {
  captureSnapshot,
  destroyNavigationTracker,
  initNavigationTracker,
  snapshotsEqual,
} from './navigation-tracker';
