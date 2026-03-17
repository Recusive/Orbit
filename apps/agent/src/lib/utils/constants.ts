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
  collapsed: 0,
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
    min: 0,
    minUsable: 240, // Minimum width when expanded (can't drag smaller than this)
    max: 400,
    snapThreshold: 180, // Below this, sidebar snaps to collapsed
  },
  review: {
    default: 400,
    min: 300,
    max: 9999, // No static cap — getActivityMax in App.tsx dynamically caps based on CHAT_PANEL.MIN_WIDTH
  },
  terminal: {
    default: 200,
    min: 100,
    max: 9999,
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
  /** Persistent separator line width (generic resize handles) */
  width: 1,
  /** Accent indicator line width on hover/drag/focus */
  hoverWidth: 3,
  /** Full interactive hit area width (sidebar resize handle) */
  hitArea: 8,
} as const;

/**
 * Content card layout (Dia-style floating card)
 *
 * The app uses a dark base layer with a floating rounded content card.
 * When the sidebar is open, the card has no left margin (touches sidebar).
 * When closed, uniform margins on all sides.
 */
export const CONTENT_CARD = {
  borderRadius: 10,
  margin: 10,
  /** Inter-card gap — resize handles occupy this space instead of card margins */
  gap: 4,
  transition: '200ms cubic-bezier(0.165, 0.84, 0.44, 1)',
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
  /** Standard interactive button: transform only at 75ms (bg/color are instant for snappy feel) */
  button: 'transition-transform duration-75',
  /** Popover/dropdown list item: transform only at 75ms (bg is instant for pointer tracking) */
  item: 'transition-transform duration-75',
} as const;

/**
 * Launch sequence animation timing.
 *
 * Controls the choreographed intro when the app opens in welcome state:
 *   idle → wallpaper fade → ASCII beam → sidebar reveal → complete
 *
 * @see docs/plans/launch-sequence-animation.md
 * @see stores/ui/launch-sequence-store.ts
 */
export const LAUNCH_SEQUENCE = {
  /** Phase 1: wallpaper opacity 0→1 (page-level transition, intentionally > 300ms) */
  wallpaperFadeDuration: 800,
  /** Pause before ASCII starts — gives the eye time to register the wallpaper */
  wallpaperToAsciiDelay: 200,
  /** Duration for the cinematic sidebar reveal (slower than normal 200ms toggle) */
  sidebarRevealDuration: 500,
  /** Easing for sidebar reveal — same family as normal sidebar, just slower */
  sidebarRevealEasing: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  /** Buffer after sidebar reveal completes (500ms transition + 100ms safety) */
  sidebarRevealDelay: 600,
  /** Delay before account toast fires after sequence completes */
  toastDelay: 400,
  /** Wallpaper fade easing — ease-out-quint for dramatic entrance */
  wallpaperEasing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  /** Watchdog epsilon — added to wallpaperFadeDuration as fallback if transitionend never fires */
  watchdogEpsilon: 120,
} as const;

/**
 * Timeout and delay durations
 */
export const DELAYS = {
  toastDuration: 2000,
  mockResponse: 100,
  debounce: 150,
} as const;

/** Delay before clearing isAgentRunning after a tool-using turn completes. */
export const AGENT_RUNNING_CLEAR_DELAY_MS = 1500;

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
    key: 's',
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
  toggleVault: {
    key: 'v',
    cmd: true,
    shift: true,
    description: 'Toggle vault',
    event: 'toggleVault',
  },
  openSourceControl: {
    key: 'g',
    cmd: false,
    ctrl: true,
    shift: true,
    description: 'Open source control',
    event: 'openSourceControl',
  },

  // Session
  newSession: {
    key: 'n',
    cmd: true,
    description: 'New session',
    event: 'newSession',
  },
  openProjects: {
    key: 't',
    cmd: true,
    description: 'Open projects',
    event: 'openProjects',
  },

  // File operations
  quickOpenFile: {
    key: 'p',
    cmd: true,
    description: 'Quick open file',
    event: 'quickOpenFile',
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
  added: { label: 'A', color: 'text-git-added', fileColor: 'text-git-added', title: 'Added' },
  modified: {
    label: 'M',
    color: 'text-git-modified',
    fileColor: 'text-git-modified',
    title: 'Modified',
  },
  deleted: {
    label: 'D',
    color: 'text-git-deleted',
    fileColor: 'text-git-deleted',
    title: 'Deleted',
  },
  renamed: {
    label: 'R',
    color: 'text-git-renamed',
    fileColor: 'text-git-renamed',
    title: 'Renamed',
  },
  copied: { label: 'C', color: 'text-git-copied', fileColor: 'text-git-copied', title: 'Copied' },
  untracked: {
    label: 'U',
    color: 'text-git-untracked',
    fileColor: 'text-git-untracked',
    title: 'Untracked',
  },
  conflicted: {
    label: '!',
    color: 'text-git-conflicted',
    fileColor: 'text-git-conflicted',
    title: 'Conflict',
  },
  typechange: {
    label: 'T',
    color: 'text-git-typechange',
    fileColor: 'text-git-typechange',
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
 * Fixed at 400px regardless of window size.
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
 * When the toolbar gets too narrow, the Thinking/Effort button collapses
 * into a "More actions" dropdown menu. Image button stays visible.
 *
 * **Expanded mode** (width >= collapseBreakpoint):
 *   Mode | Model | Effort/Thinking | Image | Context | Send
 *
 * **Compact mode** (width < collapseBreakpoint):
 *   Mode | Model | MoreActions[⋯] | Image | Context | Send
 */
export const INPUT_CONTROLS = {
  /**
   * Width below which Thinking/Effort collapses into "More actions" menu.
   *
   * Expanded mode calculation:
   * - Mode Picker: ~70px
   * - Model Selector: ~110px
   * - Effort/Thinking: ~50px
   * - Image Button: 28px
   * - Context Usage: ~60px
   * - Send Button: 28px + 6px margin
   * - Gaps: ~10px
   * Total: ~362px → breakpoint at 340px with comfortable margin.
   */
  collapseBreakpoint: 340,
} as const;
