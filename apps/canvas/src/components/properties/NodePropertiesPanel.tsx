import React, { useState } from 'react';

import type { CustomCSS } from '../../types/customCSS';
import type { Node } from '@xyflow/react';

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface NodePropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, updates: Partial<Node['data']>) => void;
}

type PropertyCategory = 'layout' | 'typography' | 'colors' | 'border' | 'spacing' | 'effects';

// =============================================================================
// ICONS
// =============================================================================

// Chevron - 10px for section headers
const ChevronRightIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

// Section icons - 13px
const LayoutIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const SpacingIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="6" y="6" width="12" height="12" rx="1"></rect>
    <line x1="6" y1="3" x2="6" y2="6"></line>
    <line x1="18" y1="3" x2="18" y2="6"></line>
    <line x1="6" y1="18" x2="6" y2="21"></line>
    <line x1="18" y1="18" x2="18" y2="21"></line>
    <line x1="3" y1="6" x2="6" y2="6"></line>
    <line x1="3" y1="18" x2="6" y2="18"></line>
    <line x1="18" y1="6" x2="21" y2="6"></line>
    <line x1="18" y1="18" x2="21" y2="18"></line>
  </svg>
);

const TypeIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polyline points="4 7 4 4 20 4 20 7"></polyline>
    <line x1="9" y1="20" x2="15" y2="20"></line>
    <line x1="12" y1="4" x2="12" y2="20"></line>
  </svg>
);

const PaletteIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="8" r="2" fill="currentColor"></circle>
    <circle cx="8" cy="14" r="2" fill="currentColor"></circle>
    <circle cx="16" cy="14" r="2" fill="currentColor"></circle>
  </svg>
);

const BorderIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="3"></rect>
  </svg>
);

const SparklesIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>
    <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15z"></path>
  </svg>
);

// Empty state - 36px
const EmptyStateIcon = (): React.JSX.Element => (
  <svg
    width="36"
    height="36"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.3"></rect>
    <path d="M8 12h8M12 8v8" opacity="0.5"></path>
  </svg>
);

// =============================================================================
// CATEGORY CONFIGURATION
// =============================================================================

const CATEGORY_CONFIG: Record<
  PropertyCategory,
  {
    label: string;
    icon: React.FC;
    description: string;
  }
> = {
  layout: {
    label: 'Layout',
    icon: LayoutIcon,
    description: 'Size and display',
  },
  spacing: {
    label: 'Spacing',
    icon: SpacingIcon,
    description: 'Padding, margin, gap',
  },
  typography: {
    label: 'Typography',
    icon: TypeIcon,
    description: 'Font and text styles',
  },
  colors: {
    label: 'Colors',
    icon: PaletteIcon,
    description: 'Fill and text colors',
  },
  border: {
    label: 'Border',
    icon: BorderIcon,
    description: 'Stroke and radius',
  },
  effects: {
    label: 'Effects',
    icon: SparklesIcon,
    description: 'Shadow and opacity',
  },
};

// Default values for each property (to detect modifications)
const DEFAULT_VALUES: Record<string, string> = {
  width: '',
  height: '',
  minWidth: '',
  maxWidth: '',
  display: '',
  padding: '',
  margin: '',
  gap: '',
  fontSize: '',
  fontWeight: '',
  lineHeight: '',
  textAlign: '',
  color: '',
  backgroundColor: '',
  borderWidth: '',
  borderColor: '',
  borderRadius: '',
  borderStyle: '',
  boxShadow: '',
  opacity: '',
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
    color: 'var(--foreground)',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 20px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
    // No border - shadow-only design
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'lowercase' as const,
    letterSpacing: '0.06em',
    color: 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--foreground)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    textAlign: 'center' as const,
    flex: 1,
  },
  emptyStateIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 11,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    lineHeight: 1.5,
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  categorySection: {
    // No border - use subtle background bands
  },
  categorySectionEven: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 20%, transparent)',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '14px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: 12,
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
    textAlign: 'left' as const,
  },
  categoryHeaderHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
  },
  categoryHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--muted-foreground)',
  },
  categoryLabel: {
    fontWeight: 500,
    fontSize: 12,
    color: 'var(--foreground)',
  },
  categoryHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  modifiedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--primary-foreground)',
    backgroundColor: 'var(--primary)',
    borderRadius: 9999,
  },
  chevronIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    display: 'flex',
    alignItems: 'center',
    transition: `transform 150ms ${EASE_OUT}`,
  },
  categoryContent: {
    padding: '4px 20px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    overflow: 'hidden',
    transition: `all 200ms ${EASE_OUT}`,
  },
  // Input styles
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  inputRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    letterSpacing: '0.02em',
    marginBottom: 4,
  },
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    height: 34,
    padding: '0 14px',
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'inherit',
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    color: 'var(--foreground)',
    border: 'none',
    borderRadius: 8,
    outline: 'none',
    transition: `all 200ms ${EASE_OUT}`,
  },
  inputWithUnit: {
    paddingRight: 40,
  },
  inputFocused: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 70%, transparent)',
    boxShadow:
      'inset 0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 1px color-mix(in oklch, var(--border) 50%, transparent)',
  },
  inputModified: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  },
  inputUnit: {
    position: 'absolute' as const,
    right: 14,
    fontSize: 10,
    color: 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  select: {
    width: '100%',
    height: 34,
    padding: '0 14px',
    paddingRight: 32,
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'inherit',
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    color: 'var(--foreground)',
    border: 'none',
    borderRadius: 8,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2.5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    transition: `all 200ms ${EASE_OUT}`,
  },
  selectModified: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  },
  colorInputContainer: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  colorSwatch: {
    width: 34,
    height: 34,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    transition: `all 200ms ${EASE_OUT}`,
  },
  colorSwatchHover: {
    transform: 'scale(1.05)',
  },
  colorSwatchInner: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  colorText: {
    flex: 1,
  },
};

