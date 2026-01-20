/**
 * PropertiesPanel - CSS Property Editor
 *
 * Provides UI controls for editing CSS properties.
 * Changes are reflected live in the component preview.
 * Users can save customizations as design tokens for export.
 *
 * Features:
 * - Live CSS overrides for instant preview
 * - "Apply to Component" persists changes to source via AST transformation
 * - External modification detection with conflict resolution
 * - Undo support via backup restoration
 * - Semantic color detection with global token update option
 */
import { useFileWatcher, useSemanticColors, useStylePersistence } from '@canvas/hooks';
import { getTokenDisplayName, isColorProperty } from '@canvas/lib/semantic-colors';
import {
  getPropertiesByCategory,
  useCSSCustomizationStore,
  useDebouncedCSSUpdate,
  useHasChanges,
} from '@canvas/stores/css-customization-store';
import { useDesignTokensStore } from '@canvas/stores/design-tokens-store';
import {
  AlertTriangle,
  Copy,
  Download,
  FileWarning,
  Globe,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Save,
  Type,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SemanticColorUsage } from '@canvas/lib/semantic-colors';
import type { CSSCategory, CSSProperty } from '@canvas/stores/css-customization-store';
import type { FC, ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================
// Property Input Components
// ============================================

interface PropertyInputProps {
  readonly property: CSSProperty;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called for immediate updates (select, discrete changes) */
  readonly onImmediateChange?: (value: string) => void;
  /** Called for debounced updates (sliders during drag) */
  readonly onDebouncedChange?: (value: string) => void;
  readonly disabled?: boolean;
}

const ColorInput: FC<PropertyInputProps> = ({ property, value, onChange, disabled }) => (
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      aria-label={`${property.label} color picker`}
      className="w-8 h-8 rounded border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
    />
    <input
      type="text"
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      aria-label={`${property.label} color value`}
      autoComplete="off"
      className="flex-1 h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      placeholder={property.defaultValue}
      disabled={disabled}
    />
  </div>
);

const SizeInput: FC<PropertyInputProps> = ({
  property,
  value,
  onChange,
  onDebouncedChange,
  onImmediateChange,
  disabled,
}) => {
  // Use debounced change for slider (rapid updates), immediate for number input (discrete)
  const handleSliderChange = (newValue: string): void => {
    if (onDebouncedChange) {
      onDebouncedChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  const handleInputChange = (newValue: string): void => {
    if (onImmediateChange) {
      onImmediateChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={property.min ?? 0}
        max={property.max ?? 100}
        step={property.step ?? 1}
        value={value || property.defaultValue}
        onChange={(e) => {
          handleSliderChange(e.target.value);
        }}
        aria-label={`${property.label} slider`}
        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
      />
      <div className="flex items-center gap-1 min-w-[60px]">
        <input
          type="number"
          min={property.min}
          max={property.max}
          step={property.step}
          value={value || property.defaultValue}
          onChange={(e) => {
            handleInputChange(e.target.value);
          }}
          aria-label={`${property.label} value`}
          autoComplete="off"
          className="w-12 h-7 px-1 text-xs text-center bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        />
        {property.unit ? (
          <span className="text-xs text-muted-foreground">{property.unit}</span>
        ) : null}
      </div>
    </div>
  );
};

const SelectInput: FC<PropertyInputProps> = ({ property, value, onChange, disabled }) => (
  <select
    value={value || property.defaultValue}
    onChange={(e) => {
      onChange(e.target.value);
    }}
    aria-label={property.label}
    className="w-full h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={disabled}
  >
    {property.options?.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
);

const NumberInput: FC<PropertyInputProps> = ({
  property,
  value,
  onChange,
  onDebouncedChange,
  onImmediateChange,
  disabled,
}) => {
  // Use debounced change for slider (rapid updates), immediate for number input
  const handleSliderChange = (newValue: string): void => {
    if (onDebouncedChange) {
      onDebouncedChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  const handleInputChange = (newValue: string): void => {
    if (onImmediateChange) {
      onImmediateChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={property.min ?? 0}
        max={property.max ?? 100}
        step={property.step ?? 1}
        value={value || property.defaultValue}
        onChange={(e) => {
          handleSliderChange(e.target.value);
        }}
        aria-label={`${property.label} slider`}
        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
      />
      <input
        type="number"
        min={property.min}
        max={property.max}
        step={property.step}
        value={value || property.defaultValue}
        onChange={(e) => {
          handleInputChange(e.target.value);
        }}
        aria-label={`${property.label} value`}
        autoComplete="off"
        className="w-16 h-7 px-2 text-xs text-center bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
      />
    </div>
  );
};

// ============================================
// Property Row
// ============================================

interface PropertyRowProps {
  readonly property: CSSProperty;
  /** Whether inputs should be disabled (e.g., during persist) */
  readonly disabled?: boolean | undefined;
  /** Debounced change handler for sliders */
  readonly onDebouncedChange?: ((property: string, value: string) => void) | undefined;
  /** Immediate change handler for discrete inputs */
  readonly onImmediateChange?: ((property: string, value: string) => void) | undefined;
}

const PropertyRow: FC<PropertyRowProps> = ({
  property,
  disabled = false,
  onDebouncedChange,
  onImmediateChange,
}) => {
  const overrides = useCSSCustomizationStore((state) => state.overrides);
  const setProperty = useCSSCustomizationStore((state) => state.setProperty);
  const resetProperty = useCSSCustomizationStore((state) => state.resetProperty);

  const value = overrides[property.name] ?? '';
  const hasOverride = property.name in overrides;

  const handleChange = (newValue: string): void => {
    setProperty(property.name, newValue);
  };

  const handleDebouncedChange = (newValue: string): void => {
    if (onDebouncedChange) {
      onDebouncedChange(property.name, newValue);
    } else {
      setProperty(property.name, newValue);
    }
  };

  const handleImmediateChange = (newValue: string): void => {
    if (onImmediateChange) {
      onImmediateChange(property.name, newValue);
    } else {
      setProperty(property.name, newValue);
    }
  };

  const renderInput = (): ReactNode => {
    const props = {
      property,
      value,
      onChange: handleChange,
      onDebouncedChange: handleDebouncedChange,
      onImmediateChange: handleImmediateChange,
      disabled,
    };

    switch (property.type) {
      case 'color':
        return <ColorInput {...props} />;
      case 'size':
        return <SizeInput {...props} />;
      case 'select':
        return <SelectInput {...props} />;
      case 'number':
        return <NumberInput {...props} />;
      case 'text':
        return (
          <input
            type="text"
            value={value || property.defaultValue}
            onChange={(e) => {
              handleChange(e.target.value);
            }}
            className="w-full h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{property.label}</label>
        {hasOverride ? (
          <button
            onClick={() => {
              resetProperty(property.name);
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
            aria-label={`Reset ${property.label} to default`}
            disabled={disabled}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {renderInput()}
    </div>
  );
};

// ============================================
// Category Section
// ============================================

interface CategorySectionProps {
  readonly category: CSSCategory;
  readonly label: string;
  readonly icon: ReactNode;
  /** Whether inputs should be disabled (e.g., during persist) */
  readonly disabled?: boolean | undefined;
  /** Debounced change handler for sliders */
  readonly onDebouncedChange?: ((property: string, value: string) => void) | undefined;
  /** Immediate change handler for discrete inputs */
  readonly onImmediateChange?: ((property: string, value: string) => void) | undefined;
}

const CategorySection: FC<CategorySectionProps> = ({
  category,
  label,
  icon,
  disabled,
  onDebouncedChange,
  onImmediateChange,
}) => {
  const properties = getPropertiesByCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="space-y-3 pl-1">
        {properties.map((property) => (
          <PropertyRow
            key={property.name}
            property={property}
            disabled={disabled}
            onDebouncedChange={onDebouncedChange}
            onImmediateChange={onImmediateChange}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export interface PropertiesPanelProps {
  /** Name of the selected component (e.g., 'button', 'input') */
  readonly selectedComponentName: string | null;
  /** Type of component - 'ui' for shadcn, 'custom' for user-created */
  readonly componentType?: 'ui' | 'custom';
}

/**
 * State for semantic color conflict dialog
 */
interface SemanticDialogState {
  open: boolean;
  usage: SemanticColorUsage | null;
  pendingValue: string;
}

export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  selectedComponentName,
  componentType = 'ui',
}) => {
  const hasChanges = useHasChanges();
  const overrides = useCSSCustomizationStore((state) => state.overrides);
  const resetAll = useCSSCustomizationStore((state) => state.resetAll);
  const canUndo = useCSSCustomizationStore((state) => state.canUndo);
  const saveToken = useDesignTokensStore((state) => state.saveToken);
  const exportForAI = useDesignTokensStore((state) => state.exportForAI);

  // Style persistence hook
  const {
    isPersisting,
    persistState,
    lastResult,
    error: persistError,
    hmrFailed,
    persistStyles,
    restoreBackup,
    updateDesignToken,
  } = useStylePersistence();

  // Semantic colors detection hook
  const { checkProperty } = useSemanticColors({
    componentName: selectedComponentName,
    componentType,
    enabled: Boolean(selectedComponentName),
  });

  // Semantic color dialog state
  const [semanticDialog, setSemanticDialog] = useState<SemanticDialogState>({
    open: false,
    usage: null,
    pendingValue: '',
  });

  // File watcher for external modifications
  const { externallyModified, acknowledgeChange, refreshHash, isWatching } = useFileWatcher({
    componentName: selectedComponentName ?? '',
    componentType,
    enabled: Boolean(selectedComponentName),
  });

  // Debounced CSS updates for sliders
  const { setDebounced, setImmediate } = useDebouncedCSSUpdate();

  // Auto-apply debounce timer ref
  const autoApplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOverridesRef = useRef<string>('');

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  /**
   * Check if any changed color properties use semantic tokens
   */
  const findSemanticColorConflict = useCallback((): {
    usage: SemanticColorUsage;
    value: string;
  } | null => {
    for (const [property, value] of Object.entries(overrides)) {
      if (isColorProperty(property)) {
        const usage = checkProperty(property);
        if (usage) {
          return { usage, value };
        }
      }
    }
    return null;
  }, [overrides, checkProperty]);

  /**
   * Apply changes to this component only (replace semantic class with arbitrary color)
   */
  const applyComponentOnly = useCallback(async (): Promise<void> => {
    if (!selectedComponentName) return;
    setSemanticDialog({ open: false, usage: null, pendingValue: '' });
    const success = await persistStyles(selectedComponentName, componentType);
    if (success) {
      setCopyFeedback('Applied!');
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
      // Refresh the hash after our own write
      void refreshHash();
    }
  }, [selectedComponentName, componentType, persistStyles, refreshHash]);

  /**
   * Apply styles to component, checking for semantic color conflicts first
   */
  const handleApplyToComponent = useCallback(async (): Promise<void> => {
    // Check for semantic color conflicts
    const conflict = findSemanticColorConflict();
    if (conflict) {
      // Show dialog to let user choose
      setSemanticDialog({
        open: true,
        usage: conflict.usage,
        pendingValue: conflict.value,
      });
      return;
    }

    // No conflicts, proceed with normal persist
    await applyComponentOnly();
  }, [findSemanticColorConflict, applyComponentOnly]);

  /**
   * Auto-apply effect: watches for changes and persists after 800ms of inactivity.
   * This provides a smooth "auto-save" experience without requiring manual button clicks.
   */
  useEffect(() => {
    // Skip if no component selected or already persisting
    if (!selectedComponentName || isPersisting) return;

    // Serialize overrides for comparison
    const currentOverrides = JSON.stringify(overrides);

    // Skip if nothing changed
    if (currentOverrides === lastOverridesRef.current) return;
    lastOverridesRef.current = currentOverrides;

    // Skip if no overrides to persist
    if (Object.keys(overrides).length === 0) return;

    // Clear previous timer
    if (autoApplyTimeoutRef.current) {
      clearTimeout(autoApplyTimeoutRef.current);
    }

    // Set new timer - 800ms debounce for auto-apply
    autoApplyTimeoutRef.current = setTimeout(() => {
      void handleApplyToComponent();
    }, 800);

    // Cleanup on unmount or re-trigger
    return () => {
      if (autoApplyTimeoutRef.current) {
        clearTimeout(autoApplyTimeoutRef.current);
      }
    };
  }, [overrides, selectedComponentName, isPersisting, handleApplyToComponent]);

  // No component selected - early return AFTER all hooks
  if (!selectedComponentName) {
    return (
      <div className="p-3">
        <div className="text-sm text-muted-foreground text-center py-8">
          <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Select a component to edit its properties</p>
        </div>
      </div>
    );
  }

  // Format component name for display
  const displayName = selectedComponentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const handleSaveToken = (): void => {
    if (!tokenName.trim()) return;
    saveToken(tokenName.trim(), selectedComponentName, overrides);
    setTokenName('');
    setShowSaveDialog(false);
    setCopyFeedback('Saved!');
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  const handleCopyForAI = (): void => {
    const aiExport = exportForAI(selectedComponentName);
    void navigator.clipboard.writeText(aiExport);
    setCopyFeedback('Copied for AI!');
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  const handleCopyCSS = (): void => {
    const cssLines = Object.entries(overrides)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`)
      .join('\n');
    void navigator.clipboard.writeText(cssLines);
    setCopyFeedback('CSS Copied!');
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  /**
   * Update the global design token instead of just this component
   */
  const applyTokenGlobally = async (): Promise<void> => {
    if (!semanticDialog.usage) return;

    const tokenName = semanticDialog.usage.semanticToken;
    const newValue = semanticDialog.pendingValue;

    setSemanticDialog({ open: false, usage: null, pendingValue: '' });

    const success = await updateDesignToken(tokenName, newValue);
    if (success) {
      setCopyFeedback('Token Updated!');
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
    }
  };

  /**
   * Close the semantic dialog without taking action
   */
  const cancelSemanticDialog = (): void => {
    setSemanticDialog({ open: false, usage: null, pendingValue: '' });
  };

  const handleUndo = async (): Promise<void> => {
    const success = await restoreBackup(selectedComponentName, componentType);
    if (success) {
      setCopyFeedback('Restored!');
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
    }
  };

  const handleReloadAndDiscard = async (): Promise<void> => {
    // Refresh hash to get latest file state
    await refreshHash();
    // Clear local overrides since we're discarding them
    resetAll();
    acknowledgeChange();
  };

  // Derive disabled state from persistence operation
  const inputsDisabled = isPersisting;

  return (
    <div className="p-3 space-y-4">
      {/* External Modification Warning */}
      {externallyModified ? (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                File Modified Externally
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This component was modified outside the Canvas UI Builder.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    void handleReloadAndDiscard();
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 rounded transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Reload & Discard
                </button>
                <button
                  onClick={acknowledgeChange}
                  className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
                >
                  Keep My Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Persist Error Display */}
      {persistError ? (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-start gap-2">
            <FileWarning className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-destructive">Failed to Apply Changes</p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{persistError}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* HMR Warning (file saved but HMR failed) */}
      {hmrFailed ? (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            Changes saved but preview may not reflect updates. Try refreshing.
          </p>
        </div>
      ) : null}

      {/* Transform Warnings */}
      {lastResult?.warnings && lastResult.warnings.length > 0 ? (
        <div className="p-2.5 bg-muted/50 border border-border rounded-lg">
          <p className="text-xs font-medium text-muted-foreground mb-1">Transform Warnings:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {lastResult.warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-1">
                <span className="text-amber-500">•</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit CSS properties
            {isWatching ? (
              <span className="ml-1.5 text-green-500" title="Watching for external changes">
                •
              </span>
            ) : null}
          </p>
        </div>
        {hasChanges ? (
          <button
            onClick={resetAll}
            disabled={inputsDisabled}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Auto-save Status Indicator */}
      {hasChanges || isPersisting ? (
        <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-md">
          <span className="text-xs text-muted-foreground">
            {isPersisting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                {persistState === 'validating' && 'Validating...'}
                {persistState === 'reading' && 'Reading...'}
                {persistState === 'transforming' && 'Saving...'}
                {persistState === 'writing' && 'Writing...'}
                {persistState === 'waiting_hmr' && 'Updating preview...'}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground/70">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Auto-saving in 800ms...
              </span>
            )}
          </span>
          {copyFeedback ? <span className="text-xs text-green-500">{copyFeedback}</span> : null}
        </div>
      ) : null}

      {/* Undo Button */}
      {canUndo() ? (
        <button
          onClick={() => {
            void handleUndo();
          }}
          disabled={isPersisting}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 disabled:opacity-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <Undo2 className="h-3 w-3" />
          Undo Last Apply
        </button>
      ) : null}

      {/* Export Actions */}
      {hasChanges ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowSaveDialog(true);
            }}
            disabled={inputsDisabled}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 disabled:opacity-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <Save className="h-3 w-3" aria-hidden="true" />
            Save Token
          </button>
          <button
            onClick={handleCopyCSS}
            disabled={inputsDisabled}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 disabled:opacity-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            Copy CSS
          </button>
          <button
            onClick={handleCopyForAI}
            disabled={inputsDisabled}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 disabled:opacity-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            For AI
          </button>
        </div>
      ) : null}

      {/* Save Token Dialog */}
      {showSaveDialog ? (
        <div className="p-3 bg-muted/50 rounded-lg border border-border">
          <label htmlFor="token-name-input" className="text-xs text-muted-foreground block mb-1.5">
            Token Name
          </label>
          <input
            id="token-name-input"
            type="text"
            value={tokenName}
            onChange={(e) => {
              setTokenName(e.target.value);
            }}
            placeholder="e.g., Primary Button"
            autoComplete="off"
            className="w-full h-8 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary mb-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveToken();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
            autoFocus
            disabled={inputsDisabled}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveToken}
              disabled={!tokenName.trim() || inputsDisabled}
              className="flex-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
              }}
              className="px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Property Categories */}
      <div className="space-y-5">
        <CategorySection
          category="typography"
          label="Typography"
          icon={<Type className="h-3.5 w-3.5" />}
          disabled={inputsDisabled}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
        <CategorySection
          category="colors"
          label="Colors"
          icon={
            <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          }
          disabled={inputsDisabled}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
        <CategorySection
          category="spacing"
          label="Spacing"
          icon={
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
          }
          disabled={inputsDisabled}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
        <CategorySection
          category="border"
          label="Border"
          icon={
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          }
          disabled={inputsDisabled}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
        <CategorySection
          category="effects"
          label="Effects"
          icon={
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          }
          disabled={inputsDisabled}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
      </div>

      {/* Semantic Color Conflict Dialog */}
      <AlertDialog
        open={semanticDialog.open}
        onOpenChange={(open) => {
          if (!open) cancelSemanticDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Paintbrush className="h-5 w-5 text-primary" />
              Semantic Color Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This component uses the{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {semanticDialog.usage?.className}
                </code>{' '}
                class, which is tied to the{' '}
                <strong>
                  {semanticDialog.usage
                    ? getTokenDisplayName(semanticDialog.usage.semanticToken)
                    : ''}
                </strong>{' '}
                design token.
              </p>
              <p>How would you like to apply this color change?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={() => {
                void applyTokenGlobally();
              }}
              className="w-full justify-start gap-2"
            >
              <Globe className="h-4 w-4" />
              Update token globally
              <span className="ml-auto text-xs text-primary-foreground/70">
                (affects all components)
              </span>
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                void applyComponentOnly();
              }}
              className="w-full justify-start gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <Paintbrush className="h-4 w-4" />
              This component only
              <span className="ml-auto text-xs text-muted-foreground">
                (replaces semantic class)
              </span>
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
