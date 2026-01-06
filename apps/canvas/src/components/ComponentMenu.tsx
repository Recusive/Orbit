import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  spacing,
  radii,
  fontSize,
  fontWeight,
  letterSpacing,
  shadows,
  motion,
  zIndex,
} from '../lib/designTokens';

// Simple SVG icons
const SearchIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const SquareIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const TypeIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 7 4 4 20 4 20 7"></polyline>
    <line x1="9" y1="20" x2="15" y2="20"></line>
    <line x1="12" y1="4" x2="12" y2="20"></line>
  </svg>
);

const ImageIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const LinkIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
);

const MinusIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const TagIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
    <line x1="7" y1="7" x2="7.01" y2="7"></line>
  </svg>
);

const BoxIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  </svg>
);

const CardIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
    <line x1="1" y1="10" x2="23" y2="10"></line>
  </svg>
);

const ListIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const CheckSquareIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 11 12 14 22 4"></polyline>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
  </svg>
);

const CircleIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ToggleIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect>
    <circle cx="8" cy="12" r="3"></circle>
  </svg>
);

const AlignLeftIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="17" y1="10" x2="3" y2="10"></line>
    <line x1="21" y1="6" x2="3" y2="6"></line>
    <line x1="21" y1="14" x2="3" y2="14"></line>
    <line x1="17" y1="18" x2="3" y2="18"></line>
  </svg>
);

interface ComponentMenuProps {
  position: { x: number; y: number };
  onSelect: (componentType: string) => void;
  onClose: () => void;
  onDragStart?: (type: string, x: number, y: number) => void;
}

interface ComponentItem {
  type: string;
  name: string;
  icon: React.ReactElement;
  category: 'Forms' | 'Layout' | 'Display' | 'Content';
  description: string;
  color: string; // Background color for icon
  textColor: string; // Icon color
}

const componentList: ComponentItem[] = [
  // Forms
  {
    type: 'button',
    name: 'Button',
    icon: <SquareIcon />,
    category: 'Forms',
    description: 'Interactive button',
    color: '#3b82f620',
    textColor: '#3b82f6',
  },
  {
    type: 'input',
    name: 'Input',
    icon: <TypeIcon />,
    category: 'Forms',
    description: 'Text input field',
    color: '#8b5cf620',
    textColor: '#8b5cf6',
  },
  {
    type: 'textarea',
    name: 'Textarea',
    icon: <AlignLeftIcon />,
    category: 'Forms',
    description: 'Multi-line text input',
    color: '#7c3aed20',
    textColor: '#7c3aed',
  },
  {
    type: 'checkbox',
    name: 'Checkbox',
    icon: <CheckSquareIcon />,
    category: 'Forms',
    description: 'Checkbox input',
    color: '#22c55e20',
    textColor: '#22c55e',
  },
  {
    type: 'radio',
    name: 'Radio',
    icon: <CircleIcon />,
    category: 'Forms',
    description: 'Radio button group',
    color: '#84cc1620',
    textColor: '#84cc16',
  },
  {
    type: 'select',
    name: 'Select',
    icon: <ChevronDownIcon />,
    category: 'Forms',
    description: 'Dropdown select',
    color: '#a855f720',
    textColor: '#a855f7',
  },
  {
    type: 'toggle',
    name: 'Toggle',
    icon: <ToggleIcon />,
    category: 'Forms',
    description: 'Toggle switch',
    color: '#06b6d420',
    textColor: '#06b6d4',
  },
  {
    type: 'form',
    name: 'Form',
    icon: <ListIcon />,
    category: 'Forms',
    description: 'Form container',
    color: '#14b8a620',
    textColor: '#14b8a6',
  },
  // Layout
  {
    type: 'container',
    name: 'Container',
    icon: <BoxIcon />,
    category: 'Layout',
    description: 'Flex container',
    color: '#10b98120',
    textColor: '#10b981',
  },
  {
    type: 'card',
    name: 'Card',
    icon: <CardIcon />,
    category: 'Display',
    description: 'Card component',
    color: '#06b6d420',
    textColor: '#06b6d4',
  },
  // Content
  {
    type: 'text',
    name: 'Text',
    icon: <TypeIcon />,
    category: 'Content',
    description: 'Text heading or paragraph',
    color: '#6366f120',
    textColor: '#6366f1',
  },
  {
    type: 'image',
    name: 'Image',
    icon: <ImageIcon />,
    category: 'Content',
    description: 'Image display',
    color: '#ec489920',
    textColor: '#ec4899',
  },
  {
    type: 'link',
    name: 'Link',
    icon: <LinkIcon />,
    category: 'Content',
    description: 'Hyperlink',
    color: '#f59e0b20',
    textColor: '#f59e0b',
  },
  {
    type: 'divider',
    name: 'Divider',
    icon: <MinusIcon />,
    category: 'Layout',
    description: 'Horizontal line',
    color: '#6b728020',
    textColor: '#6b7280',
  },
  {
    type: 'badge',
    name: 'Badge',
    icon: <TagIcon />,
    category: 'Display',
    description: 'Status badge',
    color: '#8b5cf620',
    textColor: '#8b5cf6',
  },
];

