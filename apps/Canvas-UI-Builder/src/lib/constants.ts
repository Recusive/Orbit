/**
 * Canvas UI Builder Design Constants
 *
 * Centralized design tokens for consistent styling across the Canvas UI.
 * Import these values instead of hardcoding sizes, colors, and spacing.
 */

// ============================================
// Colors
// ============================================

export const COLORS = {
  // Backgrounds
  background: 'bg-background',
  card: 'bg-card',
  sidebar: 'bg-sidebar',
  muted: 'bg-muted',
  mutedSubtle: 'bg-muted/50',

  // Text
  foreground: 'text-foreground',
  mutedForeground: 'text-muted-foreground',

  // Borders
  border: 'border-border',
  borderSubtle: 'border-border/50',
} as const;

// ============================================
// Borders
// ============================================

export const BORDER = {
  bottom: 'border-b border-border',
  bottomSubtle: 'border-b border-border/50',
} as const;

// ============================================
// Layout
// ============================================

export const HEADER = {
  height: 'h-[35px]',
  padding: 'px-4',
  paddingSidebar: 'px-3',
  gap: 'gap-6',
  background: 'bg-card',
  border: 'border-b border-border',
} as const;

// ============================================
// Spacing
// ============================================

export const SPACING = {
  buttonGroup: 'gap-1.5',
  emptyState: 'p-4',
  categoryItems: 'pb-2',
  categoriesList: 'py-1',
} as const;

// ============================================
// Tabs
// ============================================

export const TAB = {
  height: 'h-6',
  padding: 'px-2.5',
  fontSize: 'text-xs',
  fontWeight: 'font-medium',
  borderRadius: 'rounded-md',
  gap: 'gap-1',
  // States
  active: 'bg-muted text-foreground',
  inactive: 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
} as const;

// ============================================
// Tab Switcher (compact pill-style)
// ============================================

export const TAB_SWITCHER = {
  container: {
    gap: 'gap-0.5',
    padding: 'p-0.5',
    background: 'bg-muted/50',
    borderRadius: 'rounded-md',
    border: 'border border-border/40',
  },
  button: {
    height: 'h-5',
    padding: 'px-2',
    fontSize: 'text-[9px]',
    fontWeight: 'font-medium',
    borderRadius: 'rounded',
    layout: 'flex items-center justify-center leading-none',
    active: 'bg-card text-foreground shadow-sm',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
} as const;

// ============================================
// Buttons
// ============================================

export const BUTTON = {
  // Canvas header buttons
  header: {
    height: 'h-6',
    padding: 'px-2',
    paddingWide: 'px-2.5',
    fontSize: 'text-xs',
    iconSize: 'h-3.5 w-3.5',
    gap: 'gap-1.5',
  },
} as const;

// ============================================
// Zoom Controls
// ============================================

export const ZOOM = {
  container: {
    gap: 'gap-0.5',
    padding: 'p-0.5',
    background: 'bg-muted/50',
    borderRadius: 'rounded-md',
    border: 'border border-border/40',
  },
  button: {
    size: 'w-5 h-5',
    iconSize: 'h-2.5 w-2.5',
    base: 'flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-colors',
  },
  text: {
    minWidth: 'min-w-6',
    fontSize: 'text-[9px]',
    color: 'text-muted-foreground',
    align: 'text-center',
  },
  // Limits
  min: 25,
  max: 200,
  step: 10,
  default: 100,
} as const;

// ============================================
// Device Preview
// ============================================

export const DEVICE_TAB = {
  height: 'h-6',
  padding: 'px-2.5',
  fontSize: 'text-xs',
  fontWeight: 'font-medium',
  borderRadius: 'rounded-md',
  gap: 'gap-1',
  active: 'bg-muted text-foreground',
  inactive: 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
} as const;

// ============================================
// Logo / Branding
// ============================================

export const LOGO = {
  gap: 'gap-1.5',
  title: {
    fontSize: 'text-lg',
    fontWeight: 'font-semibold',
    whitespace: 'whitespace-nowrap',
  },
  badge: {
    background: 'bg-primary/8',
    color: 'text-primary/70',
    borderRadius: 'rounded-full',
    padding: 'px-1.5 py-0.5',
    fontWeight: 'font-medium',
    tracking: 'tracking-wide',
    whitespace: 'whitespace-nowrap',
    fontSize: '9px', // inline style
  },
} as const;

// ============================================
// Section Headers (Sidebar panels)
// ============================================

export const SECTION_HEADER = {
  fontSize: 'text-xs',
  fontWeight: 'font-semibold',
  color: 'text-muted-foreground',
  textTransform: 'uppercase',
  letterSpacing: 'tracking-wider',
} as const;

// ============================================
// Panels
// ============================================

export const PANEL = {
  preview: {
    background: 'bg-chat-area',
  },
  sidebar: {
    background: 'bg-sidebar',
  },
  emptyState: {
    padding: 'p-4',
    textSize: 'text-sm',
    textColor: 'text-muted-foreground',
  },
} as const;

// ============================================
// Canvas Preview Area
// ============================================

export const CANVAS = {
  padding: 'p-6',
  minHeight: 'min-h-[400px]',
  borderRadius: 'rounded-xl',
  border: 'border-2 border-dashed border-border',
  background: 'bg-card/50',
  emptyState: {
    iconSize: 'h-12 w-12',
    iconOpacity: 'opacity-30',
    iconMargin: 'mb-3',
    textSize: 'text-sm',
    textColor: 'text-muted-foreground',
  },
} as const;

// ============================================
// Collapsible Categories (Sidebar)
// ============================================

export const CATEGORY = {
  wrapper: {
    border: 'border-b border-border/50',
    borderLast: 'last:border-b-0',
  },
  button: {
    padding: 'px-3 py-2',
    fontSize: 'text-sm',
    fontWeight: 'font-medium',
    color: 'text-foreground',
    hover: 'hover:bg-muted/50',
  },
  chevron: {
    size: 'h-3.5 w-3.5',
    color: 'text-muted-foreground',
  },
  icon: {
    size: 'h-4 w-4',
  },
  items: {
    padding: 'pb-2',
  },
  item: {
    padding: 'px-3 py-1.5 pl-9',
    fontSize: 'text-xs',
    color: 'text-muted-foreground',
    hover: 'hover:bg-muted/50 hover:text-foreground',
  },
  list: {
    padding: 'py-1',
  },
} as const;
