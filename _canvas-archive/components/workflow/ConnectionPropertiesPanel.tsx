import * as Popover from '@radix-ui/react-popover';
import React, { useState, useCallback, useEffect } from 'react';

import type {
  WorkflowConnection,
  ConnectionDirection,
  ContextFlowType,
} from '../../types/workflowTypes';

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
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

const ArrowRightIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);

const ArrowBothIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="7 8 3 12 7 16"></polyline>
    <polyline points="17 8 21 12 17 16"></polyline>
    <line x1="3" y1="12" x2="21" y2="12"></line>
  </svg>
);

const TrashIcon = (): React.JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
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
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const CheckIcon = (): React.JSX.Element => (
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
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const FLOATING_GAP = 8;
const FLOATING_RADIUS = 14;
const TOOLBAR_CLEARANCE = 48;

const styles = {
  overlay: {
    position: 'absolute' as const,
    top: TOOLBAR_CLEARANCE,
    right: FLOATING_GAP,
    width: 300,
    maxHeight: `calc(100% - ${String(TOOLBAR_CLEARANCE + FLOATING_GAP)}px)`,
    backgroundColor: 'var(--card)',
    backdropFilter: 'blur(12px)',
    border: 'none',
    borderRadius: FLOATING_RADIUS,
    boxShadow: '0 8px 32px -8px rgba(0, 0, 0, 0.2), 0 4px 16px -4px rgba(0, 0, 0, 0.1)',
    backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px), linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0%, transparent 60px)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 52,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--foreground)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  closeButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  closeButtonActive: {
    transform: 'scale(0.95)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)',
    textTransform: 'lowercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--foreground) 80%, transparent)',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 36,
    padding: '0 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    border: 'none',
    borderRadius: 8,
    outline: 'none',
    transition: `all 200ms ${EASE_OUT}`,
  },
  inputFocus: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    boxShadow:
      'inset 0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 1px color-mix(in oklch, var(--border) 50%, transparent)',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    border: 'none',
    borderRadius: 8,
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: 60,
    fontFamily: 'inherit',
    transition: `all 200ms ${EASE_OUT}`,
  },
  buttonGroup: {
    display: 'flex',
    gap: 6,
  },
  optionButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    padding: '0 12px',
    fontSize: 11,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  optionButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
  },
  optionButtonActive: {
    color: 'var(--primary-foreground)',
    backgroundColor: 'var(--primary)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  optionButtonPressed: {
    transform: 'scale(0.98)',
  },
  selectTrigger: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    padding: '0 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  selectTriggerHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
  },
  selectTriggerOpen: {
    boxShadow: '0 0 0 1px color-mix(in oklch, var(--border) 50%, transparent)',
  },
  selectChevron: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
  },
  popoverContent: {
    backgroundColor: 'color-mix(in oklch, var(--card) 95%, transparent)',
    backdropFilter: 'blur(12px)',
    border: 'none',
    borderRadius: 10,
    boxShadow: '0 8px 32px -8px rgba(0, 0, 0, 0.2), 0 4px 16px -4px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    minWidth: 200,
    padding: 4,
    zIndex: 200,
  },
  selectOption: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    fontSize: 12,
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 6,
    width: '100%',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: `all 150ms ${EASE_OUT}`,
  },
  selectOptionHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
  },
  selectOptionSelected: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)',
    color: 'var(--primary)',
  },
  prioritySlider: {
    width: '100%',
    height: 4,
    borderRadius: 9999,
    backgroundColor: 'var(--muted)',
    appearance: 'none' as const,
    cursor: 'pointer',
  },
  priorityLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 9,
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    marginTop: 6,
  },
  footer: {
    padding: '12px 16px',
    flexShrink: 0,
  },
  deleteButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    fontSize: 11,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    backgroundColor: 'transparent',
    border: '1px solid color-mix(in oklch, var(--border) 50%, transparent)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  deleteButtonHover: {
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteButtonActive: {
    transform: 'scale(0.98)',
  },
  contextFlowDescription: {
    fontSize: 10,
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    marginTop: 6,
  },
};

// Slider CSS for custom thumb styling
const sliderStyles = `
	.connection-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 150ms ${EASE_OUT};
	}
	.connection-slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
	}
	.connection-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: none;
		border-radius: 50%;
		background: var(--primary);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
`;

// ============================================================================
// Context Flow Descriptions
// ============================================================================

const CONTEXT_FLOW_OPTIONS: { value: ContextFlowType; label: string; description: string }[] = [
  { value: 'full', label: 'Full Content', description: 'Include full content from connected card' },
  { value: 'summary', label: 'Summary Only', description: 'Include AI-generated summary' },
  { value: 'none', label: 'No Context', description: 'Do not include in AI context' },
];

