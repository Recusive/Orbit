/**
 * PropsEditor - React Component Props Editor
 *
 * Provides UI controls for editing component props like variant, size, disabled, etc.
 * This is separate from CSS properties - it edits the actual React props passed to components.
 *
 * Supports:
 * - Select dropdowns for variant/size props
 * - Toggle switches for boolean props
 * - Text inputs for string props
 * - Number inputs for numeric props
 */
import { Sliders } from 'lucide-react';
import { useCallback, useRef } from 'react';

import type { FC, ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

// ============================================
// Types
// ============================================

/** Definition for a single component prop */
export interface PropDefinition {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'select';
  readonly options?: readonly string[];
  readonly default?: unknown;
  readonly description?: string;
}

/** Props definitions for common shadcn/ui components */
const COMPONENT_PROPS: Record<string, readonly PropDefinition[]> = {
  button: [
    {
      name: 'variant',
      type: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      default: 'default',
      description: 'Visual style variant',
    },
    {
      name: 'size',
      type: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      default: 'default',
      description: 'Button size',
    },
    { name: 'disabled', type: 'boolean', default: false, description: 'Disable interactions' },
    { name: 'children', type: 'string', default: 'Button', description: 'Button text content' },
  ],
  badge: [
    {
      name: 'variant',
      type: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
      default: 'default',
    },
    { name: 'children', type: 'string', default: 'Badge' },
  ],
  input: [
    {
      name: 'type',
      type: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
      default: 'text',
    },
    { name: 'placeholder', type: 'string', default: '' },
    { name: 'disabled', type: 'boolean', default: false },
  ],
  textarea: [
    { name: 'placeholder', type: 'string', default: '' },
    { name: 'disabled', type: 'boolean', default: false },
    { name: 'rows', type: 'number', default: 3 },
  ],
  card: [{ name: 'children', type: 'string', default: 'Card Content' }],
  switch: [
    { name: 'checked', type: 'boolean', default: false },
    { name: 'disabled', type: 'boolean', default: false },
  ],
  checkbox: [
    { name: 'checked', type: 'boolean', default: false },
    { name: 'disabled', type: 'boolean', default: false },
  ],
  avatar: [
    { name: 'src', type: 'string', default: 'https://github.com/shadcn.png' },
    { name: 'alt', type: 'string', default: 'Avatar' },
  ],
  progress: [{ name: 'value', type: 'number', default: 50 }],
  slider: [
    { name: 'defaultValue', type: 'number', default: 50 },
    { name: 'max', type: 'number', default: 100 },
    { name: 'step', type: 'number', default: 1 },
  ],
  separator: [
    {
      name: 'orientation',
      type: 'select',
      options: ['horizontal', 'vertical'],
      default: 'horizontal',
    },
  ],
  skeleton: [{ name: 'className', type: 'string', default: 'h-4 w-[250px]' }],
  label: [{ name: 'children', type: 'string', default: 'Label' }],
  'alert-dialog': [{ name: 'open', type: 'boolean', default: false }],
  dialog: [{ name: 'open', type: 'boolean', default: false }],
  popover: [{ name: 'open', type: 'boolean', default: false }],
  tooltip: [{ name: 'open', type: 'boolean', default: false }],
} as const;

// ============================================
// Prop Input Component
// ============================================

interface PropInputProps {
  readonly definition: PropDefinition;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

const PropInput: FC<PropInputProps> = ({ definition, value, onChange }) => {
  const { name, type, options, description } = definition;

  const renderInput = (): ReactNode => {
    switch (type) {
      case 'string':
        return (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            autoComplete="off"
            aria-label={name}
            className="h-8 text-sm font-mono"
            placeholder={`Enter ${name}…`}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => {
              onChange(Number(e.target.value));
            }}
            autoComplete="off"
            aria-label={name}
            className="h-8 text-sm font-mono w-24"
          />
        );

      case 'boolean': {
        const boolValue = value === true;
        return (
          <div className="flex items-center gap-2">
            <Switch checked={boolValue} onCheckedChange={onChange} />
            <span className="text-xs text-muted-foreground">{boolValue ? 'true' : 'false'}</span>
          </div>
        );
      }

      case 'select':
        return options !== undefined && options.length > 0 ? (
          <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={`Select ${name}...`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground capitalize">{name}</label>
        {description ? (
          <span className="text-[10px] text-muted-foreground/60">{description}</span>
        ) : null}
      </div>
      {renderInput()}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export interface PropsEditorProps {
  /** Component name to show props for (e.g., 'button', 'input') */
  readonly componentName: string | null;
  /** Current prop values */
  readonly props: Record<string, unknown>;
  /** Called when any prop changes */
  readonly onChange: (props: Record<string, unknown>) => void;
}

/**
 * Editor for React component props (variant, size, disabled, etc.)
 */
export const PropsEditor: FC<PropsEditorProps> = ({ componentName, props, onChange }) => {
  const propDefs = componentName ? (COMPONENT_PROPS[componentName] ?? []) : [];

  // Use ref to hold latest props to avoid callback recreation (rule: advanced-use-latest)
  const propsRef = useRef(props);
  propsRef.current = props;

  const updateProp = useCallback(
    (name: string, value: unknown): void => {
      onChange({ ...propsRef.current, [name]: value });
    },
    [onChange] // Only depends on onChange, not props
  );

  // No component selected
  if (!componentName) {
    return (
      <div className="p-3">
        <div className="text-sm text-muted-foreground text-center py-8">
          <Sliders className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Select a component to edit its props</p>
        </div>
      </div>
    );
  }

  // No props defined for this component
  if (propDefs.length === 0) {
    return (
      <div className="p-3">
        <div className="text-sm text-muted-foreground text-center py-8">
          <Sliders className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No editable props for {componentName}</p>
          <p className="text-[10px] mt-1 opacity-60">
            Props definitions can be added in PropsEditor.tsx
          </p>
        </div>
      </div>
    );
  }

  // Format component name for display
  const displayName = componentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="p-3 space-y-4">
      {/* Header - matches PropertiesPanel style */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Component Props</p>
        </div>
      </div>

      {/* Props List */}
      {propDefs.map((propDef) => (
        <PropInput
          key={propDef.name}
          definition={propDef}
          value={props[propDef.name] ?? propDef.default}
          onChange={(value) => {
            updateProp(propDef.name, value);
          }}
        />
      ))}
    </div>
  );
};