const styles = {
  menu: {
    position: 'absolute' as const,
    zIndex: zIndex.modal,
    width: 320,
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.xl,
    boxShadow: shadows.xl,
    overflow: 'hidden',
  },
  searchContainer: {
    padding: spacing.xl,
    borderBottom: '1px solid var(--border)',
  },
  searchWrapper: {
    position: 'relative' as const,
  },
  searchIcon: {
    position: 'absolute' as const,
    left: spacing.xl,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--muted-foreground)',
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    width: '100%',
    padding: `${String(spacing.lg)}px ${String(spacing.xl)}px ${String(spacing.lg)}px 40px`,
    border: '1px solid var(--border)',
    borderRadius: radii.lg,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.base,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: `all ${motion.normal} ${motion.ease}`,
  },
  scrollContainer: {
    maxHeight: 384,
    overflowY: 'auto' as const,
  },
  categoryHeader: {
    padding: `${String(spacing.md)}px ${String(spacing.xl)}px`,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--card)',
  },
  categoryContent: {
    padding: spacing.sm,
  },
  componentButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xl,
    width: '100%',
    padding: spacing.lg,
    border: 'none',
    borderRadius: radii.lg,
    backgroundColor: 'transparent',
    cursor: 'grab',
    transition: `all ${motion.normal} ${motion.ease}`,
    textAlign: 'left' as const,
  },
  componentButtonHover: {
    backgroundColor: 'var(--accent)',
  },
  componentIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: radii.lg,
  },
  componentInfo: {
    flex: 1,
    minWidth: 0,
  },
  componentName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
  },
  componentDescription: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    marginTop: 2,
  },
  noResults: {
    padding: `${String(spacing['4xl'])}px ${String(spacing.xl)}px`,
    textAlign: 'center' as const,
    color: 'var(--muted-foreground)',
  },
  noResultsIcon: {
    marginBottom: spacing.lg,
    opacity: 0.5,
    display: 'flex',
    justifyContent: 'center',
  },
  recentSection: {
    borderBottom: '1px solid var(--border)',
  },
};

