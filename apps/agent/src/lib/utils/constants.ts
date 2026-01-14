/**
 * ============================================================================
 * CONSTANTS - Single Source of Truth for UI Configuration
 * ============================================================================
 *
 * This file is the SINGLE SOURCE OF TRUTH for all UI-related constants.
 * DO NOT hardcode magic numbers in components - import from here instead.
 *
 * USAGE:
 *   import { SIDEBAR, CHAT_WIDTH, KEYBOARD_SHORTCUTS } from '@/lib/utils/constants';
 *
 * WHEN TO ADD HERE:
 *   - Layout dimensions (widths, heights, padding)
 *   - Timing values (delays, animation durations)
 *   - Threshold values (scroll positions, snap points)
 *   - Configuration objects (keyboard shortcuts, git styles)
 *
 * WHEN NOT TO ADD HERE:
 *   - Component-specific styles (use Tailwind or CSS)
 *   - One-off values used in a single place
 *   - Values that change frequently during development
 *
 * CATEGORIES:
 *   1. LAYOUT DIMENSIONS - Sidebar, panels, chat widths
 *   2. TIMING CONSTANTS - Animations, delays, transitions
 *   3. VIRTUALIZATION & SCROLLING - List rendering, auto-scroll
 *   4. TERMINAL SETTINGS - Font, line limits
 *   5. UI STATE DEFAULTS - Initial state values
 *   6. KEYBOARD SHORTCUTS - Global hotkeys (single source of truth)
 *   7. GIT STATUS STYLING - File status indicators
 *
 * @see @/hooks/ui/use-keyboard-shortcuts.ts - Consumes KEYBOARD_SHORTCUTS
 * @see @/components/layout/resize-handle.tsx - Uses RESIZE_HANDLE
 * ============================================================================
 */

// ============================================
// LAYOUT DIMENSIONS
// ============================================

/**
 * Sidebar width constants
 */
export const SIDEBAR = {
  collapsed: 35,
  expanded: 256,
  iconColumnWidth: 35,
  itemPadding: 12, // 6px mx-1.5 each side
} as const;

/**
 * Header and panel heights
 */
export const HEIGHTS = {
  panelHeader: 32,
  headerBar: 35,
} as const;

/**
 * Default panel sizes for the UI layout
 */
export const PANEL_SIZES = {
  sidebar: {
    default: 256,
    min: 35,
    minUsable: 240, // Minimum width when expanded (can't drag smaller than this)
    max: 400,
    snapThreshold: 180, // Below this, sidebar snaps to collapsed
  },
  review: {
    default: 400,
    min: 300,
    max: 800,
  },
  terminal: {
    default: 200,
    min: 100,
    max: 1990,
  },
  rightSidebar: {
    default: 150,
    min: 100,
    max: 300,
  },
} as const;

/**
 * Chat Layout Width System
 *
 * Layout approach:
 * - Primary (650px max-width): Input box, user message bubbles, content wrapper
 * - Assistant messages: Use padding for consistent narrower width at all screen sizes
 *
 * Uses CSS custom properties (--chat-width-primary) for responsive behavior.
 * The responsive breakpoints in globals.css scale --chat-max-width on smaller screens.
 */
export const CHAT_WIDTH = {
  /** Base max-width for all chat content */
  base: 650,
  /** Input box, user message bubbles, content wrapper */
  primary: 650,
  /** Dropdown menus */
  dropdown: 200,
  /** File name truncation */
  fileName: 200,
} as const;

/**
 * Chat layout spacing
 * Used for consistent margins/padding in chat messages
 */
export const CHAT_SPACING = {
  /** Horizontal padding for assistant messages (9px each side = 18px narrower than user bubble) */
  assistantPadding: 9,
} as const;

/**
 * CSS variable names for chat widths
 * Use these with var() in style props for responsive behavior
 *
 * @example
 * style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${CHAT_WIDTH.primary}px)` }}
 */
export const CHAT_WIDTH_VAR = {
  primary: '--chat-width-primary',
} as const;

/**
 * Input and textarea dimensions
 */
