import { z } from 'zod';

/**
 * Theme mode enum
 */
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  AUTO = 'auto',
}

/**
 * View mode enum
 */
export enum ViewMode {
  CHAT = 'chat',
  SPLIT = 'split',
  FULL = 'full',
}

/**
 * Panel type enum
 */
export enum PanelType {
  CHAT = 'chat',
  EDITOR = 'editor',
  TERMINAL = 'terminal',
  FILE_TREE = 'fileTree',
  DIFF = 'diff',
  TASKS = 'tasks',
  HISTORY = 'history',
}

/**
 * Notification type enum
 */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

/**
 * Panel sizes schema
 */
export const PanelSizesSchema = z.object({
  sidebar: z.number().min(0).max(100),
  main: z.number().min(0).max(100),
  secondary: z.number().min(0).max(100).optional(),
  terminal: z.number().min(0).max(100).optional(),
});

/**
 * Panel state schema
 */
export const PanelStateSchema = z.object({
  type: z.enum(PanelType),
  visible: z.boolean(),
  collapsed: z.boolean().optional(),
  pinned: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  position: z.enum(['left', 'right', 'top', 'bottom', 'center']).optional(),
  order: z.number().optional(),
});

/**
 * Layout configuration schema
 */
export const LayoutConfigSchema = z.object({
  viewMode: z.enum(ViewMode),
  panels: z.array(PanelStateSchema),
  sizes: PanelSizesSchema,
  showSidebar: z.boolean(),
  sidebarCollapsed: z.boolean().optional(),
  showTerminal: z.boolean(),
  terminalCollapsed: z.boolean().optional(),
});

/**
 * Notification schema
 */
export const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum(NotificationType),
  title: z.string(),
  message: z.string().optional(),
  timestamp: z.number(),
  duration: z.number().optional(), // Auto-dismiss duration in ms
  dismissible: z.boolean().optional(),
  actions: z
    .array(
      z.object({
        label: z.string(),
        action: z.string(),
        primary: z.boolean().optional(),
      })
    )
    .optional(),
});

/**
 * Modal state schema
 */
export const ModalStateSchema = z.object({
  id: z.string(),
  type: z.string(),
  visible: z.boolean(),
  title: z.string().optional(),
  data: z.any().optional(),
  closable: z.boolean().optional(),
  size: z.enum(['small', 'medium', 'large', 'fullscreen']).optional(),
});

/**
 * Loading state schema
 */
export const LoadingStateSchema = z.object({
  isLoading: z.boolean(),
  message: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
});

/**
 * Scroll state schema
 */
export const ScrollStateSchema = z.object({
  scrollTop: z.number(),
  scrollHeight: z.number(),
  clientHeight: z.number(),
  isAtBottom: z.boolean(),
  isAtTop: z.boolean(),
});

/**
 * Selection state schema
 */
export const SelectionStateSchema = z.object({
  selectedItems: z.array(z.string()),
  focusedItem: z.string().optional(),
  selectionMode: z.enum(['single', 'multiple']).optional(),
});

/**
 * Search state schema
 */
export const SearchStateSchema = z.object({
  query: z.string(),
  filters: z.record(z.string(), z.any()).optional(),
  results: z.array(z.any()).optional(),
  isSearching: z.boolean(),
  totalResults: z.number().optional(),
});

/**
 * UI preferences schema
 */
export const UIPreferencesSchema = z.object({
  theme: z.enum(ThemeMode),
  fontSize: z.number().min(8).max(32).optional(),
  fontFamily: z.string().optional(),
  lineHeight: z.number().min(1).max(3).optional(),
  compactMode: z.boolean().optional(),
  showLineNumbers: z.boolean().optional(),
  wordWrap: z.boolean().optional(),
  animations: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  autoSave: z.boolean().optional(),
  autoScroll: z.boolean().optional(),
});

/**
 * Keyboard shortcut schema
 */
export const KeyboardShortcutSchema = z.object({
  id: z.string(),
  command: z.string(),
  keys: z.string(), // e.g., "Ctrl+Shift+P", "Cmd+K Cmd+S"
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  context: z.string().optional(), // When the shortcut is active
});

/**
 * Context menu item type (for recursive schema)
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  action: string;
  icon?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  shortcut?: string;
}

/**
 * Context menu item schema
 * Note: Using type assertion to handle recursive Zod schema with optional properties
 */
export const ContextMenuItemSchema: z.ZodType<ContextMenuItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    action: z.string(),
    icon: z.string().optional(),
    disabled: z.boolean().optional(),
    separator: z.boolean().optional(),
    submenu: z.array(ContextMenuItemSchema).optional(),
    shortcut: z.string().optional(),
  })
) as z.ZodType<ContextMenuItem>;

/**
 * Context menu state schema
 */
export const ContextMenuStateSchema = z.object({
  visible: z.boolean(),
  x: z.number(),
  y: z.number(),
  items: z.array(ContextMenuItemSchema),
  targetId: z.string().optional(),
});

