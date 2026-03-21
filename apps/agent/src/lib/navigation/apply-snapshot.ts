import { createLogger } from '@orbit/common/lib';
import { convertFileSrc } from '@tauri-apps/api/core';

import type { SettingsSection } from '@/components/modals/settings';
import type { FileViewMode } from '@/stores/file/file-viewer-store';
import type {
  ActivityTab,
  BottomPanelTab,
  HeaderTab,
  TerminalPosition,
} from '@/stores/ui/ui-store';

import { getFileInfo, readFile } from '@/lib/api';
import { getImageMimeType, isImageFile } from '@/lib/utils';
import { getConversationUiBridge } from '@/services/conversations';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('ApplyNavigationSnapshot');

let isNavigating = false;
let navigatingTimeoutId: ReturnType<typeof setTimeout> | null = null;
let restoreGeneration = 0;

export interface TabSnapshot {
  path: string;
  viewMode: FileViewMode;
  fileType: 'text' | 'image';
}

export interface NavigationSnapshot {
  activeTab: HeaderTab;
  reviewPanelOpen: boolean;
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  activityTab: ActivityTab;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  vaultOpen: boolean;
  chatAreaDetached: boolean;
  terminalPosition: TerminalPosition;
  terminalCollapsed: boolean;
  editorChatPanelOpen: boolean;
  activeConversationId: string | null;
  activeTabPath: string | null;
  openTabs: TabSnapshot[];
}

export function isNavigationRestoreInProgress(): boolean {
  return isNavigating;
}

export function resetNavigationRestoreState(): void {
  isNavigating = false;
  restoreGeneration = 0;
  if (navigatingTimeoutId !== null) {
    clearTimeout(navigatingTimeoutId);
    navigatingTimeoutId = null;
  }
}

export function applySnapshot(snapshot: NavigationSnapshot): void {
  const generation = ++restoreGeneration;
  isNavigating = true;

  if (navigatingTimeoutId !== null) {
    clearTimeout(navigatingTimeoutId);
  }

  try {
    const prevConversationId = getConversationUiBridge().getActiveSessionId();

    useUIStore.setState((draft) => {
      draft.activeTab = snapshot.activeTab;
      draft.reviewPanelOpen = snapshot.reviewPanelOpen;
      draft.rightSidebarOpen = snapshot.rightSidebarOpen;
      draft.bottomPanelOpen = snapshot.bottomPanelOpen;
      draft.bottomPanelTab = snapshot.bottomPanelTab;
      draft.activityTab = snapshot.activityTab;
      draft.settingsOpen = snapshot.settingsOpen;
      draft.settingsSection = snapshot.settingsSection;
      draft.vaultOpen = snapshot.vaultOpen;
      draft.chatAreaDetached = snapshot.chatAreaDetached;
      draft.terminalPosition = snapshot.terminalPosition;
      draft.terminalCollapsed = snapshot.terminalCollapsed;
      draft.editorChatPanelOpen = snapshot.editorChatPanelOpen;
    });

    const fileStore = useFileViewerStore.getState();
    fileStore.closeAllTabs();

    for (const tab of snapshot.openTabs) {
      if (tab.viewMode === 'diff') {
        continue;
      }

      fileStore.openFile(tab.path);

      const currentTab = useFileViewerStore.getState().openTabs.find((openTab) => {
        return openTab.path === tab.path;
      });

      if (!currentTab) {
        continue;
      }

      if (tab.fileType === 'image' && isImageFile(tab.path)) {
        const assetUrl = convertFileSrc(tab.path);
        void getFileInfo(tab.path)
          .then((fileInfo) => {
            if (restoreGeneration !== generation) {
              return;
            }

            useFileViewerStore.getState().setImageFile(tab.path, currentTab.instanceId, {
              assetUrl,
              mimeType: getImageMimeType(tab.path),
              fileSize: fileInfo.size,
            });
          })
          .catch(() => {
            if (restoreGeneration !== generation) {
              return;
            }

            useFileViewerStore.getState().closeTab(tab.path);
          });

        continue;
      }

      void readFile(tab.path)
        .then((content) => {
          if (restoreGeneration !== generation) {
            return;
          }

          useFileViewerStore.getState().setFileContent(tab.path, content);
        })
        .catch(() => {
          if (restoreGeneration !== generation) {
            return;
          }

          useFileViewerStore.getState().closeTab(tab.path);
        });
    }

    if (snapshot.activeTabPath !== null) {
      fileStore.setActiveTab(snapshot.activeTabPath);
    }

    useFileViewerStore.setState((draft) => {
      const paths = snapshot.openTabs
        .filter((tab) => tab.viewMode !== 'diff')
        .map((tab) => tab.path);
      draft.history = paths;
      draft.historyIndex =
        snapshot.activeTabPath !== null ? paths.indexOf(snapshot.activeTabPath) : -1;
    });

    if (
      snapshot.activeConversationId !== null &&
      snapshot.activeConversationId !== prevConversationId
    ) {
      void getConversationUiBridge()
        .select(snapshot.activeConversationId)
        .catch((error: unknown) => {
          logger.warn('Conversation restore failed', {
            error,
            sessionId: snapshot.activeConversationId,
          });
        });
    }
  } finally {
    navigatingTimeoutId = setTimeout(() => {
      isNavigating = false;
      navigatingTimeoutId = null;
    }, 50);
  }
}
