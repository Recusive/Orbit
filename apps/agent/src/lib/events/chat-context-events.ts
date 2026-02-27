/** Custom event name for adding a file/folder context chip */
export const ADD_FILE_CHIP_EVENT = 'addFileChip';

/** MIME type for internal file explorer drag data */
export const ORBIT_FILE_MIME = 'application/x-orbit-file';
/** Text MIME fallback for internal drag data (WebKit-safe) */
export const ORBIT_FILE_TEXT_MIME = 'text/x-orbit-file';

/** Payload shape for the addFileChip custom event */
export interface AddFileChipDetail {
  /** Absolute file path */
  path: string;
  /** Display name (filename or folder name) */
  name: string;
  /** Whether this is a directory (determines ContextItem.type) */
  isDirectory: boolean;
}

let currentOrbitDragDetail: AddFileChipDetail | null = null;

/** Runtime type guard — validates payload before state mutation */
export function isAddFileChipDetail(value: unknown): value is AddFileChipDetail {
  if (typeof value !== 'object' || value === null) return false;
  const detail = value as Record<string, unknown>;
  return (
    typeof detail['path'] === 'string' &&
    detail['path'].length > 0 &&
    typeof detail['name'] === 'string' &&
    detail['name'].length > 0 &&
    typeof detail['isDirectory'] === 'boolean'
  );
}

/** Dispatch an addFileChip event (used by drop handler and context menu) */
export function dispatchAddFileChip(detail: AddFileChipDetail): void {
  window.dispatchEvent(new CustomEvent(ADD_FILE_CHIP_EVENT, { detail }));
}

/** Set the active drag payload for internal explorer drags */
export function setCurrentOrbitDragDetail(detail: AddFileChipDetail): void {
  currentOrbitDragDetail = detail;
}

/** Consume and clear the active drag payload */
export function takeCurrentOrbitDragDetail(): AddFileChipDetail | null {
  const detail = currentOrbitDragDetail;
  currentOrbitDragDetail = null;
  return detail;
}

/** Check whether an orbit file drag is in progress (non-destructive read) */
export function hasCurrentOrbitDragDetail(): boolean {
  return currentOrbitDragDetail !== null;
}

/** Clear the active drag payload without consuming it */
export function clearCurrentOrbitDragDetail(): void {
  currentOrbitDragDetail = null;
}
