/**
 * ============================================================================
 * CONSTANTS - Single Source of Truth for UI Configuration
 * ============================================================================
 *
 * This file is the SINGLE SOURCE OF TRUTH for all UI-related constants.
 * DO NOT hardcode magic numbers in components - import from here instead.
 *
 * USAGE:
 *   import { SIDEBAR, CHAT_WIDTH, KEYBOARD_SHORTCUTS } from '@/lib/utils';
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
  itemHeight: 32,
  searchBarHeight: 32,
  tabNavHeight: 40,
  previewBadgeFontSize: 9,
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
  hoverWidth: 1,
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
 * Transition configurations (inline style values)
 */
export const TRANSITIONS = {
  /** Sidebar container width transition (paired with child opacity) */
  sidebar: `${String(ANIMATION_DURATION.normal)}ms cubic-bezier(0.165, 0.84, 0.44, 1)`,
  /** Child element opacity during sidebar collapse/expand */
  opacity: `${String(ANIMATION_DURATION.fast)}ms ease-out`,
  /** Delay before opacity starts (lets container begin moving first) */
  opacityDelay: 50,
} as const;

/**
 * CSS transition string for child element opacity during sidebar collapse/expand.
 *
 * When collapsing: instant opacity (0ms) so content disappears immediately.
 * When expanding: delayed fade-in so the container width starts animating first.
 *
 * Shared across SidebarItem, ConversationItem, WorkspaceItem, and WorktreeItem.
 */