export const INPUT_SIZES = {
  textareaMinHeight: 44,
  textareaMaxHeight: 300,
  editorMinHeight: 80,
  editorMaxHeight: 200,
  emptyStateMinHeight: 200,
  commitMessageMinHeight: 80,
} as const;

/**
 * Resize handle dimensions
 */
export const RESIZE_HANDLE = {
  width: 1,
  hoverWidth: 3,
} as const;

// ============================================
// TIMING CONSTANTS
// ============================================

/**
 * Time units in milliseconds
 */
export const TIME_MS = {
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
} as const;

/**
 * Animation durations in milliseconds
 */
export const ANIMATION_DURATION = {
  instant: 0,
  fast: 100,
  normal: 150,
  slow: 300,
  verySlow: 500,
} as const;

/**
 * Transition configurations
 */
export const TRANSITIONS = {
  sidebar: `${String(ANIMATION_DURATION.normal)}ms ease-in-out`,
  opacity: `${String(ANIMATION_DURATION.fast)}ms ease-in-out`,
  opacityDelay: 50,
} as const;

/**
 * Timeout and delay durations
 */
export const DELAYS = {
  toastDuration: 2000,
  mockResponse: 100,
  debounce: 150,
} as const;

// ============================================
// VIRTUALIZATION & SCROLLING
// ============================================

/**
 * Virtualization settings for lists
 */
export const VIRTUALIZATION = {
  estimatedItemHeight: 200,
  overscan: 5,
} as const;

/**
 * Auto-scroll thresholds
 */
export const SCROLL_THRESHOLD = {
  nearBottom: 100,
  atBottom: 50,
} as const;

// ============================================
// TERMINAL SETTINGS
// ============================================

/**
 * Terminal configuration
 */
export const TERMINAL = {
  fontSize: 13,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  maxOutputLines: 1000,
  minOutputLines: 100,
  /** Gutter width for command decorations - syncs with --terminal-gutter-width in globals.css */
  gutterWidth: 20,
} as const;

// ============================================
// UI STATE DEFAULTS
// ============================================

/**
 * Default UI state values
 */
export const DEFAULT_UI_STATE = {
  leftSidebarOpen: true,
  leftSidebarWidth: SIDEBAR.expanded,
  reviewPanelOpen: false,
  reviewPanelWidth: PANEL_SIZES.review.default,
  rightSidebarOpen: true,
  bottomPanelOpen: false,
  bottomPanelHeight: PANEL_SIZES.terminal.default,
} as const;

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcutDef {
  /** Key to press (e.g., 'k', 'Enter', 'Escape') */
  key: string;
  /** Requires Cmd (Mac) / Ctrl (Windows/Linux) */
  cmd?: boolean;
  /** Requires Shift key */
  shift?: boolean;
  /** Requires Alt/Option key */
  alt?: boolean;
  /** Human-readable description */
  description: string;
  /** Custom event name to dispatch */
  event: string;
  /** Whether to prevent default browser behavior (default: true) */
  preventDefault?: boolean;
}

/**
 * Keyboard shortcuts for the application
 * Single source of truth - used by useKeyboardShortcuts hook
 */
