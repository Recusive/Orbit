/**
 * Inspector components module
 *
 * Components for the right sidebar inspector panel:
 * - InspectorPanel: Unified tabbed inspector (combines Props + Styles)
 * - PropertiesPanel: CSS property editor (font-size, colors, spacing)
 * - PropsEditor: React component props editor (variant, size, disabled)
 */

export { InspectorPanel } from './InspectorPanel';
export type { InspectorPanelProps } from './InspectorPanel';
export { PropertiesPanel } from './PropertiesPanel';
export { PropsEditor } from './PropsEditor';
export type { PropsEditorProps, PropDefinition } from './PropsEditor';
