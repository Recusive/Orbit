/**
 * PropertiesPanel - CSS Property Editor
 *
 * Provides UI controls for editing CSS properties.
 * Changes are reflected live in the component preview via CSS injection (temporary).
 * Users can save customized components to their project's .orbit folder.
 *
 * Features:
 * - Live CSS overrides for instant preview (temporary, not persisted)
 * - "Save to Project" exports customized component to <project>/.orbit/
 * - Base shadcn components remain untouched
 */
import {
  getPropertiesByCategory,
  useCSSCustomizationStore,
  useDebouncedCSSUpdate,
  useHasChanges,
} from '@canvas/stores/css-customization-store';
import { useDesignTokensStore } from '@canvas/stores/design-tokens-store';
import { invoke } from '@tauri-apps/api/core';
import { Copy, Download, FolderOpen, Loader2, RotateCcw, Save, Type } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CSSCategory, CSSProperty } from '@canvas/stores/css-customization-store';
import type { FC, ReactNode } from 'react';

// ============================================
// Property Input Components
// ============================================

interface PropertyInputProps {
  readonly property: CSSProperty;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onImmediateChange?: (value: string) => void;
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
      className="h-8 w-8 cursor-pointer rounded border border-border disabled:cursor-not-allowed disabled:opacity-50"
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
      className="h-8 flex-1 rounded border border-border bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
        className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      />
      <div className="flex min-w-[60px] items-center gap-1">
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
          className="h-7 w-12 rounded border border-border bg-muted/50 px-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
    className="h-8 w-full cursor-pointer rounded border border-border bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
        className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
        className="h-7 w-16 rounded border border-border bg-muted/50 px-2 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
  readonly disabled?: boolean | undefined;
  readonly onDebouncedChange?: ((property: string, value: string) => void) | undefined;
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
            className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
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
            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
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
  readonly disabled?: boolean;
  readonly onDebouncedChange?: (property: string, value: string) => void;
  readonly onImmediateChange?: (property: string, value: string) => void;
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
            disabled={disabled ?? false}
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
  readonly selectedComponentName: string | null;
  readonly componentType?: 'ui' | 'custom';
}

