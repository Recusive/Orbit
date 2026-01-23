/**
 * ElementPropertiesPanel - Properties inspector for selected elements
 *
 * Shows computed styles, allows editing Tailwind classes, and syncs changes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface SelectedElementData {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  rect: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  path: string;
  /** JSX path for structural editing (e.g., "0.1.2") */
  jsxPath: string;
}

export interface StructuralEditingState {
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/** Element type for insertion */
export type InsertableElement = 'div' | 'span' | 'p' | 'button' | 'a' | 'img' | 'input';

export interface ElementPropertiesPanelProps {
  element: SelectedElementData | null;
  onClassChange?: (newClassName: string) => void;
  onStyleChange?: (property: string, value: string) => void;
  /** Structural editing callbacks */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** Insert a new element after the selected one */
  onAddElement?: (elementType: InsertableElement) => void;
  /** Wrap element in a container div */
  onWrap?: () => void;
  /** Whether structural operations are available */
  structuralState?: StructuralEditingState;
}

// Property group configuration
interface PropertyGroup {
  label: string;
  icon: React.ReactNode;
  properties: {
    key: string;
    label: string;
    cssProperty: string;
  }[];
}

// Icons
const LayoutIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const SpacingIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="6" width="12" height="12" />
    <line x1="6" y1="3" x2="6" y2="6" />
    <line x1="18" y1="3" x2="18" y2="6" />
    <line x1="6" y1="18" x2="6" y2="21" />
    <line x1="18" y1="18" x2="18" y2="21" />
    <line x1="3" y1="6" x2="6" y2="6" />
    <line x1="18" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="6" y2="18" />
    <line x1="18" y1="18" x2="21" y2="18" />
  </svg>
);

const SizeIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 21H3V3" />
    <path d="M21 9V3h-6" />
    <path d="M3 15v6h6" />
  </svg>
);

const TypeIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const FillIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const BorderIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const propertyGroups: PropertyGroup[] = [
  {
    label: 'Layout',
    icon: <LayoutIcon />,
    properties: [
      { key: 'display', label: 'Display', cssProperty: 'display' },
      { key: 'flexDirection', label: 'Direction', cssProperty: 'flex-direction' },
      { key: 'justifyContent', label: 'Justify', cssProperty: 'justify-content' },
      { key: 'alignItems', label: 'Align', cssProperty: 'align-items' },
      { key: 'gap', label: 'Gap', cssProperty: 'gap' },
    ],
  },
  {
    label: 'Spacing',
    icon: <SpacingIcon />,
    properties: [
      { key: 'padding', label: 'Padding', cssProperty: 'padding' },
      { key: 'margin', label: 'Margin', cssProperty: 'margin' },
    ],
  },
  {
    label: 'Size',
    icon: <SizeIcon />,
    properties: [
      { key: 'width', label: 'Width', cssProperty: 'width' },
      { key: 'height', label: 'Height', cssProperty: 'height' },
    ],
  },
  {
    label: 'Typography',
    icon: <TypeIcon />,
    properties: [
      { key: 'fontSize', label: 'Size', cssProperty: 'font-size' },
      { key: 'fontWeight', label: 'Weight', cssProperty: 'font-weight' },
      { key: 'color', label: 'Color', cssProperty: 'color' },
      { key: 'fontFamily', label: 'Font', cssProperty: 'font-family' },
    ],
  },
  {
    label: 'Fill',
    icon: <FillIcon />,
    properties: [{ key: 'backgroundColor', label: 'Background', cssProperty: 'background-color' }],
  },
  {
    label: 'Border',
    icon: <BorderIcon />,
    properties: [
      { key: 'border', label: 'Border', cssProperty: 'border' },
      { key: 'borderRadius', label: 'Radius', cssProperty: 'border-radius' },
    ],
  },
];

// Parse Tailwind classes into categories
function parseTailwindClasses(className: string): Record<string, string[]> {
  const classes = className.split(/\s+/).filter(Boolean);
  const categories: Record<string, string[]> = {
    layout: [],
    spacing: [],
    sizing: [],
    typography: [],
    colors: [],
    borders: [],
    effects: [],
    other: [],
  };

  const patterns: Record<string, RegExp> = {
    layout: /^(flex|grid|block|inline|hidden|items-|justify-|self-|place-|order-|col-|row-|gap-)/,
    spacing: /^(p-|px-|py-|pt-|pr-|pb-|pl-|m-|mx-|my-|mt-|mr-|mb-|ml-|space-)/,
    sizing: /^(w-|h-|min-w-|min-h-|max-w-|max-h-|size-)/,
    typography: /^(text-|font-|leading-|tracking-|align-|whitespace-|break-|truncate)/,
    colors: /^(bg-|text-(?!xs|sm|base|lg|xl)|from-|to-|via-)/,
    borders: /^(border|rounded|ring|outline|divide)/,
    effects:
      /^(shadow|opacity|blur|brightness|contrast|grayscale|invert|saturate|sepia|backdrop|transition|duration|ease|delay|animate)/,
  };

  for (const cls of classes) {
    let matched = false;
    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.test(cls)) {
        const categoryArr = categories[category];
        if (categoryArr) {
          categoryArr.push(cls);
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      const otherArr = categories['other'];
      if (otherArr) {
        otherArr.push(cls);
      }
    }
  }

  return categories;
}