/**
 * Tooltip state schema
 */
export const TooltipStateSchema = z.object({
  visible: z.boolean(),
  content: z.string(),
  x: z.number(),
  y: z.number(),
  placement: z.enum(['top', 'bottom', 'left', 'right']).optional(),
});

/**
 * Drag and drop state schema
 */
export const DragDropStateSchema = z.object({
  isDragging: z.boolean(),
  draggedItem: z.any().optional(),
  dragOverTarget: z.string().optional(),
  dropEffect: z.enum(['copy', 'move', 'link', 'none']).optional(),
});

/**
 * UI state schema (global UI state)
 */
export const UIStateSchema = z.object({
  layout: LayoutConfigSchema,
  preferences: UIPreferencesSchema,
  notifications: z.array(NotificationSchema),
  modals: z.array(ModalStateSchema),
  loading: LoadingStateSchema,
  contextMenu: ContextMenuStateSchema.optional(),
  tooltip: TooltipStateSchema.optional(),
  dragDrop: DragDropStateSchema.optional(),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type PanelSizes = z.infer<typeof PanelSizesSchema>;
export type PanelState = z.infer<typeof PanelStateSchema>;
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type ModalState = z.infer<typeof ModalStateSchema>;
export type LoadingState = z.infer<typeof LoadingStateSchema>;
export type ScrollState = z.infer<typeof ScrollStateSchema>;
export type SelectionState = z.infer<typeof SelectionStateSchema>;
export type SearchState = z.infer<typeof SearchStateSchema>;
export type UIPreferences = z.infer<typeof UIPreferencesSchema>;
export type KeyboardShortcut = z.infer<typeof KeyboardShortcutSchema>;
export type ContextMenuState = z.infer<typeof ContextMenuStateSchema>;
export type TooltipState = z.infer<typeof TooltipStateSchema>;
export type DragDropState = z.infer<typeof DragDropStateSchema>;
export type UIState = z.infer<typeof UIStateSchema>;

/**
 * Helper functions
 */
export function createNotification(
  type: NotificationType,
  title: string,
  message?: string,
  duration?: number
): Notification {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    timestamp: Date.now(),
    duration,
    dismissible: true,
  };
}

export function createModal(
  id: string,
  type: string,
  title?: string,
  data?: unknown,
  size?: 'small' | 'medium' | 'large' | 'fullscreen'
): ModalState {
  return {
    id,
    type,
    visible: true,
    title,
    data,
    closable: true,
    size: size ?? 'medium',
  };
}

export function createDefaultLayout(): LayoutConfig {
  return {
    viewMode: ViewMode.SPLIT,
    panels: [
      {
        type: PanelType.FILE_TREE,
        visible: true,
        position: 'left',
        order: 0,
      },
      {
        type: PanelType.CHAT,
        visible: true,
        position: 'center',
        order: 1,
      },
      {
        type: PanelType.TERMINAL,
        visible: true,
        position: 'bottom',
        order: 2,
      },
    ],
    sizes: {
      sidebar: 20,
      main: 80,
      terminal: 30,
    },
    showSidebar: true,
    showTerminal: true,
  };
}

export function createDefaultUIPreferences(): UIPreferences {
  return {
    theme: ThemeMode.AUTO,
    fontSize: 14,
    lineHeight: 1.5,
    compactMode: false,
    showLineNumbers: true,
    wordWrap: true,
    animations: true,
    soundEffects: false,
    autoSave: true,
    autoScroll: true,
  };
}

export function createDefaultUIState(): UIState {
  return {
    layout: createDefaultLayout(),
    preferences: createDefaultUIPreferences(),
    notifications: [],
    modals: [],
    loading: {
      isLoading: false,
    },
  };
}

export function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case NotificationType.INFO:
      return 'blue';
    case NotificationType.SUCCESS:
      return 'green';
    case NotificationType.WARNING:
      return 'yellow';
    case NotificationType.ERROR:
      return 'red';
    default:
      return 'gray';
  }
}

export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case NotificationType.INFO:
      return 'info-circle';
    case NotificationType.SUCCESS:
      return 'check-circle';
    case NotificationType.WARNING:
      return 'exclamation-triangle';
    case NotificationType.ERROR:
      return 'times-circle';
    default:
      return 'info-circle';
  }
}

export function shouldAutoCloseNotification(notification: Notification): boolean {
  if (!notification.dismissible) return false;
  if (notification.type === NotificationType.ERROR) return false;
  return notification.duration !== undefined && notification.duration > 0;
}

export function isScrolledToBottom(scroll: ScrollState): boolean {
  return scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 10;
}

export function calculatePanelPercentage(pixels: number, totalPixels: number): number {
  return Math.round((pixels / totalPixels) * 100);
}

export function calculatePanelPixels(percentage: number, totalPixels: number): number {
  return Math.round((percentage / 100) * totalPixels);
}
