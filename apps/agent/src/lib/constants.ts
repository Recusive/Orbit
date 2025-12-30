// ============================================
// LAYOUT DIMENSIONS
// ============================================

/**
 * Sidebar width constants
 */
export const SIDEBAR = {
  collapsed: 40,
  expanded: 256,
  iconColumnWidth: 40,
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
    min: 40,
    max: 400,
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
 * Content width constraints
 */
export const CONTENT_WIDTH = {
  inputBox: 800,
  messageFeed: '48rem', // max-w-3xl
  dropdown: 200,
  fileName: 200,
  expandedContent: 400,
} as const;

/**
 * Input and textarea dimensions
 */
export const INPUT_SIZES = {
  textareaMinHeight: 44,
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
} as const;

// ============================================
// TYPOGRAPHY
// ============================================

/**
 * Font sizes
 */
export const FONT_SIZE = {
  tiny: 10,
  small: 12,
  base: 14,
  large: 16,
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
  rightSidebarOpen: false,
  bottomPanelOpen: false,
  bottomPanelHeight: PANEL_SIZES.terminal.default,
} as const;

/**
 * Keyboard shortcuts for the application
 */
export const KEYBOARD_SHORTCUTS = {
  toggleSidebar: 'cmd+b',
  toggleTerminal: 'cmd+j',
  focusChat: 'cmd+i',
  newSession: 'cmd+n',
  search: 'cmd+f',
  openSettings: 'cmd+,',
} as const;

/**
 * File extension to icon name mapping
 */
export const FILE_ICONS: Record<string, string> = {
  // Programming languages
  ts: 'typescript',
  tsx: 'react',
  js: 'javascript',
  jsx: 'react',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',

  // Web technologies
  html: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'less',
  vue: 'vue',

  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',

  // Documentation
  md: 'markdown',
  mdx: 'markdown',
  txt: 'text',

  // Config files
  env: 'settings',
  config: 'settings',

  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',

  // Default
  default: 'file',
} as const;

/**
 * Agent execution phases
 */
export const AGENT_PHASES = [
  'initializing',
  'analyzing',
  'planning',
  'executing',
  'validating',
  'completed',
  'error',
] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

/**
 * Available Claude model options
 */
export const MODEL_OPTIONS = [
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Most capable model, best for complex tasks',
    tier: 'premium',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and speed',
    tier: 'standard',
  },
  {
    id: 'claude-sonnet-3-5-20241022',
    name: 'Claude Sonnet 3.5',
    description: 'Previous generation, fast and efficient',
    tier: 'standard',
  },
  {
    id: 'claude-haiku-3-5-20241022',
    name: 'Claude Haiku 3.5',
    description: 'Fastest model, great for simple tasks',
    tier: 'economy',
  },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
export type ModelId = ModelOption['id'];
export type ModelTier = ModelOption['tier'];

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
