/**
 * Component Library Panel
 *
 * Searchable library of pre-built shadcn/ui-style components.
 * Components can be dragged onto the canvas or clicked to add.
 */

import React, { useState, useMemo } from 'react';

import {
  getComponentsByCategory,
  searchComponents,
  CATEGORY_LABELS,
} from '../lib/componentLibrary';

import type { ComponentCategory, ComponentTemplate } from '../lib/componentLibrary';

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface ComponentLibraryPanelProps {
  onSelectComponent: (component: ComponentTemplate) => void;
  onDragStart?: (component: ComponentTemplate, event: React.DragEvent) => void;
}

// =============================================================================
// ICONS
// =============================================================================

const SearchIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const ClearIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

// Category icons - 12px for category headers
const BoxIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const LayoutIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const FormIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const TableIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="3" y1="15" x2="21" y2="15"></line>
    <line x1="12" y1="3" x2="12" y2="21"></line>
  </svg>
);

const BellIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

// Card icons - 14px for component cards
const BoxIconLarge = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const LayoutIconLarge = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const FormIconLarge = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const TableIconLarge = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="3" y1="15" x2="21" y2="15"></line>
    <line x1="12" y1="3" x2="12" y2="21"></line>
  </svg>
);

const BellIconLarge = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const EmptySearchIcon = (): React.JSX.Element => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8" opacity="0.3"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65" opacity="0.5"></line>
    <line x1="8" y1="11" x2="14" y2="11" opacity="0.4"></line>
  </svg>
);

const CATEGORY_ICONS: Record<ComponentCategory, () => React.JSX.Element> = {
  ui: BoxIcon,
  layout: LayoutIcon,
  form: FormIcon,
  'data-display': TableIcon,
  feedback: BellIcon,
};

const CATEGORY_ICONS_LARGE: Record<ComponentCategory, () => React.JSX.Element> = {
  ui: BoxIconLarge,
  layout: LayoutIconLarge,
  form: FormIconLarge,
  'data-display': TableIconLarge,
  feedback: BellIconLarge,
};