export const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? 'opacity 0ms'
    : `opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

/**
 * Popover / overlay animation configuration.
 *
 * Single source of truth for every enter/exit animation on tooltips,
 * hover-cards, dropdown-menus, and custom popovers (ModelSelector).
 *
 * @see components/ui/tooltip.tsx
 * @see components/ui/hover-card.tsx
 * @see components/ui/dropdown-menu.tsx
 * @see components/chat/input/model-selector.tsx
 */
export const POPOVER_ANIMATION = {
  /** Duration in milliseconds (for JS timeouts — matches the longer of enter/exit) */
  durationMs: 150,
  /** Enter duration: rich 3-property animation needs a bit more time */
  enterDuration: '150ms',
  /** Exit duration: fade-only is perceived faster, so a shorter duration avoids lingering */
  exitDuration: '100ms',
  /** Exit duration in ms (for JS timeouts) */
  exitDurationMs: 100,
  /** Enter easing: ease-out (fast arrival, gentle settle) */
  enterEasing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Exit easing: ease-in (gentle start, fast departure — opposite of enter) */
  exitEasing: 'cubic-bezier(0.4, 0, 1, 1)',
  /**
   * Unified duration for Radix primitives (tooltip, hover-card, dropdown-menu, popover,
   * context-menu) that apply a single animationDuration on a container whose enter/exit
   * is toggled via data-[state=open/closed] CSS selectors.
   *
   * For custom popovers with JS-controlled enter/exit (like ModelSelector),
   * prefer enterDuration / exitDuration + enterEasing / exitEasing instead.
   */
  duration: '150ms',
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

/**
 * Reusable Tailwind transition class patterns.
 *
 * These are the most common transition combinations used across input controls,
 * dropdowns, and toolbar buttons. Centralised here to avoid divergence when
 * updating timing or properties.
 *
 * @see InputControls, ModelSelector, ThinkingModeButton, MoreActionsMenu
 */
export const TRANSITION_CLASSES = {
  /** Standard interactive button: bg-color + text color + transform at 150ms */
  button: 'transition-[background-color,color,transform] duration-150',
  /** Popover/dropdown list item: bg-color + transform at 150ms */
  item: 'transition-[background-color,transform] duration-150',
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
  /** When true, ChatArea is "detached" and rendered elsewhere (e.g., canvas expanded view) */
  chatAreaDetached: false,
} as const;

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcutDef {
  /** Key to press (e.g., 'k', 'Enter', 'Escape') */
  key: string;
  /** Requires Cmd (Mac) / Ctrl (Windows/Linux) - platform-aware command key */
  cmd?: boolean;
  /** Requires Ctrl key on ALL platforms (literal Ctrl, even on Mac) */
  ctrl?: boolean;
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
  /** Allow shortcut to trigger while typing in inputs/textareas (default: false) */
  allowInInput?: boolean;
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
  // Alternative binding for non-US keyboards where / requires Shift
  toggleLeftSidebarAlt: {
    key: '.',
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
    description: 'Toggle editor panel',
    event: 'toggleFileBrowser',
  },
  toggleTerminal: {
    key: 'j',
    cmd: true,
    description: 'Toggle terminal',
    event: 'toggleTerminal',
  },
  openSourceControl: {
    key: 'g',
    cmd: false,
    ctrl: true,
    shift: true,
    description: 'Open source control',
    event: 'openSourceControl',
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
    allowInInput: true, // Escape should work in inputs to close dialogs, popovers, etc.
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
    description: 'Find in workspace (Quick Open)',
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
  /** Tailwind text color class for the badge */
  color: string;
  /** Tailwind text color class for the filename (VSCode-style status tinting) */
  fileColor: string;
  /** Human-readable description */
  title: string;
}

/**
 * Styling for each git file status type
 */
export const GIT_STATUS_STYLES = {
  added: { label: 'A', color: 'text-green-500', fileColor: 'text-green-500', title: 'Added' },
  modified: {
    label: 'M',
    color: 'text-yellow-500',
    fileColor: 'text-yellow-500',
    title: 'Modified',
  },
  deleted: { label: 'D', color: 'text-red-500', fileColor: 'text-red-500', title: 'Deleted' },
  renamed: { label: 'R', color: 'text-blue-500', fileColor: 'text-blue-500', title: 'Renamed' },
  copied: { label: 'C', color: 'text-blue-500', fileColor: 'text-blue-500', title: 'Copied' },
  untracked: { label: 'U', color: 'text-blue-400', fileColor: 'text-blue-400', title: 'Untracked' },
  conflicted: {
    label: '!',
    color: 'text-orange-500',
    fileColor: 'text-orange-500',
    title: 'Conflict',
  },
  typechange: {
    label: 'T',
    color: 'text-purple-500',
    fileColor: 'text-purple-500',
    title: 'Type Changed',
  },
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
 *
 * MIN_WIDTH prevents the chat panel from becoming too narrow for the input toolbar.
 * At widths below INPUT_CONTROLS.collapseBreakpoint (520px), the toolbar collapses
 * into compact mode but remains functional down to 400px.
 */
export const CHAT_PANEL = {
  MIN_WIDTH: 400,
  /** Width when activity panel is open */
  WITH_ACTIVITY_WIDTH: '65%',
} as const;

// =============================================================================
// Input Controls
// =============================================================================

/**
 * Input controls responsive behavior
 *
 * When the toolbar gets too narrow, secondary buttons (@, Thinking, Globe)
 * collapse into a "More actions" dropdown menu. The Image button stays
 * visible for quick attachment access.
 *
 * **Expanded mode** (width >= collapseBreakpoint):
 *   Mode | Model | @ | Thinking | Globe | Image | Context | Send
 *
 * **Compact mode** (width < collapseBreakpoint):
 *   Mode | Model | MoreActions[⋯] | Image | Context | Send
 *   (@ / Thinking / Globe are inside the MoreActions dropdown)
 */
export const INPUT_CONTROLS = {
  /**
   * Width below which secondary buttons collapse into "More actions" menu.
   *
   * Compact mode calculation (what's visible when collapsed):
   * - Mode Picker: ~70px (varies: "Default"/"Plan"/"Accept")
   * - Model Selector: ~110px (varies by model name)
   * - Image Button: 28px (h-7 w-7)
   * - More Actions trigger: 28px (h-7 w-7)
   * - Context Usage: ~60px
   * - Send Button: 28px (h-7 w-7)
   * - Gaps: ~12px (gap-0.5 × 6)
   * - Buffer: ~50px safety margin
   * Total: ~386px minimum + buffer ≈ 440px
   *
   * Set to 400px - tight fit for expanded mode with no buffer.
   */
  collapseBreakpoint: 400,
} as const;