// ============================================================================
// Props
// ============================================================================

interface ConnectionPropertiesPanelProps {
  connection: WorkflowConnection;
  onUpdate: (connectionId: string, updates: Partial<WorkflowConnection>) => void;
  onDelete: (connectionId: string) => void;
  onClose: () => void;
  isSidebarCollapsed?: boolean;
  sidebarVisualWidth?: number;
}

// ============================================================================
// Component
// ============================================================================

export function ConnectionPropertiesPanel({
  connection,
  onUpdate,
  onDelete,
  onClose,
  isSidebarCollapsed = true,
  sidebarVisualWidth = 0,
}: ConnectionPropertiesPanelProps): React.JSX.Element {
  const [label, setLabel] = useState(connection.label);
  const [description, setDescription] = useState(connection.description ?? '');
  const [direction, setDirection] = useState<ConnectionDirection>(connection.direction);
  const [contextFlow, setContextFlow] = useState<ContextFlowType>(connection.contextFlow);
  const [priority, setPriority] = useState(connection.priority);

  // Hover/Press states
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Sync local state when connection changes
  useEffect(() => {
    setLabel(connection.label);
    setDescription(connection.description ?? '');
    setDirection(connection.direction);
    setContextFlow(connection.contextFlow);
    setPriority(connection.priority);
  }, [connection]);

  // Handle label change with debounce
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newLabel = e.target.value;
      setLabel(newLabel);
      onUpdate(connection.id, { label: newLabel });
    },
    [connection.id, onUpdate]
  );

  // Handle description change
  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const newDescription = e.target.value;
      setDescription(newDescription);
      onUpdate(connection.id, { description: newDescription });
    },
    [connection.id, onUpdate]
  );

  // Handle direction change
  const handleDirectionChange = useCallback(
    (newDirection: ConnectionDirection): void => {
      setDirection(newDirection);
      onUpdate(connection.id, { direction: newDirection });
    },
    [connection.id, onUpdate]
  );

  // Handle context flow change
  const handleContextFlowSelect = useCallback(
    (newContextFlow: ContextFlowType): void => {
      setContextFlow(newContextFlow);
      onUpdate(connection.id, { contextFlow: newContextFlow });
      setSelectOpen(false);
    },
    [connection.id, onUpdate]
  );

  // Handle priority change
  const handlePriorityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newPriority = parseInt(e.target.value, 10);
      setPriority(newPriority);
      onUpdate(connection.id, { priority: newPriority });
    },
    [connection.id, onUpdate]
  );

  // Handle delete
  const handleDelete = useCallback((): void => {
    onDelete(connection.id);
    onClose();
  }, [connection.id, onDelete, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Get current context flow option
  const currentOption = CONTEXT_FLOW_OPTIONS.find((opt) => opt.value === contextFlow);

  // Button style helpers
  const getCloseButtonStyle = (): React.CSSProperties => ({
    ...styles.closeButton,
    ...(hoveredButton === 'close' ? styles.closeButtonHover : {}),
    ...(pressedButton === 'close' ? styles.closeButtonActive : {}),
  });

  const getOptionButtonStyle = (id: string, isActive: boolean): React.CSSProperties => ({
    ...styles.optionButton,
    ...(isActive ? styles.optionButtonActive : {}),
    ...(hoveredButton === id && !isActive ? styles.optionButtonHover : {}),
    ...(pressedButton === id ? styles.optionButtonPressed : {}),
  });

  const getDeleteButtonStyle = (): React.CSSProperties => ({
    ...styles.deleteButton,
    ...(hoveredButton === 'delete' ? styles.deleteButtonHover : {}),
    ...(pressedButton === 'delete' ? styles.deleteButtonActive : {}),
  });

  const getSelectTriggerStyle = (): React.CSSProperties => ({
    ...styles.selectTrigger,
    ...(hoveredButton === 'select' ? styles.selectTriggerHover : {}),
    ...(selectOpen ? styles.selectTriggerOpen : {}),
  });

  const getSelectOptionStyle = (value: string): React.CSSProperties => ({
    ...styles.selectOption,
    ...(contextFlow === value ? styles.selectOptionSelected : {}),
    ...(hoveredOption === value && contextFlow !== value ? styles.selectOptionHover : {}),
  });

  // Calculate dynamic right position based on sidebar state
  const rightPosition = isSidebarCollapsed ? FLOATING_GAP : sidebarVisualWidth + FLOATING_GAP + 8;

  return (
    <div style={{ ...styles.overlay, right: rightPosition, transition: `right 280ms ${EASE_OUT}` }}>
      <style>{sliderStyles}</style>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Connection Properties</span>
        <button
          style={getCloseButtonStyle()}
          onClick={onClose}
          onMouseEnter={(): void => {
            setHoveredButton('close');
          }}
          onMouseLeave={(): void => {
            setHoveredButton(null);
            setPressedButton(null);
          }}
          onMouseDown={(): void => {
            setPressedButton('close');
          }}
          onMouseUp={(): void => {
            setPressedButton(null);
          }}
          title="Close (Escape)"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Basic Info Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>basic info</div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Label</label>
            <input
              style={{
                ...styles.input,
                ...(focusedInput === 'label' ? styles.inputFocus : {}),
              }}
              type="text"
              value={label}
              onChange={handleLabelChange}
              onFocus={(): void => {
                setFocusedInput('label');
              }}
              onBlur={(): void => {
                setFocusedInput(null);
              }}
              placeholder="e.g., leads to, depends on, relates to"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              style={{
                ...styles.textarea,
                ...(focusedInput === 'description' ? styles.inputFocus : {}),
              }}
              value={description}
              onChange={handleDescriptionChange}
              onFocus={(): void => {
                setFocusedInput('description');
              }}
              onBlur={(): void => {
                setFocusedInput(null);
              }}
              placeholder="Optional: Describe the relationship between these cards..."
            />
          </div>
        </div>

        {/* Direction Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>direction</div>
          <div style={styles.buttonGroup}>
            <button
              style={getOptionButtonStyle('unidirectional', direction === 'unidirectional')}
              onClick={(): void => {
                handleDirectionChange('unidirectional');
              }}
              onMouseEnter={(): void => {
                setHoveredButton('unidirectional');
              }}
              onMouseLeave={(): void => {
                setHoveredButton(null);
                setPressedButton(null);
              }}
              onMouseDown={(): void => {
                setPressedButton('unidirectional');
              }}
              onMouseUp={(): void => {
                setPressedButton(null);
              }}
            >
              <ArrowRightIcon />
              <span>One-way</span>
            </button>
            <button
              style={getOptionButtonStyle('bidirectional', direction === 'bidirectional')}
              onClick={(): void => {
                handleDirectionChange('bidirectional');
              }}
              onMouseEnter={(): void => {
                setHoveredButton('bidirectional');
              }}
              onMouseLeave={(): void => {
                setHoveredButton(null);
                setPressedButton(null);
              }}
              onMouseDown={(): void => {
                setPressedButton('bidirectional');
              }}
              onMouseUp={(): void => {
                setPressedButton(null);
              }}
            >
              <ArrowBothIcon />
              <span>Both</span>
            </button>
          </div>
        </div>

        {/* AI Context Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>ai context flow</div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Context Type</label>
            <Popover.Root open={selectOpen} onOpenChange={setSelectOpen}>
              <Popover.Trigger asChild>
                <button
                  style={getSelectTriggerStyle()}
                  onMouseEnter={(): void => {
                    setHoveredButton('select');
                  }}
                  onMouseLeave={(): void => {
                    setHoveredButton(null);
                  }}
                >
                  <span>{currentOption?.label ?? 'Select...'}</span>
                  <span style={styles.selectChevron}>
                    <ChevronDownIcon />
                  </span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content style={styles.popoverContent} align="start" sideOffset={4}>
                  {CONTEXT_FLOW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      style={getSelectOptionStyle(option.value)}
                      onClick={(): void => {
                        handleContextFlowSelect(option.value);
                      }}
                      onMouseEnter={(): void => {
                        setHoveredOption(option.value);
                      }}
                      onMouseLeave={(): void => {
                        setHoveredOption(null);
                      }}
                    >
                      <span>{option.label}</span>
                      {contextFlow === option.value && <CheckIcon />}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <div style={styles.contextFlowDescription}>{currentOption?.description ?? ''}</div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Priority ({priority})</label>
            <input
              className="connection-slider"
              style={styles.prioritySlider}
              type="range"
              min="1"
              max="10"
              value={priority}
              onChange={handlePriorityChange}
            />
            <div style={styles.priorityLabels}>
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          style={getDeleteButtonStyle()}
          onClick={handleDelete}
          onMouseEnter={(): void => {
            setHoveredButton('delete');
          }}
          onMouseLeave={(): void => {
            setHoveredButton(null);
            setPressedButton(null);
          }}
          onMouseDown={(): void => {
            setPressedButton('delete');
          }}
          onMouseUp={(): void => {
            setPressedButton(null);
          }}
        >
          <TrashIcon />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
}
