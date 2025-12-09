import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type PanelPosition = 'left' | 'right' | 'bottom';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface PanelState {
  isVisible: boolean;
  size: number; // width for left/right, height for bottom
  isCollapsed: boolean;
}

export interface UiState {
  // Theme
  theme: ThemeMode;

  // Panel states
  chatPanel: PanelState;
  filePanel: PanelState;
  terminalPanel: PanelState;
  agentPanel: PanelState;

  // Layout
  sidebarWidth: number;
  mainContentWidth: number;

  // Modal states
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;

  // General UI
  isSidebarCollapsed: boolean;
  isFullscreen: boolean;

  // Actions - Theme
  setTheme: (theme: ThemeMode) => void;

  // Actions - Panel visibility
  toggleChatPanel: () => void;
  toggleFilePanel: () => void;
  toggleTerminalPanel: () => void;
  toggleAgentPanel: () => void;

  // Actions - Panel size
  setChatPanelSize: (size: number) => void;
  setFilePanelSize: (size: number) => void;
  setTerminalPanelSize: (size: number) => void;
  setAgentPanelSize: (size: number) => void;

  // Actions - Panel collapse
  toggleChatPanelCollapse: () => void;
  toggleFilePanelCollapse: () => void;
  toggleTerminalPanelCollapse: () => void;
  toggleAgentPanelCollapse: () => void;

  // Actions - Panel management
  showPanel: (panel: 'chat' | 'file' | 'terminal' | 'agent') => void;
  hidePanel: (panel: 'chat' | 'file' | 'terminal' | 'agent') => void;

  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;

  // Actions - Modals
  openSettings: () => void;
  closeSettings: () => void;
  toggleCommandPalette: () => void;

  // Actions - General
  toggleFullscreen: () => void;
  resetLayout: () => void;
}

const DEFAULT_PANEL_SIZES = {
  chat: 400,
  file: 400,
  terminal: 300,
  agent: 350,
};

const DEFAULT_SIDEBAR_WIDTH = 240;

export const useUiStore = create<UiState>()(
  persist(
    immer((set) => ({
      // Theme
      theme: 'system',

      // Panel states
      chatPanel: {
        isVisible: true,
        size: DEFAULT_PANEL_SIZES.chat,
        isCollapsed: false,
      },
      filePanel: {
        isVisible: true,
        size: DEFAULT_PANEL_SIZES.file,
        isCollapsed: false,
      },
      terminalPanel: {
        isVisible: true,
        size: DEFAULT_PANEL_SIZES.terminal,
        isCollapsed: false,
      },
      agentPanel: {
        isVisible: true,
        size: DEFAULT_PANEL_SIZES.agent,
        isCollapsed: false,
      },

      // Layout
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      mainContentWidth: 0, // Calculated dynamically

      // Modal states
      isSettingsOpen: false,
      isCommandPaletteOpen: false,

      // General UI
      isSidebarCollapsed: false,
      isFullscreen: false,

      // Theme actions
      setTheme: (theme: ThemeMode) =>
        set((state) => {
          state.theme = theme;
        }),

      // Panel visibility actions
      toggleChatPanel: () =>
        set((state) => {
          state.chatPanel.isVisible = !state.chatPanel.isVisible;
        }),

      toggleFilePanel: () =>
        set((state) => {
          state.filePanel.isVisible = !state.filePanel.isVisible;
        }),

      toggleTerminalPanel: () =>
        set((state) => {
          state.terminalPanel.isVisible = !state.terminalPanel.isVisible;
        }),

      toggleAgentPanel: () =>
        set((state) => {
          state.agentPanel.isVisible = !state.agentPanel.isVisible;
        }),

      // Panel size actions
      setChatPanelSize: (size: number) =>
        set((state) => {
          state.chatPanel.size = Math.max(200, Math.min(800, size));
        }),

      setFilePanelSize: (size: number) =>
        set((state) => {
          state.filePanel.size = Math.max(200, Math.min(800, size));
        }),

      setTerminalPanelSize: (size: number) =>
        set((state) => {
          state.terminalPanel.size = Math.max(150, Math.min(600, size));
        }),

      setAgentPanelSize: (size: number) =>
        set((state) => {
          state.agentPanel.size = Math.max(200, Math.min(800, size));
        }),

      // Panel collapse actions
      toggleChatPanelCollapse: () =>
        set((state) => {
          state.chatPanel.isCollapsed = !state.chatPanel.isCollapsed;
        }),

      toggleFilePanelCollapse: () =>
        set((state) => {
          state.filePanel.isCollapsed = !state.filePanel.isCollapsed;
        }),

      toggleTerminalPanelCollapse: () =>
        set((state) => {
          state.terminalPanel.isCollapsed = !state.terminalPanel.isCollapsed;
        }),

      toggleAgentPanelCollapse: () =>
        set((state) => {
          state.agentPanel.isCollapsed = !state.agentPanel.isCollapsed;
        }),

      // Panel management actions
      showPanel: (panel: 'chat' | 'file' | 'terminal' | 'agent') =>
        set((state) => {
          switch (panel) {
            case 'chat':
              state.chatPanel.isVisible = true;
              break;
            case 'file':
              state.filePanel.isVisible = true;
              break;
            case 'terminal':
              state.terminalPanel.isVisible = true;
              break;
            case 'agent':
              state.agentPanel.isVisible = true;
              break;
          }
        }),

      hidePanel: (panel: 'chat' | 'file' | 'terminal' | 'agent') =>
        set((state) => {
          switch (panel) {
            case 'chat':
              state.chatPanel.isVisible = false;
              break;
            case 'file':
              state.filePanel.isVisible = false;
              break;
            case 'terminal':
              state.terminalPanel.isVisible = false;
              break;
            case 'agent':
              state.agentPanel.isVisible = false;
              break;
          }
        }),

      // Sidebar actions
      toggleSidebar: () =>
        set((state) => {
          state.isSidebarCollapsed = !state.isSidebarCollapsed;
        }),

      setSidebarWidth: (width: number) =>
        set((state) => {
          state.sidebarWidth = Math.max(180, Math.min(400, width));
        }),

      // Modal actions
      openSettings: () =>
        set((state) => {
          state.isSettingsOpen = true;
        }),

      closeSettings: () =>
        set((state) => {
          state.isSettingsOpen = false;
        }),

      toggleCommandPalette: () =>
        set((state) => {
          state.isCommandPaletteOpen = !state.isCommandPaletteOpen;
        }),

      // General actions
      toggleFullscreen: () =>
        set((state) => {
          state.isFullscreen = !state.isFullscreen;
        }),

      resetLayout: () =>
        set((state) => {
          state.chatPanel = {
            isVisible: true,
            size: DEFAULT_PANEL_SIZES.chat,
            isCollapsed: false,
          };
          state.filePanel = {
            isVisible: true,
            size: DEFAULT_PANEL_SIZES.file,
            isCollapsed: false,
          };
          state.terminalPanel = {
            isVisible: true,
            size: DEFAULT_PANEL_SIZES.terminal,
            isCollapsed: false,
          };
          state.agentPanel = {
            isVisible: true,
            size: DEFAULT_PANEL_SIZES.agent,
            isCollapsed: false,
          };
          state.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
          state.isSidebarCollapsed = false;
        }),
    })),
    {
      name: 'orbit-agent-ui-store',
      partialize: (state) => ({
        theme: state.theme,
        chatPanel: state.chatPanel,
        filePanel: state.filePanel,
        terminalPanel: state.terminalPanel,
        agentPanel: state.agentPanel,
        sidebarWidth: state.sidebarWidth,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