export const KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcutDef> = {
  // Command palette & settings
  openCommandPalette: {
    key: 'k',
    cmd: true,
    description: 'Open command palette',
    event: 'openCommandPalette',
  },
  openSettings: {
    key: ',',
    cmd: true,
    description: 'Open settings',
    event: 'openSettings',
  },

  // Sidebar & panels
  toggleLeftSidebar: {
    key: '/',
    cmd: true,
    description: 'Toggle left sidebar',
    event: 'toggleLeftSidebar',
  },
  toggleActivityPanel: {
    key: 'b',
    cmd: true,
    description: 'Toggle activity panel',
    event: 'toggleActivityPanel',
  },
  toggleFileBrowser: {
    key: 'e',
    cmd: true,
    description: 'Toggle file browser',
    event: 'toggleFileBrowser',
  },
  toggleTerminal: {
    key: 'j',
    cmd: true,
    description: 'Toggle terminal',
    event: 'toggleTerminal',
  },

  // File operations
  quickOpenFile: {
    key: 'p',
    cmd: true,
    description: 'Quick open file',
    event: 'quickOpenFile',
  },
  saveFile: {
    key: 's',
    cmd: true,
    description: 'Save current file',
    event: 'saveFile',
  },
  saveAllFiles: {
    key: 's',
    cmd: true,
    shift: true,
    description: 'Save all files',
    event: 'saveAllFiles',
  },
  closeFile: {
    key: 'w',
    cmd: true,
    description: 'Close current file',
    event: 'closeFile',
  },

  // Agent
  startAgentTask: {
    key: 'Enter',
    cmd: true,
    description: 'Start agent task',
    event: 'startAgentTask',
  },
  cancel: {
    key: 'Escape',
    description: 'Cancel/Close',
    event: 'cancel',
    preventDefault: false,
  },

  // Navigation & search
  goToLine: {
    key: 'g',
    cmd: true,
    description: 'Go to line',
    event: 'goToLine',
  },
  findInFile: {
    key: 'f',
    cmd: true,
    description: 'Find in file',
    event: 'findInFile',
  },
  findInWorkspace: {
    key: 'f',
    cmd: true,
    shift: true,
    description: 'Find in workspace',
    event: 'findInWorkspace',
  },

  // Edit operations (browser defaults, no custom handling)
  undo: {
    key: 'z',
    cmd: true,
    description: 'Undo',
    event: 'undo',
    preventDefault: false,
  },
  redo: {
    key: 'z',
    cmd: true,
    shift: true,
    description: 'Redo',
    event: 'redo',
    preventDefault: false,
  },
} as const;

// ============================================
// GIT STATUS STYLING
// ============================================

/**
 * Git file status display configuration
 * Used by file explorer, file tabs, and source control panel
 */
export interface GitStatusStyle {
  /** Single character label (A, M, D, etc.) */
  label: string;
  /** Tailwind text color class */
  color: string;
  /** Human-readable description */
  title: string;
}

/**
 * Styling for each git file status type
 */
export const GIT_STATUS_STYLES = {
  added: { label: 'A', color: 'text-green-500', title: 'Added' },
  modified: { label: 'M', color: 'text-yellow-500', title: 'Modified' },
  deleted: { label: 'D', color: 'text-red-500', title: 'Deleted' },
  renamed: { label: 'R', color: 'text-blue-500', title: 'Renamed' },
  copied: { label: 'C', color: 'text-blue-500', title: 'Copied' },
  untracked: { label: 'U', color: 'text-gray-400', title: 'Untracked' },
  conflicted: { label: '!', color: 'text-orange-500', title: 'Conflict' },
  typechange: { label: 'T', color: 'text-purple-500', title: 'Type Changed' },
} as const satisfies Record<string, GitStatusStyle>;

// =============================================================================
// Terminal Panel (shared between chat-area and activity-panel)
// =============================================================================

/**
 * Terminal panel sizing constants
 * Used by both chat-area.tsx and activity-panel.tsx for consistent terminal behavior
 */
export const TERMINAL_PANEL = {
  /** Minimum height in pixels */
  MIN_HEIGHT: 35,
  /** Height when collapsed (shows header only) */
  COLLAPSED_HEIGHT: 35,
  /** Minimum drag size to persist - prevents saving collapsed state as "open" */
  DRAG_THRESHOLD: 50,
} as const;

// =============================================================================
// Activity Panel
// =============================================================================

/**
 * Activity panel sizing and layout constants
 */
export const ACTIVITY_PANEL = {
  PREFERRED_WIDTH: '35%',
  MIN_WIDTH: 250,
  MAX_WIDTH: 800,
  /** Tabs header height in pixels */
  TABS_HEADER_HEIGHT: 35,
} as const;

// =============================================================================
// Chat Panel
// =============================================================================

/**
 * Chat panel sizing constants
 */
export const CHAT_PANEL = {
  MIN_WIDTH: 300,
  /** Width when activity panel is open */
  WITH_ACTIVITY_WIDTH: '65%',
} as const;