export function ComponentMenu({
  position,
  onSelect,
  onClose,
  onDragStart,
}: ComponentMenuProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, type: string): void => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/reactflow', type);

      // Update recent components
      try {
        const recent = localStorage.getItem('canvas-recent-components');
        const recentArray: string[] = recent ? (JSON.parse(recent) as string[]) : [];
        const filtered = recentArray.filter((t) => t !== type);
        filtered.unshift(type);
        localStorage.setItem('canvas-recent-components', JSON.stringify(filtered.slice(0, 5)));
      } catch {
        // Ignore localStorage errors
      }

      if (onDragStart) {
        onDragStart(type, e.clientX, e.clientY);
      }

      onClose();
    },
    [onDragStart, onClose]
  );

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Note: Escape key is handled globally by useCanvasShortcuts

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filteredComponents = componentList.filter(
    (comp) =>
      comp.name.toLowerCase().includes(search.toLowerCase()) ||
      comp.description.toLowerCase().includes(search.toLowerCase()) ||
      comp.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = useCallback(
    (type: string): void => {
      // Update recent components
      try {
        const recent = localStorage.getItem('canvas-recent-components');
        const recentArray: string[] = recent ? (JSON.parse(recent) as string[]) : [];
        const filtered = recentArray.filter((t) => t !== type);
        filtered.unshift(type);
        localStorage.setItem('canvas-recent-components', JSON.stringify(filtered.slice(0, 5)));
      } catch {
        // Ignore localStorage errors
      }

      onSelect(type);
      onClose();
    },
    [onSelect, onClose]
  );

  // Get recent components from localStorage
  const getRecentComponents = (): string[] => {
    try {
      const recent = localStorage.getItem('canvas-recent-components');
      return recent ? (JSON.parse(recent) as string[]) : [];
    } catch {
      return [];
    }
  };

  const recentTypes = getRecentComponents().slice(0, 3);
  const recentComponents = recentTypes
    .map((type) => componentList.find((c) => c.type === type))
    .filter((comp): comp is ComponentItem => comp !== undefined);

  // Group components by category
  const groupedComponents = filteredComponents.reduce<Record<string, ComponentItem[]>>(
    (acc, comp) => {
      acc[comp.category] ??= [];
      const group = acc[comp.category];
      if (group) {
        group.push(comp);
      }
      return acc;
    },
    {}
  );

  const categories: ('Forms' | 'Layout' | 'Display' | 'Content')[] = [
    'Forms',
    'Layout',
    'Display',
    'Content',
  ];

  // Calculate adjusted position to stay in viewport
  const adjustedPosition = { ...position };
  if (typeof window !== 'undefined') {
    const menuWidth = 320;
    const menuMaxHeight = 500;
    if (position.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 16;
    }
    if (position.y + menuMaxHeight > window.innerHeight) {
      adjustedPosition.y = Math.max(16, window.innerHeight - menuMaxHeight - 16);
    }
  }

  return (
    <div
      ref={menuRef}
      style={{
        ...styles.menu,
        top: adjustedPosition.y,
        left: adjustedPosition.x,
      }}
    >
      {/* Search Input */}
      <div style={styles.searchContainer}>
        <div style={styles.searchWrapper}>
          <div style={styles.searchIcon}>
            <SearchIcon />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search components..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Recent Components */}
      {search === '' && recentComponents.length > 0 && (
        <div style={styles.recentSection}>
          <div style={styles.categoryHeader}>Recently Used</div>
          <div style={styles.categoryContent}>
            {recentComponents.map((comp) => (
              <button
                key={comp.type}
                onClick={() => {
                  handleSelect(comp.type);
                }}
                draggable
                onDragStart={(e) => {
                  handleDragStart(e, comp.type);
                }}
                onMouseEnter={() => {
                  setHoveredItem(comp.type);
                }}
                onMouseLeave={() => {
                  setHoveredItem(null);
                }}
                style={{
                  ...styles.componentButton,
                  ...(hoveredItem === comp.type ? styles.componentButtonHover : {}),
                }}
              >
                <div
                  style={{
                    ...styles.componentIcon,
                    backgroundColor: comp.color,
                    color: comp.textColor,
                  }}
                >
                  {comp.icon}
                </div>
                <div style={styles.componentInfo}>
                  <div style={styles.componentName}>{comp.name}</div>
                  <div style={styles.componentDescription}>{comp.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grouped Components */}
      <div style={styles.scrollContainer}>
        {search !== '' ? (
          // Show flat list for search results
          <div style={styles.categoryContent}>
            {filteredComponents.map((comp) => (
              <button
                key={comp.type}
                onClick={() => {
                  handleSelect(comp.type);
                }}
                draggable
                onDragStart={(e) => {
                  handleDragStart(e, comp.type);
                }}
                onMouseEnter={() => {
                  setHoveredItem(`search-${comp.type}`);
                }}
                onMouseLeave={() => {
                  setHoveredItem(null);
                }}
                style={{
                  ...styles.componentButton,
                  ...(hoveredItem === `search-${comp.type}` ? styles.componentButtonHover : {}),
                }}
              >
                <div
                  style={{
                    ...styles.componentIcon,
                    backgroundColor: comp.color,
                    color: comp.textColor,
                  }}
                >
                  {comp.icon}
                </div>
                <div style={styles.componentInfo}>
                  <div style={styles.componentName}>{comp.name}</div>
                  <div style={styles.componentDescription}>{comp.description}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Show grouped by category
          categories.map((category) => {
            const items = groupedComponents[category];
            if (!items || items.length === 0) return null;

            return (
              <div key={category}>
                <div style={styles.categoryHeader}>{category}</div>
                <div style={styles.categoryContent}>
                  {items.map((comp) => (
                    <button
                      key={comp.type}
                      onClick={() => {
                        handleSelect(comp.type);
                      }}
                      draggable
                      onDragStart={(e) => {
                        handleDragStart(e, comp.type);
                      }}
                      onMouseEnter={() => {
                        setHoveredItem(`${category}-${comp.type}`);
                      }}
                      onMouseLeave={() => {
                        setHoveredItem(null);
                      }}
                      style={{
                        ...styles.componentButton,
                        ...(hoveredItem === `${category}-${comp.type}`
                          ? styles.componentButtonHover
                          : {}),
                      }}
                    >
                      <div
                        style={{
                          ...styles.componentIcon,
                          backgroundColor: comp.color,
                          color: comp.textColor,
                        }}
                      >
                        {comp.icon}
                      </div>
                      <div style={styles.componentInfo}>
                        <div style={styles.componentName}>{comp.name}</div>
                        <div style={styles.componentDescription}>{comp.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* No Results */}
      {search !== '' && filteredComponents.length === 0 && (
        <div style={styles.noResults}>
          <div style={styles.noResultsIcon}>
            <SearchIcon />
          </div>
          <p style={{ margin: 0 }}>No components found</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px' }}>Try searching for something else</p>
        </div>
      )}
    </div>
  );
}
