/**
 * Component Registry - Metadata for preview components
 *
 * Components are TSX files in ./components/ that can be:
 * 1. Rendered directly in the preview area
 * 2. Edited by AI to modify their appearance
 * 3. Customized via props from the properties panel
 */

export interface RegistryItem {
  readonly name: string;
  readonly label: string;
  readonly category: 'blocks' | 'components';
  readonly description?: string;
}

// Registry of all preview components
export const COMPONENT_REGISTRY: Record<string, RegistryItem> = {
  Button: {
    name: 'Button',
    label: 'Button',
    category: 'components',
    description: 'Displays a button or a component that looks like a button.',
  },
};

// List of available component names
export const AVAILABLE_COMPONENTS = Object.keys(COMPONENT_REGISTRY);

// Get a component by name (case-insensitive)
export function getComponent(name: string): RegistryItem | undefined {
  return (
    COMPONENT_REGISTRY[name] ??
    Object.values(COMPONENT_REGISTRY).find((item) => item.name.toLowerCase() === name.toLowerCase())
  );
}

// Check if a component exists in the registry
export function hasComponent(name: string): boolean {
  return getComponent(name) !== undefined;
}

// Get all components in a category
export function getComponentsByCategory(category: 'blocks' | 'components'): RegistryItem[] {
  return Object.values(COMPONENT_REGISTRY).filter((item) => item.category === category);
}
