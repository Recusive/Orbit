/**
 * Page Composition Types for Design System Canvas
 *
 * Types for composing multiple components into full pages with
 * layout management, slots, and viewport configuration.
 */

import type { ViewportType } from '../sandpack/sandpackConfig';

/**
 * Page layout type
 * 'stack' is an alias for 'flex' with column direction
 */
export type PageLayoutType = 'flex' | 'grid' | 'absolute' | 'stack';

/**
 * Flex direction
 */
export type FlexDirection = 'row' | 'column';

/**
 * Grid template configuration
 */
export interface GridTemplate {
  columns: string;
  rows: string;
  areas?: string | string[];
}

/**
 * Page layout configuration
 */
export interface PageLayout {
  type: PageLayoutType;
  direction?: FlexDirection;
  wrap?: boolean;
  gap?: string;
  padding?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplate?: GridTemplate;
}

/**
 * Page background configuration
 */
export interface PageBackground {
  color?: string;
  gradient?: string;
  image?: string;
  size?: 'cover' | 'contain' | 'auto';
  position?: string;
}

/**
 * Anchor point for absolute positioning
 */
export type AnchorPoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Slot position configuration
 */
export interface SlotPosition {
  mode: 'flow' | 'absolute';
  // Flow mode properties
  gridArea?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  alignSelf?: string;
  justifySelf?: string;
  order?: number;
  // Absolute mode properties
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  anchor?: AnchorPoint;
}

/**
 * Component slot within a page
 */
export interface ComponentSlot {
  id: string;
  layerId: string;
  componentId: string; // Reference to SandpackNode
  position: SlotPosition;
  zIndex: number;
  visible: boolean;
  props?: Record<string, unknown>;
}

/**
 * Page node data for ReactFlow
 */
export interface PageNodeData {
  name: string;
  description?: string;
  layout: PageLayout;
  viewport: ViewportType;
  customSize?: { width: number; height: number };
  background?: PageBackground;
  slots: ComponentSlot[];
  // Index signature for ReactFlow Node data compatibility
  [key: string]: unknown;
}

/**
 * Default page layout
 */
export const DEFAULT_PAGE_LAYOUT: PageLayout = {
  type: 'flex',
  direction: 'column',
  gap: '16px',
  padding: '24px',
  alignItems: 'stretch',
  justifyContent: 'flex-start',
};

/**
 * Default page node data
 */
export function createDefaultPageData(name = 'New Page'): PageNodeData {
  return {
    name,
    layout: { ...DEFAULT_PAGE_LAYOUT },
    viewport: 'desktop',
    slots: [],
  };
}

/**
 * Create a new component slot
 */
export function createComponentSlot(
  componentId: string,
  layerId: string,
  options?: Partial<ComponentSlot>
): ComponentSlot {
  return {
    id: `slot-${String(Date.now())}-${Math.random().toString(36).substring(2, 11)}`,
    layerId,
    componentId,
    position: { mode: 'flow' },
    zIndex: 0,
    visible: true,
    ...options,
  };
}

/**
 * Layout preset configurations
 */
export const LAYOUT_PRESETS = {
  'single-column': {
    type: 'flex' as const,
    direction: 'column' as const,
    gap: '24px',
    padding: '24px',
    alignItems: 'center',
  },
  'two-column': {
    type: 'grid' as const,
    gridTemplate: {
      columns: '1fr 1fr',
      rows: 'auto',
    },
    gap: '24px',
    padding: '24px',
  },
  'sidebar-left': {
    type: 'grid' as const,
    gridTemplate: {
      columns: '280px 1fr',
      rows: '1fr',
      areas: '"sidebar main"',
    },
    gap: '0',
    padding: '0',
  },
  'sidebar-right': {
    type: 'grid' as const,
    gridTemplate: {
      columns: '1fr 280px',
      rows: '1fr',
      areas: '"main sidebar"',
    },
    gap: '0',
    padding: '0',
  },
  'header-main-footer': {
    type: 'grid' as const,
    gridTemplate: {
      columns: '1fr',
      rows: 'auto 1fr auto',
      areas: '"header" "main" "footer"',
    },
    gap: '0',
    padding: '0',
  },
  dashboard: {
    type: 'grid' as const,
    gridTemplate: {
      columns: '240px 1fr',
      rows: '64px 1fr',
      areas: '"sidebar header" "sidebar main"',
    },
    gap: '0',
    padding: '0',
  },
  'free-form': {
    type: 'absolute' as const,
    padding: '0',
  },
} as const;

export type LayoutPreset = keyof typeof LAYOUT_PRESETS;
