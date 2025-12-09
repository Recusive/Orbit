/**
 * Default panel sizes for the UI layout
 */
export const PANEL_SIZES = {
  sidebar: {
    default: 280,
    min: 200,
    max: 400,
  },
  chat: {
    default: 400,
    min: 300,
    max: 600,
  },
  terminal: {
    default: 300,
    min: 150,
    max: 500,
  },
} as const;

/**
 * Animation durations in milliseconds
 */
export const ANIMATION_DURATION = {
  fast: 150,
  normal: 300,
  slow: 500,
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

export type AgentPhase = typeof AGENT_PHASES[number];

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

export type ModelOption = typeof MODEL_OPTIONS[number];
export type ModelId = ModelOption['id'];
export type ModelTier = ModelOption['tier'];