// =============================================================================
// INPUT COMPONENTS
// =============================================================================

interface PropertyInputProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  unit?: string;
  type?: 'text' | 'number';
}

function PropertyInput({
  label,
  value,
  onChange,
  placeholder,
  unit,
  type = 'text',
}: PropertyInputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const isModified =
    value !== undefined &&
    value !== '' &&
    value !== DEFAULT_VALUES[label.toLowerCase().replace(/\s/g, '')];

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>{label}</label>
      <div style={styles.inputWrapper}>
        <input
          type={type}
          value={value ?? ''}
          onChange={(e): void => {
            onChange(e.target.value);
          }}
          onFocus={(): void => {
            setIsFocused(true);
          }}
          onBlur={(): void => {
            setIsFocused(false);
          }}
          placeholder={placeholder}
          style={{
            ...styles.input,
            ...(unit ? styles.inputWithUnit : {}),
            ...(isFocused ? styles.inputFocused : {}),
            ...(isModified && !isFocused ? styles.inputModified : {}),
          }}
        />
        {unit ? <span style={styles.inputUnit}>{unit}</span> : null}
      </div>
    </div>
  );
}

interface PropertySelectProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}

function PropertySelect({
  label,
  value,
  onChange,
  options,
}: PropertySelectProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const isModified = value !== undefined && value !== '';

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>{label}</label>
      <select
        value={value ?? ''}
        onChange={(e): void => {
          onChange(e.target.value);
        }}
        onFocus={(): void => {
          setIsFocused(true);
        }}
        onBlur={(): void => {
          setIsFocused(false);
        }}
        style={{
          ...styles.select,
          ...(isFocused ? styles.inputFocused : {}),
          ...(isModified && !isFocused ? styles.selectModified : {}),
        }}
      >
        <option value="">Default</option>
        {options.map(
          (opt): React.JSX.Element => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        )}
      </select>
    </div>
  );
}

interface ColorInputProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

