/**
 * Source Control exports
 */

// Main component
export { SourceControlTab } from './SourceControlTab';
export type { SourceControlTabProps } from './types';

// Sub-components (for advanced usage)
export { BranchSelector } from './components/BranchSelector';
export { ChangeItem } from './components/ChangeItem';
export { ChangesList } from './components/ChangesList';
export { CommitForm } from './components/CommitForm';
export { DiffFileCard } from './components/DiffFileCard';
export { DiscardConfirmation } from './components/DiscardConfirmation';
export { FileSection } from './components/FileSection';
export { GitActions } from './components/GitActions';
export { OperationError } from './components/OperationError';
export { SyncStatus } from './components/SyncStatus';

// Hook
export { useSourceControl } from './hooks/use-source-control';
export type { UseSourceControlReturn } from './hooks/use-source-control';

// Types
export type { DisplayFileStatus, FileItem, FileActionHandlers, BranchInfo } from './types';

// Constants
export {
  GIT_STATUS_POLL_INTERVAL,
  OPERATION_ERROR_TIMEOUT,
  HEADER_HEIGHT,
  COMMIT_TEXTAREA_ROWS,
  DIFF_EXPAND_TRANSITION,
  DIFF_EXPAND_TRANSITION_NONE,
} from './constants';
