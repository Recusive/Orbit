/**
 * Properties Panel Components
 *
 * Properties panel for Orbit Canvas.
 */

// Main panels
export { PropertiesPanel } from './PropertiesPanel';
export type { PropertiesPanelProps } from './PropertiesPanel';

export { ElementPropertiesPanel } from './ElementPropertiesPanel';
export { NodePropertiesPanel } from './NodePropertiesPanel';
export { PagePropertiesPanel } from './PagePropertiesPanel';

// Header
export { PropertyHeader } from './PropertyHeader';
export type { PropertyHeaderProps } from './PropertyHeader';

// Shared components
export { CollapsibleSection } from './shared/CollapsibleSection';
export type { CollapsibleSectionProps } from './shared/CollapsibleSection';

export { PropertyRow, PropertyGroup, InputWrapper } from './shared/PropertyRow';
export type { PropertyRowProps, PropertyGroupProps, InputWrapperProps } from './shared/PropertyRow';

export { IconButton, IconButtonGroup } from './shared/IconButton';
export type { IconButtonProps, IconButtonGroupProps } from './shared/IconButton';

export { AddRemoveControls, VisibilityToggle } from './shared/AddRemoveControls';
export type { AddRemoveControlsProps, VisibilityToggleProps } from './shared/AddRemoveControls';

// Sections
export { PositionSection } from './sections/PositionSection';
export type { PositionSectionProps } from './sections/PositionSection';

export { LayoutSection } from './sections/LayoutSection';
export type { LayoutSectionProps } from './sections/LayoutSection';

export { AppearanceSection } from './sections/AppearanceSection';
export type { AppearanceSectionProps, BlendMode } from './sections/AppearanceSection';

export { FillSection } from './sections/FillSection';
export type { FillSectionProps } from './sections/FillSection';

export { StrokeSection } from './sections/StrokeSection';
export type { StrokeSectionProps } from './sections/StrokeSection';

export { EffectsSection } from './sections/EffectsSection';
export type { EffectsSectionProps } from './sections/EffectsSection';

export { TextSection } from './sections/TextSection';
export type { TextSectionProps } from './sections/TextSection';

export { ConstraintsSection } from './sections/ConstraintsSection';
export type { ConstraintsSectionProps } from './sections/ConstraintsSection';

export { ExportSection } from './sections/ExportSection';
export type { ExportSectionProps, ExportSetting, ExportFormat } from './sections/ExportSection';

// Inputs
export { NumberInput } from './inputs/NumberInput';
export type { NumberInputProps } from './inputs/NumberInput';

export { ColorInput } from './inputs/ColorInput';
export type { ColorInputProps } from './inputs/ColorInput';

export { CornerRadiusInput } from './inputs/CornerRadiusInput';
export type { CornerRadiusInputProps, CornerRadii } from './inputs/CornerRadiusInput';

export { AlignmentGrid } from './inputs/AlignmentGrid';
export type { AlignmentGridProps, HorizontalAlign, VerticalAlign } from './inputs/AlignmentGrid';

export { FlipControls } from './inputs/FlipControls';
export type { FlipControlsProps } from './inputs/FlipControls';

export { GradientEditor } from './inputs/GradientEditor';
export type { GradientEditorProps, GradientType } from './inputs/GradientEditor';

export { VariablePicker } from './inputs/VariablePicker';
export type { VariablePickerProps } from './inputs/VariablePicker';

// Hooks
export { useSectionState, useAllSectionStates } from './hooks/useSectionState';
export { useKeyboardNavigation, useInputKeyboard } from './hooks/useKeyboardNavigation';
