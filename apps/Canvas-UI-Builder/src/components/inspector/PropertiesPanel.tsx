/**
 * PropertiesPanel - CSS Property Editor
 *
 * Provides UI controls for editing CSS properties.
 * Changes are reflected live in the component preview.
 * Users can save customizations as design tokens for export.
 */
import {
  getPropertiesByCategory,
  useCSSCustomizationStore,
  useHasChanges,
} from '@canvas/stores/css-customization-store';
import { useDesignTokensStore } from '@canvas/stores/design-tokens-store';
import { Copy, Download, RotateCcw, Save, Type } from 'lucide-react';
import { useState } from 'react';

import type { CSSCategory, CSSProperty } from '@canvas/stores/css-customization-store';
import type { FC, ReactNode } from 'react';

// ============================================
// Property Input Components
// ============================================

interface PropertyInputProps {
  readonly property: CSSProperty;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

const ColorInput: FC<PropertyInputProps> = ({ property, value, onChange }) => (
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="w-8 h-8 rounded border border-border cursor-pointer"
    />
    <input
      type="text"
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="flex-1 h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      placeholder={property.defaultValue}
    />
  </div>
);

const SizeInput: FC<PropertyInputProps> = ({ property, value, onChange }) => (
  <div className="flex items-center gap-2">
    <input
      type="range"
      min={property.min ?? 0}
      max={property.max ?? 100}
      step={property.step ?? 1}
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
    />
    <div className="flex items-center gap-1 min-w-[60px]">
      <input
        type="number"
        min={property.min}
        max={property.max}
        step={property.step}
        value={value || property.defaultValue}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="w-12 h-7 px-1 text-xs text-center bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {property.unit ? (
        <span className="text-xs text-muted-foreground">{property.unit}</span>
      ) : null}
    </div>
  </div>
);

const SelectInput: FC<PropertyInputProps> = ({ property, value, onChange }) => (
  <select
    value={value || property.defaultValue}
    onChange={(e) => {
      onChange(e.target.value);
    }}
    className="w-full h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
  >
    {property.options?.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
);

const NumberInput: FC<PropertyInputProps> = ({ property, value, onChange }) => (
  <div className="flex items-center gap-2">
    <input
      type="range"
      min={property.min ?? 0}
      max={property.max ?? 100}
      step={property.step ?? 1}
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
    />
    <input
      type="number"
      min={property.min}
      max={property.max}
      step={property.step}
      value={value || property.defaultValue}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="w-16 h-7 px-2 text-xs text-center bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
    />
  </div>
);

// ============================================
// Property Row
// ============================================

interface PropertyRowProps {
  readonly property: CSSProperty;
}

const PropertyRow: FC<PropertyRowProps> = ({ property }) => {
  const overrides = useCSSCustomizationStore((state) => state.overrides);
  const setProperty = useCSSCustomizationStore((state) => state.setProperty);
  const resetProperty = useCSSCustomizationStore((state) => state.resetProperty);

  const value = overrides[property.name] ?? '';
  const hasOverride = property.name in overrides;

  const handleChange = (newValue: string): void => {
    setProperty(property.name, newValue);
  };

  const renderInput = (): ReactNode => {
    const props = { property, value, onChange: handleChange };

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
            className="w-full h-8 px-2 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="p-0.5 text-muted-foreground hover:text-foreground rounded"
            title="Reset to default"
          >
            <RotateCcw className="h-3 w-3" />
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
}

const CategorySection: FC<CategorySectionProps> = ({ category, label, icon }) => {
  const properties = getPropertiesByCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="space-y-3 pl-1">
        {properties.map((property) => (
          <PropertyRow key={property.name} property={property} />
        ))}
      </div>
    </div>
  );
};

// ============================================
// Main Component
// ============================================

interface PropertiesPanelProps {
  readonly selectedComponentName: string | null;
}

export const PropertiesPanel: FC<PropertiesPanelProps> = ({ selectedComponentName }) => {
  const hasChanges = useHasChanges();
  const overrides = useCSSCustomizationStore((state) => state.overrides);
  const resetAll = useCSSCustomizationStore((state) => state.resetAll);
  const saveToken = useDesignTokensStore((state) => state.saveToken);
  const exportForAI = useDesignTokensStore((state) => state.exportForAI);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // No component selected
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

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Edit CSS properties</p>
        </div>
        {hasChanges ? (
          <button
            onClick={resetAll}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Export Actions */}
      {hasChanges ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowSaveDialog(true);
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
          >
            <Save className="h-3 w-3" />
            Save Token
          </button>
          <button
            onClick={handleCopyCSS}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
          >
            <Copy className="h-3 w-3" />
            Copy CSS
          </button>
          <button
            onClick={handleCopyForAI}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
          >
            <Download className="h-3 w-3" />
            For AI
          </button>
          {copyFeedback ? (
            <span className="text-xs text-green-500 self-center">{copyFeedback}</span>
          ) : null}
        </div>
      ) : null}

      {/* Save Token Dialog */}
      {showSaveDialog ? (
        <div className="p-3 bg-muted/50 rounded-lg border border-border">
          <label className="text-xs text-muted-foreground block mb-1.5">Token Name</label>
          <input
            type="text"
            value={tokenName}
            onChange={(e) => {
              setTokenName(e.target.value);
            }}
            placeholder="e.g., Primary Button"
            className="w-full h-8 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary mb-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveToken();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveToken}
              disabled={!tokenName.trim()}
              className="flex-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
              }}
              className="px-2 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
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
        />
        <CategorySection
          category="colors"
          label="Colors"
          icon={
            <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          }
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
        />
      </div>
    </div>
  );
};