export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  selectedComponentName,
  componentType = 'ui',
}) => {
  const hasChanges = useHasChanges();
  const overrides = useCSSCustomizationStore((state) => state.overrides);
  const resetAll = useCSSCustomizationStore((state) => state.resetAll);
  const saveToken = useDesignTokensStore((state) => state.saveToken);
  const exportForAI = useDesignTokensStore((state) => state.exportForAI);

  // Debounced CSS updates for sliders
  const { setDebounced, setImmediate } = useDebouncedCSSUpdate();

  // Track previous component to reset overrides on switch
  const prevComponentRef = useRef<string | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset overrides when switching to a different component
  useEffect(() => {
    if (prevComponentRef.current !== null && prevComponentRef.current !== selectedComponentName) {
      resetAll();
    }
    prevComponentRef.current = selectedComponentName;
  }, [selectedComponentName, resetAll]);

  /**
   * Save the customized component to the current project's .orbit folder
   */
  const handleSaveToProject = useCallback(async (): Promise<void> => {
    if (!selectedComponentName || Object.keys(overrides).length === 0) return;

    setIsSaving(true);
    try {
      // Get the current workspace/project path
      const workspacePath = await invoke<string | null>('get_workspace_path');
      if (!workspacePath) {
        setCopyFeedback('No project open');
        setTimeout(() => {
          setCopyFeedback(null);
        }, 2000);
        return;
      }

      // Export to <project>/.orbit/components/ui/
      const destDir = `${workspacePath}/.orbit/components/ui`;

      // Save a custom component with the styles applied
      const saveInput = {
        name: selectedComponentName,
        sourceName: selectedComponentName,
        sourceType: componentType,
        styles: Object.fromEntries(
          Object.entries(overrides).map(([key, value]) => [
            key.replace(/([A-Z])/g, '-$1').toLowerCase(),
            value,
          ])
        ),
        props: {},
      };

      const saveResult = await invoke<{ success: boolean; path?: string; error?: string }>(
        'canvas_save_custom_component',
        { input: saveInput }
      );

      if (!saveResult.success) {
        setCopyFeedback(saveResult.error ?? 'Save failed');
        setTimeout(() => {
          setCopyFeedback(null);
        }, 3000);
        return;
      }

      // Export that custom component to the project
      const exportResult = await invoke<{ success: boolean; path?: string; error?: string }>(
        'canvas_export_component',
        {
          componentName: selectedComponentName,
          componentType: 'custom',
          destinationDir: destDir,
        }
      );

      if (exportResult.success) {
        setCopyFeedback('Saved to project!');
        resetAll();
      } else {
        setCopyFeedback(exportResult.error ?? 'Export failed');
      }
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
    } catch {
      setCopyFeedback('Error saving');
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
    } finally {
      setIsSaving(false);
    }
  }, [selectedComponentName, componentType, overrides, resetAll]);

  const handleSaveToken = (): void => {
    if (!tokenName.trim() || !selectedComponentName) return;
    saveToken(tokenName.trim(), selectedComponentName, overrides);
    setTokenName('');
    setShowSaveDialog(false);
    setCopyFeedback('Saved!');
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  const handleCopyForAI = (): void => {
    if (!selectedComponentName) return;
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

  // No component selected
  if (!selectedComponentName) {
    return (
      <div className="p-3">
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Type className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-xs">Select a component to edit its properties</p>
        </div>
      </div>
    );
  }

  const displayName = selectedComponentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="space-y-4 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{displayName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Edit CSS properties • Changes preview live
          </p>
        </div>
        {hasChanges ? (
          <button
            onClick={resetAll}
            disabled={isSaving}
            className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Save to Project Button */}
      {hasChanges ? (
        <button
          onClick={() => void handleSaveToProject()}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <FolderOpen className="h-3.5 w-3.5" />
              Save to Project
            </>
          )}
        </button>
      ) : null}

      {/* Feedback */}
      {copyFeedback ? (
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center text-xs text-green-500">
          {copyFeedback}
        </div>
      ) : null}

      {/* Export Actions */}
      {hasChanges ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowSaveDialog(true);
            }}
            disabled={isSaving}
            className="flex items-center gap-1 rounded bg-muted px-2 py-1.5 text-xs transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          >
            <Save className="h-3 w-3" aria-hidden="true" />
            Save Token
          </button>
          <button
            onClick={handleCopyCSS}
            disabled={isSaving}
            className="flex items-center gap-1 rounded bg-muted px-2 py-1.5 text-xs transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            Copy CSS
          </button>
          <button
            onClick={handleCopyForAI}
            disabled={isSaving}
            className="flex items-center gap-1 rounded bg-muted px-2 py-1.5 text-xs transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            For AI
          </button>
        </div>
      ) : null}

      {/* Save Token Dialog */}
      {showSaveDialog ? (
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <label htmlFor="token-name-input" className="mb-1.5 block text-xs text-muted-foreground">
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
            className="mb-2 h-8 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveToken();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
            autoFocus
            disabled={isSaving}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveToken}
              disabled={!tokenName.trim() || isSaving}
              className="flex-1 rounded bg-primary px-2 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
              }}
              className="rounded bg-muted px-2 py-1.5 text-xs transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
          disabled={isSaving}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
        <CategorySection
          category="colors"
          label="Colors"
          icon={
            <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          }
          disabled={isSaving}
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
          disabled={isSaving}
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
          disabled={isSaving}
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
          disabled={isSaving}
          onDebouncedChange={setDebounced}
          onImmediateChange={setImmediate}
        />
      </div>
    </div>
  );
};
