import { isNavigationRestoreInProgress } from './apply-snapshot';

import type { NavigationSnapshot } from './apply-snapshot';
import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { getConversationUiBridge } from '@/services/conversations';
import { useBackendStore } from '@/stores/backend';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useOcSessionStore } from '@/stores/opencode';
import { useNavigationStore } from '@/stores/ui/navigation-store';
import { useUIStore } from '@/stores/ui/ui-store';

const CAPTURE_DEBOUNCE_MS = 300;

let captureTimeoutId: ReturnType<typeof setTimeout> | null = null;
let cleanupFns: (() => void)[] = [];
let initialized = false;

function fileTabsEqual(currentTabs: ViewedFile[], previousTabs: ViewedFile[]): boolean {
  if (currentTabs.length !== previousTabs.length) {
    return false;
  }

  for (let index = 0; index < currentTabs.length; index += 1) {
    const currentTab = currentTabs[index];
    const previousTab = previousTabs[index];
    if (
      currentTab?.path !== previousTab?.path ||
      currentTab?.viewMode !== previousTab?.viewMode ||
      currentTab?.fileType !== previousTab?.fileType
    ) {
      return false;
    }
  }

  return true;
}

function trackedUiStateChanged(
  state: ReturnType<typeof useUIStore.getState>,
  prevState: ReturnType<typeof useUIStore.getState>
): boolean {
  return (
    state.workspacePath !== prevState.workspacePath ||
    state.activeTab !== prevState.activeTab ||
    state.reviewPanelOpen !== prevState.reviewPanelOpen ||
    state.rightSidebarOpen !== prevState.rightSidebarOpen ||
    state.bottomPanelOpen !== prevState.bottomPanelOpen ||
    state.bottomPanelTab !== prevState.bottomPanelTab ||
    state.activityTab !== prevState.activityTab ||
    state.settingsOpen !== prevState.settingsOpen ||
    state.settingsSection !== prevState.settingsSection ||
    state.activeConversationId !== prevState.activeConversationId ||
    state.vaultOpen !== prevState.vaultOpen ||
    state.chatAreaDetached !== prevState.chatAreaDetached ||
    state.terminalPosition !== prevState.terminalPosition ||
    state.terminalCollapsed !== prevState.terminalCollapsed ||
    state.editorChatPanelOpen !== prevState.editorChatPanelOpen
  );
}

function flushCapture(): void {
  captureTimeoutId = null;

  if (useUIStore.getState().workspacePath === null) {
    useNavigationStore.getState().clearHistory();
    return;
  }

  if (isNavigationRestoreInProgress()) {
    return;
  }

  const snapshot = captureSnapshot();
  const { history, currentIndex, pushSnapshot } = useNavigationStore.getState();
  const currentSnapshot = currentIndex >= 0 ? history[currentIndex] : null;

  if (currentSnapshot && snapshotsEqual(currentSnapshot, snapshot)) {
    return;
  }

  pushSnapshot(snapshot);
}

function debouncedCapture(): void {
  if (captureTimeoutId !== null) {
    clearTimeout(captureTimeoutId);
  }

  captureTimeoutId = setTimeout(() => {
    flushCapture();
  }, CAPTURE_DEBOUNCE_MS);
}

export function captureSnapshot(): NavigationSnapshot {
  const ui = useUIStore.getState();
  const files = useFileViewerStore.getState();

  return {
    activeTab: ui.activeTab,
    reviewPanelOpen: ui.reviewPanelOpen,
    rightSidebarOpen: ui.rightSidebarOpen,
    bottomPanelOpen: ui.bottomPanelOpen,
    bottomPanelTab: ui.bottomPanelTab,
    activityTab: ui.activityTab,
    settingsOpen: ui.settingsOpen,
    settingsSection: ui.settingsSection,
    vaultOpen: ui.vaultOpen,
    chatAreaDetached: ui.chatAreaDetached,
    terminalPosition: ui.terminalPosition,
    terminalCollapsed: ui.terminalCollapsed,
    editorChatPanelOpen: ui.editorChatPanelOpen,
    activeConversationId: getConversationUiBridge().getActiveSessionId(),
    activeTabPath: files.activeTabPath,
    openTabs: files.openTabs.map((tab) => ({
      path: tab.path,
      viewMode: tab.viewMode,
      fileType: tab.fileType,
    })),
  };
}

export function snapshotsEqual(a: NavigationSnapshot, b: NavigationSnapshot): boolean {
  if (a.activeTab !== b.activeTab) return false;
  if (a.reviewPanelOpen !== b.reviewPanelOpen) return false;
  if (a.rightSidebarOpen !== b.rightSidebarOpen) return false;
  if (a.bottomPanelOpen !== b.bottomPanelOpen) return false;
  if (a.bottomPanelTab !== b.bottomPanelTab) return false;
  if (a.activityTab !== b.activityTab) return false;
  if (a.settingsOpen !== b.settingsOpen) return false;
  if (a.settingsSection !== b.settingsSection) return false;
  if (a.activeConversationId !== b.activeConversationId) return false;
  if (a.vaultOpen !== b.vaultOpen) return false;
  if (a.chatAreaDetached !== b.chatAreaDetached) return false;
  if (a.terminalPosition !== b.terminalPosition) return false;
  if (a.terminalCollapsed !== b.terminalCollapsed) return false;
  if (a.editorChatPanelOpen !== b.editorChatPanelOpen) return false;
  if (a.activeTabPath !== b.activeTabPath) return false;
  if (a.openTabs.length !== b.openTabs.length) return false;

  for (let index = 0; index < a.openTabs.length; index += 1) {
    const left = a.openTabs[index];
    const right = b.openTabs[index];
    if (
      left?.path !== right?.path ||
      left?.viewMode !== right?.viewMode ||
      left?.fileType !== right?.fileType
    ) {
      return false;
    }
  }

  return true;
}

export function initNavigationTracker(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  cleanupFns.push(
    useUIStore.subscribe((state, prevState) => {
      if (!trackedUiStateChanged(state, prevState)) {
        return;
      }

      if (state.workspacePath !== prevState.workspacePath) {
        useNavigationStore.getState().clearHistory();
      }

      debouncedCapture();
    })
  );

  cleanupFns.push(
    useFileViewerStore.subscribe((state, prevState) => {
      if (
        state.activeTabPath !== prevState.activeTabPath ||
        !fileTabsEqual(state.openTabs, prevState.openTabs)
      ) {
        debouncedCapture();
      }
    })
  );

  cleanupFns.push(
    useOcSessionStore.subscribe((state, prevState) => {
      if (state.activeSessionId !== prevState.activeSessionId) {
        debouncedCapture();
      }
    })
  );

  cleanupFns.push(
    useBackendStore.subscribe((state, prevState) => {
      if (state.activeBackend !== prevState.activeBackend) {
        useNavigationStore.getState().clearHistory();
        debouncedCapture();
      }
    })
  );

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.ctrlKey || event.metaKey || event.altKey || event.code !== 'Minus') {
      return;
    }

    event.preventDefault();
    if (event.shiftKey) {
      useNavigationStore.getState().goForward();
      return;
    }

    useNavigationStore.getState().goBack();
  };

  window.addEventListener('keydown', handleKeyDown);
  cleanupFns.push(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  debouncedCapture();
}

export function destroyNavigationTracker(): void {
  initialized = false;

  if (captureTimeoutId !== null) {
    clearTimeout(captureTimeoutId);
    captureTimeoutId = null;
  }

  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
}
