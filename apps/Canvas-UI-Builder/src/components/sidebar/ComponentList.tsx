/**
 * ComponentList - Sidebar component browser with search and categories
 *
 * Displays available UI and custom components from the registry,
 * with search filtering and category grouping.
 */
import { useComponentRegistry } from '@canvas/hooks';
import { useMemo, useState } from 'react';

import type { ComponentMeta } from '@canvas/hooks';
import type { FC } from 'react';

import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================
// Types
// ============================================

interface ComponentListProps {
  readonly onSelectComponent: (name: string, type: 'ui' | 'custom') => void;
  readonly selectedComponent: string | null;
}

interface ComponentItemProps {
  readonly component: ComponentMeta;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert kebab-case to Title Case for display
 * e.g., "dropdown-menu" -> "Dropdown Menu"
 */
function formatDisplayName(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================
// Sub-components
// ============================================

const ComponentItem: FC<ComponentItemProps> = ({ component, isSelected, onClick }) => {
  const displayName = formatDisplayName(component.name);

  return (
    <button
      onClick={onClick}
      className={`
        w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary
        ${isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-foreground'}
      `}
    >
      {displayName}
    </button>
  );
};

// ============================================
// Main Component
// ============================================

export const ComponentList: FC<ComponentListProps> = ({ onSelectComponent, selectedComponent }) => {
  const { uiComponents, customComponents, loading, error } = useComponentRegistry();
  const [search, setSearch] = useState('');

  // Filter components based on search query
  const filteredUI = useMemo(
    () => uiComponents.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [uiComponents, search]
  );

  const filteredCustom = useMemo(
    () => customComponents.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [customComponents, search]
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div
          className="animate-spin motion-reduce:animate-none w-6 h-6 border-2 border-primary border-t-transparent rounded-full"
          aria-hidden="true"
        />
        <span className="sr-only">Loading components…</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return <div className="p-4 text-sm text-destructive">Failed to load components: {error}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b border-border">
        <Input
          placeholder="Search components…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          autoComplete="off"
          aria-label="Search components"
          className="h-8"
        />
      </div>

      {/* Component List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* UI Components Category */}
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              UI Components ({filteredUI.length})
            </h3>
            <div className="space-y-0.5">
              {filteredUI.map((component) => (
                <ComponentItem
                  key={component.name}
                  component={component}
                  isSelected={selectedComponent === component.name}
                  onClick={() => {
                    onSelectComponent(component.name, 'ui');
                  }}
                />
              ))}
            </div>
          </div>

          {/* Custom Components Category (only shown when there are custom components) */}
          {filteredCustom.length > 0 && (
            <div>
              <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Custom ({filteredCustom.length})
              </h3>
              <div className="space-y-0.5">
                {filteredCustom.map((component) => (
                  <ComponentItem
                    key={component.name}
                    component={component}
                    isSelected={selectedComponent === component.name}
                    onClick={() => {
                      onSelectComponent(component.name, 'custom');
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no results */}
          {filteredUI.length === 0 && filteredCustom.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">No components found</p>
              {search ? <p className="text-xs mt-1">Try a different search term</p> : null}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
