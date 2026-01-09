/**
 * Messages exports
 */

// Main component
export { MessageItem } from './MessageItem';

// Sub-components
export { ToolWidgetRenderer } from './ToolWidgetRenderer';
export { MessageActions } from './message-actions';

// Types
export type { ToolWidgetRendererProps } from './ToolWidgetRenderer';
export type { ChatMessage, MessageItemProps, Segment } from './types';

// Utilities
export { arePropsEqual, buildSegments, hasVisibleContent } from './message-utils';