// Color swatch component
function ColorSwatch({ color }: { color: string }): React.JSX.Element {
  const isTransparent = color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 3,
        backgroundColor: isTransparent ? '#fff' : color,
        border: '1px solid rgba(255,255,255,0.2)',
        backgroundImage: isTransparent
          ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
          : 'none',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
        flexShrink: 0,
      }}
      title={color}
    />
  );
}

// Editable property input component
interface EditablePropertyProps {
  property: string;
  value: string;
  isColor: boolean;
  onSave: (property: string, value: string) => void;
}

function EditableProperty({
  property,
  value,
  isColor,
  onSave,
}: EditablePropertyProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback((): void => {
    if (editValue !== value) {
      onSave(property, editValue);
    }
    setIsEditing(false);
  }, [editValue, value, property, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        setEditValue(value);
        setIsEditing(false);
      }
    },
    [handleSave, value]
  );

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {isColor ? (
          <input
            type="color"
            value={editValue.startsWith('#') ? editValue : '#000000'}
            onChange={(e): void => {
              setEditValue(e.target.value);
            }}
            style={{
              width: 20,
              height: 20,
              padding: 0,
              border: '1px solid #4b5563',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          />
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e): void => {
            setEditValue(e.target.value);
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          style={{
            width: isColor ? 70 : 80,
            padding: '2px 4px',
            backgroundColor: '#0d0d1a',
            border: '1px solid #3b82f6',
            borderRadius: 3,
            color: '#e5e7eb',
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={(): void => {
        setIsEditing(true);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 3,
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e): void => {
        e.currentTarget.style.backgroundColor = '#2d2d44';
      }}
      onMouseLeave={(e): void => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      title="Click to edit"
    >
      {isColor && value !== '-' ? <ColorSwatch color={value} /> : null}
      <span style={styles['propertyValueText']}>
        {value.length > 20 ? value.slice(0, 20) + '...' : value}
      </span>
    </div>
  );
}

// Spacing slider component
interface SpacingSliderProps {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
}

const SPACING_VALUES = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24'];

function SpacingSlider({
  label,
  property,
  value,
  onChange,
}: SpacingSliderProps): React.JSX.Element {
  // Parse current value to find closest index
  const parseValue = (val: string): number => {
    const match = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(val);
    if (!match?.[1]) return 4; // default to index 4 (4/1rem)
    const num = parseFloat(match[1]);
    const unit = match[2];
    // Convert to rem scale (1rem = 16px)
    const remValue = unit === 'px' ? num / 16 : num;
    // Map to closest spacing value
    const closest = SPACING_VALUES.reduce((prev, curr, idx) => {
      const currRem = parseFloat(curr) * 0.25; // Tailwind spacing: 1 = 0.25rem
      const prevRem = parseFloat(SPACING_VALUES[prev] ?? '0') * 0.25;
      return Math.abs(currRem - remValue) < Math.abs(prevRem - remValue) ? idx : prev;
    }, 0);
    return closest;
  };

  const [sliderValue, setSliderValue] = useState(() => parseValue(value));

  useEffect(() => {
    setSliderValue(parseValue(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const idx = parseInt(e.target.value, 10);
      setSliderValue(idx);
      const spacingValue = SPACING_VALUES[idx] ?? '4';
      const remValue = parseFloat(spacingValue) * 0.25;
      onChange(property, `${String(remValue)}rem`);
    },
    [property, onChange]
  );

  const spacingLabel = SPACING_VALUES[sliderValue] ?? '4';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#9ca3af', width: 50 }}>{label}</span>
      <input
        type="range"
        min={0}
        max={SPACING_VALUES.length - 1}
        value={sliderValue}
        onChange={handleChange}
        style={{
          flex: 1,
          height: 4,
          appearance: 'none',
          backgroundColor: '#374151',
          borderRadius: 2,
          cursor: 'pointer',
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: '#60a5fa',
          fontFamily: 'monospace',
          width: 24,
          textAlign: 'right',
        }}
      >
        {spacingLabel}
      </span>
    </div>
  );
}

// Icons for structural editing
const MoveUpIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const MoveDownIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const DuplicateIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const DeleteIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const AddIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const WrapIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

const INSERTABLE_ELEMENTS: { type: InsertableElement; label: string; template: string }[] = [
  { type: 'div', label: 'Container', template: '<div className="p-4"></div>' },
  { type: 'span', label: 'Span', template: '<span>Text</span>' },
  { type: 'p', label: 'Paragraph', template: '<p className="text-base">Paragraph text</p>' },
  {
    type: 'button',
    label: 'Button',
    template: '<button className="px-4 py-2 bg-blue-500 text-white rounded">Button</button>',
  },
  {
    type: 'a',
    label: 'Link',
    template: '<a href="#" className="text-blue-500 hover:underline">Link</a>',
  },
  { type: 'img', label: 'Image', template: '<img src="" alt="" className="w-full h-auto" />' },
  {
    type: 'input',
    label: 'Input',
    template:
      '<input type="text" placeholder="Enter text..." className="px-3 py-2 border rounded" />',
  },
];

export function ElementPropertiesPanel({
  element,
  onClassChange,
  onStyleChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onAddElement,
  onWrap,
  structuralState,
}: ElementPropertiesPanelProps): React.JSX.Element {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Layout', 'Typography', 'Fill'])
  );
  const [editingClass, setEditingClass] = useState(false);
  const [classValue, setClassValue] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close add menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddMenu]);

  // Update class value when element changes
  useEffect(() => {
    if (element) {
      setClassValue(element.className);
    }
  }, [element]);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleClassSubmit = useCallback(() => {
    if (onClassChange && classValue !== element?.className) {
      onClassChange(classValue);
    }
    setEditingClass(false);
  }, [classValue, element?.className, onClassChange]);

  if (!element) {
    return (
      <div style={styles['emptyState']}>
        <div style={styles['emptyIcon']}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
          </svg>
        </div>
        <div style={styles['emptyText']}>Select an element</div>
        <div style={styles['emptySubtext']}>
          Enter edit mode and click on an element to inspect its properties
        </div>
      </div>
    );
  }

  const tailwindCategories = parseTailwindClasses(element.className);

  return (
    <div style={styles['container']}>
      {/* Header */}
      <div style={styles['header']}>
        <div style={styles['elementTag']}>&lt;{element.tagName}&gt;</div>
        {element.id ? <div style={styles['elementId']}>#{element.id}</div> : null}
      </div>

      {/* Dimensions */}
      <div style={styles['dimensions']}>
        <div style={styles['dimItem']}>
          <span style={styles['dimLabel']}>W</span>
          <span style={styles['dimValue']}>{Math.round(element.rect.width)}</span>
        </div>
        <div style={styles['dimItem']}>
          <span style={styles['dimLabel']}>H</span>
          <span style={styles['dimValue']}>{Math.round(element.rect.height)}</span>
        </div>
        <div style={styles['dimItem']}>
          <span style={styles['dimLabel']}>X</span>
          <span style={styles['dimValue']}>{Math.round(element.rect.x)}</span>
        </div>
        <div style={styles['dimItem']}>
          <span style={styles['dimLabel']}>Y</span>
          <span style={styles['dimValue']}>{Math.round(element.rect.y)}</span>
        </div>
      </div>

      {/* Structural Editing */}
      {onMoveUp !== undefined ||
      onMoveDown !== undefined ||
      onDuplicate !== undefined ||
      onDelete !== undefined ||
      onAddElement !== undefined ||
      onWrap !== undefined ? (
        <div style={styles['structuralSection']}>
          <div style={styles['structuralLabel']}>Structure</div>
          <div style={styles['structuralButtons']}>
            {onMoveUp !== undefined ? (
              <button
                onClick={onMoveUp}
                disabled={structuralState?.canMoveUp === false}
                style={{
                  ...styles['structuralButton'],
                  opacity: structuralState?.canMoveUp === false ? 0.4 : 1,
                  cursor: structuralState?.canMoveUp === false ? 'not-allowed' : 'pointer',
                }}
                title="Move up (Cmd+[ or Cmd+Shift+Up)"
              >
                <MoveUpIcon />
              </button>
            ) : null}
            {onMoveDown !== undefined ? (
              <button
                onClick={onMoveDown}
                disabled={structuralState?.canMoveDown === false}
                style={{
                  ...styles['structuralButton'],
                  opacity: structuralState?.canMoveDown === false ? 0.4 : 1,
                  cursor: structuralState?.canMoveDown === false ? 'not-allowed' : 'pointer',
                }}
                title="Move down (Cmd+] or Cmd+Shift+Down)"
              >
                <MoveDownIcon />
              </button>
            ) : null}
            {onDuplicate !== undefined ? (
              <button
                onClick={onDuplicate}
                style={styles['structuralButton']}
                title="Duplicate element (Cmd+Shift+D)"
              >
                <DuplicateIcon />
              </button>
            ) : null}
            {onAddElement !== undefined ? (
              <div ref={addMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={(): void => {
                    setShowAddMenu(!showAddMenu);
                  }}
                  style={{
                    ...styles['structuralButton'],
                    backgroundColor: showAddMenu ? '#374151' : 'transparent',
                  }}
                  title="Add element after this one"
                >
                  <AddIcon />
                </button>
                {showAddMenu ? (
                  <div style={styles['addMenu']}>
                    {INSERTABLE_ELEMENTS.map((el) => (
                      <button
                        key={el.type}
                        onClick={(): void => {
                          onAddElement(el.type);
                          setShowAddMenu(false);
                        }}
                        style={styles['addMenuItem']}
                        onMouseEnter={(e): void => {
                          e.currentTarget.style.backgroundColor = '#374151';
                        }}
                        onMouseLeave={(e): void => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span style={{ color: '#60a5fa' }}>&lt;{el.type}&gt;</span>
                        <span style={{ color: '#9ca3af', fontSize: 10 }}>{el.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {onWrap !== undefined ? (
              <button
                onClick={onWrap}
                style={styles['structuralButton']}
                title="Wrap in container (Cmd+Shift+W)"
              >
                <WrapIcon />
              </button>
            ) : null}
            {onDelete !== undefined ? (
              <button
                onClick={onDelete}
                style={{ ...styles['structuralButton'], color: '#ef4444' }}
                title="Delete element (Cmd+Backspace)"
              >
                <DeleteIcon />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Tailwind Classes */}
      <div style={styles['section']}>
        <div style={styles['sectionHeader']}>
          <span>Tailwind Classes</span>
          <button
            onClick={(): void => {
              setEditingClass(!editingClass);
            }}
            style={styles['editButton']}
          >
            {editingClass ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingClass ? (
          <div style={styles['classEditor']}>
            <textarea
              value={classValue}
              onChange={(e): void => {
                setClassValue(e.target.value);
              }}
              style={styles['classTextarea']}
              placeholder="Enter Tailwind classes..."
            />
            <button onClick={handleClassSubmit} style={styles['applyButton']}>
              Apply Changes
            </button>
          </div>
        ) : (
          <div style={styles['classTags']}>
            {Object.entries(tailwindCategories).map(([category, classes]) => {
              if (classes.length === 0) return null;
              return (
                <div key={category} style={styles['classCategory']}>
                  <span style={styles['classCategoryLabel']}>{category}</span>
                  <div style={styles['classTagsRow']}>
                    {classes.map((cls, i) => (
                      <span key={i} style={styles['classTag']}>
                        {cls}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {!element.className && <span style={styles['noClasses']}>No classes</span>}
          </div>
        )}
      </div>

      {/* Quick Controls - Visual sliders for common properties */}
      {onStyleChange !== undefined ? (
        <div style={styles['section']}>
          <div style={styles['sectionHeader']}>
            <span>Quick Controls</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SpacingSlider
              label="Padding"
              property="padding"
              value={element.computedStyles['padding'] ?? '0'}
              onChange={onStyleChange}
            />
            <SpacingSlider
              label="Margin"
              property="margin"
              value={element.computedStyles['margin'] ?? '0'}
              onChange={onStyleChange}
            />
            <SpacingSlider
              label="Gap"
              property="gap"
              value={element.computedStyles['gap'] ?? '0'}
              onChange={onStyleChange}
            />
            {/* Color picker for background */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#9ca3af', width: 50 }}>Fill</span>
              <input
                type="color"
                value={(() => {
                  const bg = element.computedStyles['background-color'];
                  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff';
                  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
                  if (match?.[1] && match[2] && match[3]) {
                    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
                    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
                    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                  }
                  return bg.startsWith('#') ? bg : '#ffffff';
                })()}
                onChange={(e): void => {
                  onStyleChange('background-color', e.target.value);
                }}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: '1px solid #4b5563',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                {element.computedStyles['background-color']?.slice(0, 20) ?? 'none'}
              </span>
            </div>
            {/* Color picker for text */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#9ca3af', width: 50 }}>Text</span>
              <input
                type="color"
                value={(() => {
                  const color = element.computedStyles['color'];
                  if (!color) return '#000000';
                  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
                  if (match?.[1] && match[2] && match[3]) {
                    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
                    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
                    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                  }
                  return color.startsWith('#') ? color : '#000000';
                })()}
                onChange={(e): void => {
                  onStyleChange('color', e.target.value);
                }}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: '1px solid #4b5563',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                {element.computedStyles['color']?.slice(0, 20) ?? 'none'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Property Groups */}
      {propertyGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.label);
        return (
          <div key={group.label} style={styles['group']}>
            <button
              onClick={(): void => {
                toggleGroup(group.label);
              }}
              style={styles['groupHeader']}
            >
              <span style={styles['groupIcon']}>{group.icon}</span>
              <span style={styles['groupLabel']}>{group.label}</span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  marginLeft: 'auto',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isExpanded ? (
              <div style={styles['groupContent']}>
                {group.properties.map((prop) => {
                  const value = element.computedStyles[prop.cssProperty] ?? '-';
                  const isColor =
                    prop.cssProperty.includes('color') || prop.cssProperty.includes('background');
                  const isEditable = onStyleChange !== undefined && value !== '-';
                  return (
                    <div key={prop.key} style={styles['propertyRow']}>
                      <span style={styles['propertyLabel']}>{prop.label}</span>
                      <div style={styles['propertyValue']}>
                        {isEditable ? (
                          <EditableProperty
                            property={prop.cssProperty}
                            value={value}
                            isColor={isColor}
                            onSave={onStyleChange}
                          />
                        ) : (
                          <>
                            {isColor && value !== '-' ? <ColorSwatch color={value} /> : null}
                            <span style={styles['propertyValueText']}>
                              {value.length > 20 ? value.slice(0, 20) + '...' : value}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* CSS Path */}
      <div style={styles['pathSection']}>
        <div style={styles['pathLabel']}>Selector Path</div>
        <div style={styles['pathValue']}>{element.path}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a2e',
    color: '#e5e7eb',
    fontSize: 12,
    overflow: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
    textAlign: 'center',
  },
  emptyIcon: {
    color: '#4b5563',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 500,
    color: '#9ca3af',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 11,
    color: '#6b7280',
    maxWidth: 200,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    borderBottom: '1px solid #2d2d44',
  },
  elementTag: {
    fontSize: 14,
    fontWeight: 600,
    color: '#60a5fa',
  },
  elementId: {
    fontSize: 12,
    color: '#f472b6',
  },
  dimensions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid #2d2d44',
    backgroundColor: '#16162a',
  },
  dimItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  dimLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  dimValue: {
    fontSize: 12,
    fontWeight: 500,
    color: '#e5e7eb',
    fontFamily: 'monospace',
  },
  structuralSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderBottom: '1px solid #2d2d44',
    backgroundColor: '#16162a',
  },
  structuralLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  structuralButtons: {
    display: 'flex',
    gap: 4,
  },
  structuralButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    backgroundColor: 'transparent',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#9ca3af',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  addMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 140,
    backgroundColor: '#1f1f3a',
    border: '1px solid #374151',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: 100,
    overflow: 'hidden',
  },
  addMenuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e5e7eb',
    fontSize: 11,
    fontFamily: 'monospace',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.1s',
  },
  section: {
    padding: '10px 14px',
    borderBottom: '1px solid #2d2d44',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  editButton: {
    padding: '2px 8px',
    fontSize: 10,
    backgroundColor: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 3,
    color: '#9ca3af',
    cursor: 'pointer',
  },
  classEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  classTextarea: {
    width: '100%',
    minHeight: 80,
    padding: 8,
    backgroundColor: '#0d0d1a',
    border: '1px solid #3b82f6',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 11,
    fontFamily: 'monospace',
    resize: 'vertical',
  },
  applyButton: {
    padding: '6px 12px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  classTags: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  classCategory: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  classCategoryLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  classTagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  classTag: {
    padding: '2px 6px',
    backgroundColor: '#2d2d44',
    borderRadius: 3,
    fontSize: 10,
    color: '#93c5fd',
    fontFamily: 'monospace',
  },
  noClasses: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  group: {
    borderBottom: '1px solid #2d2d44',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
  },
  groupIcon: {
    color: '#6b7280',
  },
  groupLabel: {
    flex: 1,
  },
  groupContent: {
    padding: '0 14px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  propertyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  propertyLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  propertyValue: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  propertyValueText: {
    fontSize: 11,
    color: '#e5e7eb',
    fontFamily: 'monospace',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pathSection: {
    padding: '10px 14px',
    marginTop: 'auto',
  },
  pathLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pathValue: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
};
