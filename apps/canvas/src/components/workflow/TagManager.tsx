/**
 * Tag Manager Component
 * Handles tag management with autocomplete and color coding
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import { radii, fontWeight, shadows, spacing } from '../../lib/designTokens';

// ============================================================================
// Tag Colors
// ============================================================================

const TAG_COLORS = [
  {
    name: 'gray',
    bg: 'rgba(107, 114, 128, 0.15)',
    text: '#6b7280',
    border: 'rgba(107, 114, 128, 0.3)',
  },
  { name: 'red', bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  {
    name: 'orange',
    bg: 'rgba(249, 115, 22, 0.15)',
    text: '#f97316',
    border: 'rgba(249, 115, 22, 0.3)',
  },
  {
    name: 'yellow',
    bg: 'rgba(234, 179, 8, 0.15)',
    text: '#eab308',
    border: 'rgba(234, 179, 8, 0.3)',
  },
  {
    name: 'green',
    bg: 'rgba(34, 197, 94, 0.15)',
    text: '#22c55e',
    border: 'rgba(34, 197, 94, 0.3)',
  },
  {
    name: 'blue',
    bg: 'rgba(59, 130, 246, 0.15)',
    text: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  {
    name: 'purple',
    bg: 'rgba(168, 85, 247, 0.15)',
    text: '#a855f7',
    border: 'rgba(168, 85, 247, 0.3)',
  },
  {
    name: 'pink',
    bg: 'rgba(236, 72, 153, 0.15)',
    text: '#ec4899',
    border: 'rgba(236, 72, 153, 0.3)',
  },
];

interface TagColor {
  name: string;
  bg: string;
  text: string;
  border: string;
}

const DEFAULT_COLOR: TagColor = {
  name: 'gray',
  bg: 'rgba(107, 114, 128, 0.15)',
  text: '#6b7280',
  border: 'rgba(107, 114, 128, 0.3)',
};

function getTagColor(tag: string): TagColor {
  // Generate consistent color based on tag string
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    const char = tag.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index] ?? DEFAULT_COLOR;
}

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const PlusIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    alignItems: 'center',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: fontWeight.medium,
    borderRadius: radii.pill,
    border: '1px solid',
    cursor: 'default',
    transition: 'all 0.1s ease',
  },
  tagRemoveButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    marginLeft: 2,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    opacity: 0.6,
    borderRadius: '50%',
    transition: 'opacity 0.1s ease',
  },
  addTagButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    backgroundColor: 'transparent',
    border: '1px dashed var(--border)',
    borderRadius: radii.pill,
    cursor: 'pointer',
    transition: 'all 0.1s ease',
  },
  addTagButtonHover: {
    borderColor: 'var(--primary)',
    color: 'var(--primary)',
    backgroundColor: 'rgba(var(--primary-rgb), 0.05)',
  },
  inputContainer: {
    position: 'relative' as const,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputFocused: {
    borderColor: 'var(--primary)',
  },
  suggestions: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    boxShadow: shadows.md,
    maxHeight: 160,
    overflowY: 'auto' as const,
    zIndex: 50,
  },
  suggestionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  },
  suggestionItemHovered: {
    backgroundColor: 'var(--accent)',
  },
  suggestionItemSelected: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  noSuggestions: {
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--muted-foreground)',
    fontStyle: 'italic' as const,
  },
  label: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
};

// ============================================================================
// Props
// ============================================================================

interface TagManagerProps {
  tags: string[];
  allTags?: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
  maxTags?: number;
  readOnly?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function TagManager({
  tags,
  allTags = [],
  onChange,
  placeholder = 'Add tag...',
  label,
  maxTags = 10,
  readOnly = false,
}: TagManagerProps): React.JSX.Element {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hoveredSuggestion, setHoveredSuggestion] = useState(-1);
  const [addButtonHovered, setAddButtonHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (inputValue.length === 0) {
      // Show all unused tags when input is empty
      return allTags.filter((t) => !tags.includes(t)).slice(0, 8);
    }

    const lowerInput = inputValue.toLowerCase();
    return allTags
      .filter((t) => !tags.includes(t) && t.toLowerCase().includes(lowerInput))
      .slice(0, 8);
  }, [inputValue, allTags, tags]);

  // Focus input when adding
  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  // Handle add tag
  const handleAddTag = useCallback(
    (tag: string): void => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed.length === 0) return;
      if (tags.includes(trimmed)) return;
      if (tags.length >= maxTags) return;

      onChange([...tags, trimmed]);
      setInputValue('');
      setHoveredSuggestion(-1);
    },
    [tags, onChange, maxTags]
  );

  // Handle remove tag
  const handleRemoveTag = useCallback(
    (tagToRemove: string): void => {
      onChange(tags.filter((t) => t !== tagToRemove));
    },
    [tags, onChange]
  );

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
    setHoveredSuggestion(-1);
  }, []);

  // Handle input key down
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (hoveredSuggestion >= 0 && suggestions[hoveredSuggestion] !== undefined) {
          handleAddTag(suggestions[hoveredSuggestion]);
        } else if (inputValue.trim().length > 0) {
          handleAddTag(inputValue);
        }
      } else if (e.key === 'Escape') {
        setIsAdding(false);
        setInputValue('');
        setHoveredSuggestion(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHoveredSuggestion((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHoveredSuggestion((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Backspace' && inputValue.length === 0 && tags.length > 0) {
        const lastTag = tags[tags.length - 1];
        if (lastTag !== undefined) {
          handleRemoveTag(lastTag);
        }
      }
    },
    [hoveredSuggestion, suggestions, inputValue, handleAddTag, tags, handleRemoveTag]
  );

  // Handle input blur
  const handleInputBlur = useCallback((): void => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setIsAdding(false);
      setInputValue('');
      setHoveredSuggestion(-1);
    }, 150);
  }, []);

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (tag: string): void => {
      handleAddTag(tag);
      inputRef.current?.focus();
    },
    [handleAddTag]
  );

  // Handle start adding
  const handleStartAdding = useCallback((): void => {
    if (!readOnly && tags.length < maxTags) {
      setIsAdding(true);
    }
  }, [readOnly, tags.length, maxTags]);

  return (
    <div style={styles.container}>
      {label !== undefined && <div style={styles.label}>{label}</div>}

      <div style={styles.tagsContainer}>
        {/* Existing tags */}
        {tags.map((tag) => {
          const color = getTagColor(tag);
          return (
            <span
              key={tag}
              style={{
                ...styles.tag,
                backgroundColor: color.bg,
                color: color.text,
                borderColor: color.border,
              }}
            >
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  style={styles.tagRemoveButton}
                  onClick={() => {
                    handleRemoveTag(tag);
                  }}
                  title="Remove tag"
                >
                  <CloseIcon />
                </button>
              )}
            </span>
          );
        })}

        {/* Add tag input or button */}
        {!readOnly &&
          tags.length < maxTags &&
          (isAdding ? (
            <div style={styles.inputContainer}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                placeholder={placeholder}
                style={{
                  ...styles.input,
                  width: 120,
                }}
              />

              {/* Suggestions dropdown */}
              {(suggestions.length > 0 || inputValue.length > 0) && (
                <div style={styles.suggestions}>
                  {suggestions.length > 0 ? (
                    suggestions.map((suggestion, index) => {
                      const color = getTagColor(suggestion);
                      return (
                        <div
                          key={suggestion}
                          style={{
                            ...styles.suggestionItem,
                            ...(index === hoveredSuggestion ? styles.suggestionItemHovered : {}),
                          }}
                          onMouseEnter={() => {
                            setHoveredSuggestion(index);
                          }}
                          onMouseLeave={() => {
                            setHoveredSuggestion(-1);
                          }}
                          onClick={() => {
                            handleSuggestionClick(suggestion);
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: color.text,
                            }}
                          />
                          {suggestion}
                        </div>
                      );
                    })
                  ) : inputValue.length > 0 ? (
                    <div style={styles.noSuggestions}>
                      Press Enter to add &quot;{inputValue}&quot;
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              style={{
                ...styles.addTagButton,
                ...(addButtonHovered ? styles.addTagButtonHover : {}),
              }}
              onClick={handleStartAdding}
              onMouseEnter={() => {
                setAddButtonHovered(true);
              }}
              onMouseLeave={() => {
                setAddButtonHovered(false);
              }}
            >
              <PlusIcon />
              Add tag
            </button>
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tag Display (Read-only version)
// ============================================================================

interface TagDisplayProps {
  tags: string[];
  maxVisible?: number;
}

export function TagDisplay({ tags, maxVisible = 5 }: TagDisplayProps): React.JSX.Element | null {
  if (tags.length === 0) return null;

  const visibleTags = tags.slice(0, maxVisible);
  const hiddenCount = tags.length - maxVisible;

  return (
    <div style={styles.tagsContainer}>
      {visibleTags.map((tag) => {
        const color = getTagColor(tag);
        return (
          <span
            key={tag}
            style={{
              ...styles.tag,
              backgroundColor: color.bg,
              color: color.text,
              borderColor: color.border,
            }}
          >
            {tag}
          </span>
        );
      })}
      {hiddenCount > 0 && (
        <span
          style={{
            ...styles.tag,
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
            borderColor: 'var(--border)',
          }}
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Tag Filter (For filtering cards by tags)
// ============================================================================

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilter({
  allTags,
  selectedTags,
  onChange,
}: TagFilterProps): React.JSX.Element | null {
  const handleToggle = useCallback(
    (tag: string): void => {
      if (selectedTags.includes(tag)) {
        onChange(selectedTags.filter((t) => t !== tag));
      } else {
        onChange([...selectedTags, tag]);
      }
    },
    [selectedTags, onChange]
  );

  const handleClear = useCallback((): void => {
    onChange([]);
  }, [onChange]);

  if (allTags.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={styles.label}>Filter by Tags</div>
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              fontSize: 10,
              color: 'var(--muted-foreground)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={styles.tagsContainer}>
        {allTags.map((tag) => {
          const color = getTagColor(tag);
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => {
                handleToggle(tag);
              }}
              style={{
                ...styles.tag,
                backgroundColor: isSelected ? color.text : color.bg,
                color: isSelected ? '#fff' : color.text,
                borderColor: color.border,
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
