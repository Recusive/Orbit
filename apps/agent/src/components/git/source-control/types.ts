/**
 * Source Control Types
 */
import type { FileStatus as BackendFileStatus } from '@/lib/api';

export interface SourceControlTabProps {
  className?: string;
  isVisible?: boolean;
}

/** UI file status for display purposes */
export type DisplayFileStatus =
  | 'added'
  | 'modified'
  | 'untracked'
  | 'deleted'
  | 'renamed'
  | 'conflicted';

/** File item for display in changes list */
export interface FileItem {
  path: string;
  displayStatus: DisplayFileStatus;
  /** Backend file status */
  backendStatus: BackendFileStatus;
  /** Original path for renamed files */
  oldPath?: string | null;
}

/** Props for file action handlers */
export interface FileActionHandlers {
  onStage: (path: string) => Promise<void>;
  onUnstage: (path: string) => Promise<void>;
  onDiscard: (path: string) => void;
}

/** Callbacks for DiffFileCard to signal virtualizer demand */
export interface VirtualizerDemandCallbacks {
  readonly onVirtualizerNeeded: () => void;
  readonly onVirtualizerReleased: () => void;
}

/** Branch information */
export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}