const CATEGORY_COLORS: Record<ComponentCategory, string> = {
  ui: 'var(--info)',
  layout: 'var(--primary)',
  form: 'var(--brand-heather)',
  'data-display': 'var(--warning)',
  feedback: 'var(--warning)',
};

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--secondary-foreground)',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 16px 12px',
    // No border - shadow-only design
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'lowercase' as const,
    letterSpacing: '0.06em',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    marginBottom: 12,
  },
  searchContainer: {
    position: 'relative' as const,
  },
  searchIcon: {
    position: 'absolute' as const,
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--muted-foreground)',
    pointerEvents: 'none' as const,
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    width: '100%',
    height: 34,
    padding: '0 34px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontSize: 12,
    outline: 'none',
    transition: `all 200ms ${EASE_OUT}`,
  },
  searchInputFocused: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 70%, transparent)',
    boxShadow: '0 0 0 2px color-mix(in oklch, var(--primary) 30%, transparent)',
  },
  clearButton: {
    position: 'absolute' as const,
    right: 6,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
  },
  clearButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 12px',
  },
  categorySection: {
    marginBottom: 12,
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    borderRadius: 8,
    transition: `all 150ms ${EASE_OUT}`,
    marginBottom: 6,
  },
  categoryHeaderHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
  },
  categoryChevron: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--muted-foreground)',
    transition: `transform 200ms ${EASE_OUT}`,
  },
  categoryIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--secondary-foreground)',
  },
  categoryCount: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    padding: '2px 8px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    borderRadius: 9999,
  },
  componentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    padding: '0 4px',
  },
  componentCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    border: 'none',
    borderRadius: 10,
    cursor: 'grab',
    transition: `all 200ms ${EASE_OUT}`,
  },
  componentCardHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.02)',
    boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08)',
  },
  componentCardActive: {
    cursor: 'grabbing',
    transform: 'scale(0.98)',
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  },
  componentIcon: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  componentName: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--foreground)',
    textAlign: 'center' as const,
    lineHeight: 1.3,
  },
  noResults: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    textAlign: 'center' as const,
  },
  noResultsIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    marginBottom: 16,
  },
  noResultsTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    marginBottom: 4,
  },
  noResultsText: {
    fontSize: 12,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    lineHeight: 1.5,
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ComponentLibraryPanel({
  onSelectComponent,
  onDragStart,
}: ComponentLibraryPanelProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [hoveredClear, setHoveredClear] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<ComponentCategory>>(
    new Set(['ui', 'form', 'layout', 'data-display', 'feedback'])
  );
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);
  const [draggingComponent, setDraggingComponent] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<ComponentCategory | null>(null);

  const componentsByCategory = useMemo(() => getComponentsByCategory(), []);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) {
      return null; // Show categories when not searching
    }
    return searchComponents(searchQuery);
  }, [searchQuery]);

  const toggleCategory = (category: ComponentCategory): void => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDragStart = (component: ComponentTemplate, event: React.DragEvent): void => {
    setDraggingComponent(component.id);
    event.dataTransfer.setData('application/reactflow', component.id);
    event.dataTransfer.setData('application/component-library', JSON.stringify(component));
    event.dataTransfer.effectAllowed = 'move';
    onDragStart?.(component, event);
  };

  const handleDragEnd = (): void => {
    setDraggingComponent(null);
  };

  const renderComponentCard = (component: ComponentTemplate): React.JSX.Element => {
    const isHovered = hoveredComponent === component.id;
    const isDragging = draggingComponent === component.id;
    const CategoryIconLarge = CATEGORY_ICONS_LARGE[component.category];
    const categoryColor = CATEGORY_COLORS[component.category];

    return (
      <div
        key={component.id}
        style={{
          ...styles.componentCard,
          ...(isHovered && !isDragging ? styles.componentCardHover : {}),
          ...(isDragging ? styles.componentCardActive : {}),
        }}
        draggable
        onDragStart={(e) => {
          handleDragStart(component, e);
        }}
        onDragEnd={handleDragEnd}
        onClick={() => {
          onSelectComponent(component);
        }}
        onMouseEnter={() => {
          setHoveredComponent(component.id);
        }}
        onMouseLeave={() => {
          setHoveredComponent(null);
        }}
        title={component.description}
      >
        <div
          style={{
            ...styles.componentIcon,
            backgroundColor: `color-mix(in oklch, ${categoryColor} 15%, transparent)`,
            color: categoryColor,
          }}
        >
          <CategoryIconLarge />
        </div>
        <span style={styles.componentName}>{component.name}</span>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Components</div>
        <div style={styles.searchContainer}>
          <div style={styles.searchIcon}>
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            onFocus={() => {
              setIsSearchFocused(true);
            }}
            onBlur={() => {
              setIsSearchFocused(false);
            }}
            style={{
              ...styles.searchInput,
              ...(isSearchFocused ? styles.searchInputFocused : {}),
            }}
          />
          {searchQuery ? (
            <button
              style={{
                ...styles.clearButton,
                ...(hoveredClear ? styles.clearButtonHover : {}),
              }}
              onClick={() => {
                setSearchQuery('');
              }}
              onMouseEnter={() => {
                setHoveredClear(true);
              }}
              onMouseLeave={() => {
                setHoveredClear(false);
              }}
              title="Clear search"
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      </div>

      <div style={styles.scrollContainer}>
        {filteredComponents ? (
          // Search results
          filteredComponents.length > 0 ? (
            <div style={styles.componentGrid}>{filteredComponents.map(renderComponentCard)}</div>
          ) : (
            <div style={styles.noResults}>
              <div style={styles.noResultsIcon}>
                <EmptySearchIcon />
              </div>
              <div style={styles.noResultsTitle}>No results found</div>
              <div style={styles.noResultsText}>
                Try a different search term
                <br />
                or browse categories below
              </div>
            </div>
          )
        ) : (
          // Categories view
          (Object.keys(componentsByCategory) as ComponentCategory[]).map((category) => {
            const components = componentsByCategory[category];
            if (components.length === 0) return null;

            const isExpanded = expandedCategories.has(category);
            const isHovered = hoveredCategory === category;
            const CategoryIcon = CATEGORY_ICONS[category];
            const categoryColor = CATEGORY_COLORS[category];

            return (
              <div key={category} style={styles.categorySection}>
                <div
                  style={{
                    ...styles.categoryHeader,
                    ...(isHovered ? styles.categoryHeaderHover : {}),
                  }}
                  onClick={() => {
                    toggleCategory(category);
                  }}
                  onMouseEnter={() => {
                    setHoveredCategory(category);
                  }}
                  onMouseLeave={() => {
                    setHoveredCategory(null);
                  }}
                >
                  <span
                    style={{
                      ...styles.categoryChevron,
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  >
                    <ChevronDownIcon />
                  </span>
                  <div
                    style={{
                      ...styles.categoryIcon,
                      backgroundColor: `color-mix(in oklch, ${categoryColor} 15%, transparent)`,
                      color: categoryColor,
                    }}
                  >
                    <CategoryIcon />
                  </div>
                  <span style={styles.categoryLabel}>{CATEGORY_LABELS[category]}</span>
                  <span style={styles.categoryCount}>{components.length}</span>
                </div>

                {isExpanded ? (
                  <div style={styles.componentGrid}>{components.map(renderComponentCard)}</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
