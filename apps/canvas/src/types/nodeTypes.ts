/**
 * Node type definitions for Orbit Canvas
 * Based on specifications from canvasSystemPrompt.ts
 */

/**
 * Base node data interface - all nodes extend this
 */
export interface BaseNodeData {
  label?: string;
  [key: string]: unknown;
}

/**
 * Button component node
 */
export interface ButtonNodeData extends BaseNodeData {
  label: string;
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Input field component node
 */
export interface InputNodeData extends BaseNodeData {
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  label?: string;
  required?: boolean;
}

/**
 * Card component node
 */
export interface CardNodeData extends BaseNodeData {
  title?: string;
  description?: string;
  hasImage?: boolean;
  hasFooter?: boolean;
}

/**
 * Container layout component node
 */
export interface ContainerNodeData extends BaseNodeData {
  layout?: 'flex-row' | 'flex-col' | 'grid';
  gap?: 'sm' | 'md' | 'lg';
  padding?: 'sm' | 'md' | 'lg';
}

/**
 * Form component node
 */
export interface FormNodeData extends BaseNodeData {
  title?: string;
  fields?: { name: string; type: string; label: string }[];
  submitLabel?: string;
}

/**
 * Text typography component node
 */
export interface TextNodeData extends BaseNodeData {
  content: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'small';
  align?: 'left' | 'center' | 'right';
}

/**
 * Image component node
 */
export interface ImageNodeData extends BaseNodeData {
  src?: string;
  alt?: string;
  width?: 'sm' | 'md' | 'lg' | 'full';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

/**
 * Link/hyperlink component node
 */
export interface LinkNodeData extends BaseNodeData {
  text: string;
  href?: string;
  target?: '_self' | '_blank' | '_parent' | '_top';
  underline?: boolean;
}

/**
 * Divider separator component node
 */
export interface DividerNodeData extends BaseNodeData {
  orientation?: 'horizontal' | 'vertical';
  thickness?: 'thin' | 'medium' | 'thick';
  style?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Badge/tag component node
 */
export interface BadgeNodeData extends BaseNodeData {
  text: string;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Checkbox input component node
 */
export interface CheckboxNodeData extends BaseNodeData {
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Radio button component node
 */
export interface RadioNodeData extends BaseNodeData {
  label: string;
  value?: string;
  checked?: boolean;
  name?: string;
}

/**
 * Select dropdown component node
 */
export interface SelectNodeData extends BaseNodeData {
  label?: string;
  options?: { label: string; value: string }[];
  value?: string;
  placeholder?: string;
}

/**
 * Textarea multi-line input component node
 */
export interface TextareaNodeData extends BaseNodeData {
  label?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}

/**
 * Toggle switch component node
 */
export interface ToggleNodeData extends BaseNodeData {
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Union type of all node data types
 */
export type NodeData =
  | ButtonNodeData
  | InputNodeData
  | CardNodeData
  | ContainerNodeData
  | FormNodeData
  | TextNodeData
  | ImageNodeData
  | LinkNodeData
  | DividerNodeData
  | BadgeNodeData
  | CheckboxNodeData
  | RadioNodeData
  | SelectNodeData
  | TextareaNodeData
  | ToggleNodeData;

/**
 * Node type identifier enum
 */
export enum NodeType {
  BUTTON = 'button',
  INPUT = 'input',
  CARD = 'card',
  CONTAINER = 'container',
  FORM = 'form',
  TEXT = 'text',
  IMAGE = 'image',
  LINK = 'link',
  DIVIDER = 'divider',
  BADGE = 'badge',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  SELECT = 'select',
  TEXTAREA = 'textarea',
  TOGGLE = 'toggle',
}

/**
 * Color scheme for node type visualization
 */
export const NODE_COLORS: Record<NodeType, string> = {
  [NodeType.BUTTON]: '#3b82f6', // blue
  [NodeType.INPUT]: '#8b5cf6', // purple
  [NodeType.CARD]: '#06b6d4', // cyan
  [NodeType.CONTAINER]: '#10b981', // green
  [NodeType.FORM]: '#14b8a6', // teal
  [NodeType.TEXT]: '#6366f1', // indigo
  [NodeType.IMAGE]: '#ec4899', // pink
  [NodeType.LINK]: '#f59e0b', // amber
  [NodeType.DIVIDER]: '#6b7280', // gray
  [NodeType.BADGE]: '#8b5cf6', // purple
  [NodeType.CHECKBOX]: '#22c55e', // lime
  [NodeType.RADIO]: '#84cc16', // lime
  [NodeType.SELECT]: '#a855f7', // purple
  [NodeType.TEXTAREA]: '#7c3aed', // violet
  [NodeType.TOGGLE]: '#06b6d4', // cyan
};