function ColorInput({ label, value, onChange, placeholder }: ColorInputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const isModified = value !== undefined && value !== '';
  const displayColor = value ?? '#000000';

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>{label}</label>
      <div style={styles.colorInputContainer}>
        <style>{`
					.color-swatch-input {
						width: 34px;
						height: 34px;
						border: none;
						padding: 0;
						cursor: pointer;
						border-radius: 8px;
						appearance: none;
						-webkit-appearance: none;
						background: none;
					}
					.color-swatch-input::-webkit-color-swatch-wrapper {
						padding: 0;
						border-radius: 8px;
					}
					.color-swatch-input::-webkit-color-swatch {
						border: none;
						border-radius: 8px;
					}
					.color-swatch-input::-moz-color-swatch {
						border: none;
						border-radius: 8px;
					}
				`}</style>
        <div style={styles.colorSwatch}>
          <input
            type="color"
            className="color-swatch-input"
            value={displayColor}
            onChange={(e): void => {
              onChange(e.target.value);
            }}
          />
        </div>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e): void => {
            onChange(e.target.value);
          }}
          onFocus={(): void => {
            setIsFocused(true);
          }}
          onBlur={(): void => {
            setIsFocused(false);
          }}
          placeholder={placeholder}
          style={{
            ...styles.input,
            ...styles.colorText,
            ...(isFocused ? styles.inputFocused : {}),
            ...(isModified && !isFocused ? styles.inputModified : {}),
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NodePropertiesPanel({
  selectedNode,
  onUpdateNode,
}: NodePropertiesPanelProps): React.JSX.Element {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<PropertyCategory>>(
    new Set(['effects']) // Start with effects collapsed by default
  );
  const [hoveredCategory, setHoveredCategory] = useState<PropertyCategory | null>(null);

  // Empty state
  if (selectedNode === null) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>Properties</div>
          <div style={styles.headerSubtitle}>Component Inspector</div>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>
            <EmptyStateIcon />
          </div>
          <div style={styles.emptyStateTitle}>No selection</div>
          <div style={styles.emptyStateText}>
            Select a component on the canvas
            <br />
            to edit its properties
          </div>
        </div>
      </div>
    );
  }

  const customCSS: CustomCSS = (selectedNode.data['customCSS'] as CustomCSS | undefined) ?? {};

  const updateCSS = (updates: Partial<CustomCSS>): void => {
    const newCustomCSS = { ...customCSS, ...updates };
    onUpdateNode(selectedNode.id, { customCSS: newCustomCSS });
  };

  const toggleCategory = (category: PropertyCategory): void => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  // Count modified properties per category
  const getModifiedCount = (category: PropertyCategory): number => {
    const propertyMap: Record<PropertyCategory, (keyof CustomCSS)[]> = {
      layout: ['width', 'height', 'minWidth', 'maxWidth', 'display'],
      spacing: ['padding', 'margin', 'gap'],
      typography: ['fontSize', 'fontWeight', 'lineHeight', 'textAlign'],
      colors: ['color', 'backgroundColor'],
      border: ['borderWidth', 'borderColor', 'borderRadius', 'borderStyle'],
      effects: ['boxShadow', 'opacity'],
    };

    return propertyMap[category].filter(
      (prop) => customCSS[prop] !== undefined && customCSS[prop] !== ''
    ).length;
  };

  const renderCategoryHeader = (category: PropertyCategory): React.JSX.Element => {
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isCollapsed = collapsedCategories.has(category);
    const isHovered = hoveredCategory === category;
    const modifiedCount = getModifiedCount(category);

    return (
      <button
        onClick={(): void => {
          toggleCategory(category);
        }}
        onMouseEnter={(): void => {
          setHoveredCategory(category);
        }}
        onMouseLeave={(): void => {
          setHoveredCategory(null);
        }}
        style={{
          ...styles.categoryHeader,
          ...(isHovered ? styles.categoryHeaderHover : {}),
        }}
      >
        <div style={styles.categoryHeaderLeft}>
          <span
            style={{
              ...styles.chevronIcon,
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            }}
          >
            <ChevronRightIcon />
          </span>
          <div style={styles.categoryIconWrapper}>
            <Icon />
          </div>
          <span style={styles.categoryLabel}>{config.label}</span>
        </div>
        <div style={styles.categoryHeaderRight}>
          {modifiedCount > 0 && <span style={styles.modifiedBadge}>{modifiedCount}</span>}
        </div>
      </button>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Properties</div>
        <div style={styles.headerSubtitle}>
          {(selectedNode.data as { label?: string }).label ?? selectedNode.type ?? 'Component'}
        </div>
      </div>

      <div style={styles.scrollContainer}>
        {/* Layout Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('layout')}
          {!collapsedCategories.has('layout') && (
            <div style={styles.categoryContent}>
              <div style={styles.inputRow}>
                <PropertyInput
                  label="Width"
                  value={customCSS.width}
                  onChange={(v) => {
                    updateCSS({ width: v });
                  }}
                  placeholder="auto"
                  unit="px"
                />
                <PropertyInput
                  label="Height"
                  value={customCSS.height}
                  onChange={(v) => {
                    updateCSS({ height: v });
                  }}
                  placeholder="auto"
                  unit="px"
                />
              </div>
              <div style={styles.inputRow}>
                <PropertyInput
                  label="Min Width"
                  value={customCSS.minWidth}
                  onChange={(v) => {
                    updateCSS({ minWidth: v });
                  }}
                  placeholder="none"
                  unit="px"
                />
                <PropertyInput
                  label="Max Width"
                  value={customCSS.maxWidth}
                  onChange={(v) => {
                    updateCSS({ maxWidth: v });
                  }}
                  placeholder="none"
                  unit="px"
                />
              </div>
              <PropertySelect
                label="Display"
                value={customCSS.display}
                onChange={(v) => {
                  updateCSS({ display: v });
                }}
                options={[
                  { label: 'Block', value: 'block' },
                  { label: 'Flex', value: 'flex' },
                  { label: 'Grid', value: 'grid' },
                  { label: 'Inline Block', value: 'inline-block' },
                  { label: 'Inline', value: 'inline' },
                  { label: 'None', value: 'none' },
                ]}
              />
            </div>
          )}
        </div>

        {/* Spacing Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('spacing')}
          {!collapsedCategories.has('spacing') && (
            <div style={styles.categoryContent}>
              <PropertyInput
                label="Padding"
                value={customCSS.padding}
                onChange={(v) => {
                  updateCSS({ padding: v });
                }}
                placeholder="0"
                unit="px"
              />
              <PropertyInput
                label="Margin"
                value={customCSS.margin}
                onChange={(v) => {
                  updateCSS({ margin: v });
                }}
                placeholder="0"
                unit="px"
              />
              <PropertyInput
                label="Gap"
                value={customCSS.gap}
                onChange={(v) => {
                  updateCSS({ gap: v });
                }}
                placeholder="0"
                unit="px"
              />
            </div>
          )}
        </div>

        {/* Typography Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('typography')}
          {!collapsedCategories.has('typography') && (
            <div style={styles.categoryContent}>
              <div style={styles.inputRow}>
                <PropertyInput
                  label="Font Size"
                  value={customCSS.fontSize}
                  onChange={(v) => {
                    updateCSS({ fontSize: v });
                  }}
                  placeholder="16"
                  unit="px"
                />
                <PropertyInput
                  label="Font Weight"
                  value={customCSS.fontWeight}
                  onChange={(v) => {
                    updateCSS({ fontWeight: v });
                  }}
                  placeholder="400"
                />
              </div>
              <div style={styles.inputRow}>
                <PropertyInput
                  label="Line Height"
                  value={customCSS.lineHeight}
                  onChange={(v) => {
                    updateCSS({ lineHeight: v });
                  }}
                  placeholder="1.5"
                />
                <PropertySelect
                  label="Text Align"
                  value={customCSS.textAlign}
                  onChange={(v) => {
                    if (v === '') {
                      const { textAlign, ...rest } = customCSS;
                      void textAlign; // Explicitly unused
                      onUpdateNode(selectedNode.id, { customCSS: rest });
                    } else {
                      updateCSS({ textAlign: v as 'left' | 'center' | 'right' | 'justify' });
                    }
                  }}
                  options={[
                    { label: 'Left', value: 'left' },
                    { label: 'Center', value: 'center' },
                    { label: 'Right', value: 'right' },
                    { label: 'Justify', value: 'justify' },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        {/* Color Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('colors')}
          {!collapsedCategories.has('colors') && (
            <div style={styles.categoryContent}>
              <ColorInput
                label="Text Color"
                value={customCSS.color}
                onChange={(v) => {
                  updateCSS({ color: v });
                }}
                placeholder="#000000"
              />
              <ColorInput
                label="Background"
                value={customCSS.backgroundColor}
                onChange={(v) => {
                  updateCSS({ backgroundColor: v });
                }}
                placeholder="transparent"
              />
            </div>
          )}
        </div>

        {/* Border Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('border')}
          {!collapsedCategories.has('border') && (
            <div style={styles.categoryContent}>
              <div style={styles.inputRow}>
                <PropertyInput
                  label="Border Width"
                  value={customCSS.borderWidth}
                  onChange={(v) => {
                    updateCSS({ borderWidth: v });
                  }}
                  placeholder="0"
                  unit="px"
                />
                <PropertyInput
                  label="Border Radius"
                  value={customCSS.borderRadius}
                  onChange={(v) => {
                    updateCSS({ borderRadius: v });
                  }}
                  placeholder="0"
                  unit="px"
                />
              </div>
              <div style={styles.inputRow}>
                <ColorInput
                  label="Border Color"
                  value={customCSS.borderColor}
                  onChange={(v) => {
                    updateCSS({ borderColor: v });
                  }}
                  placeholder="#e5e7eb"
                />
                <PropertySelect
                  label="Border Style"
                  value={customCSS.borderStyle}
                  onChange={(v) => {
                    if (v === '') {
                      const { borderStyle, ...rest } = customCSS;
                      void borderStyle; // Explicitly unused
                      onUpdateNode(selectedNode.id, { customCSS: rest });
                    } else {
                      updateCSS({ borderStyle: v as 'solid' | 'dashed' | 'dotted' | 'none' });
                    }
                  }}
                  options={[
                    { label: 'Solid', value: 'solid' },
                    { label: 'Dashed', value: 'dashed' },
                    { label: 'Dotted', value: 'dotted' },
                    { label: 'None', value: 'none' },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        {/* Effects Properties */}
        <div style={styles.categorySection}>
          {renderCategoryHeader('effects')}
          {!collapsedCategories.has('effects') && (
            <div style={styles.categoryContent}>
              <PropertyInput
                label="Box Shadow"
                value={customCSS.boxShadow}
                onChange={(v) => {
                  updateCSS({ boxShadow: v });
                }}
                placeholder="none"
              />
              <PropertyInput
                label="Opacity"
                value={customCSS.opacity}
                onChange={(v) => {
                  updateCSS({ opacity: v });
                }}
                placeholder="1"
                type="number"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
