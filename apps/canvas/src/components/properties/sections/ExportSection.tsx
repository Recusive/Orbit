/**
 * ExportSection
 *
 * Export properties section containing:
 * - Export format options (PNG, JPG, SVG, PDF)
 * - Scale/resolution options
 * - Export presets
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/designTokens';
import { NumberInput } from '../inputs/NumberInput';
import { AddRemoveControls } from '../shared/AddRemoveControls';
import { CollapsibleSection } from '../shared/CollapsibleSection';

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf';

export interface ExportSetting {
  id: string;
  format: ExportFormat;
  scale: number;
  suffix?: string;
}

export interface ExportSectionProps {
  exports: ExportSetting[];
  onExportsChange: (exports: ExportSetting[]) => void;
  onExport?: (settings: ExportSetting[]) => void;
  disabled?: boolean;
}

// Icons
const ExportIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  exportItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  scaleInput: {
    width: 60,
  },
  suffixInput: {
    flex: 1,
    height: 28,
    padding: `0 ${String(spacing.sm)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  formatSelect: {
    height: 28,
    padding: `0 ${String(spacing.sm)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    height: 36,
    padding: `0 ${String(spacing.lg)}px`,
    border: 'none',
    borderRadius: radii.md,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  emptyState: {
    padding: spacing.lg,
    textAlign: 'center' as const,
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
};

const formatOptions: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'svg', label: 'SVG' },
  { value: 'pdf', label: 'PDF' },
];

const defaultExport: Omit<ExportSetting, 'id'> = {
  format: 'png',
  scale: 1,
  suffix: '',
};

function generateId(): string {
  return `export-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ExportSection({
  exports,
  onExportsChange,
  onExport,
  disabled = false,
}: ExportSectionProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  // Add new export
  const handleAddExport = useCallback(() => {
    onExportsChange([...exports, { ...defaultExport, id: generateId() }]);
  }, [exports, onExportsChange]);

  // Remove export
  const handleRemoveExport = useCallback(
    (id: string) => {
      onExportsChange(exports.filter((e) => e.id !== id));
    },
    [exports, onExportsChange]
  );

  // Update export
  const updateExport = useCallback(
    (id: string, updates: Partial<ExportSetting>) => {
      const newExports = exports.map((e) => (e.id === id ? { ...e, ...updates } : e));
      onExportsChange(newExports);
    },
    [exports, onExportsChange]
  );

  // Handle export click
  const handleExport = useCallback(() => {
    if (onExport && exports.length > 0) {
      onExport(exports);
    }
  }, [onExport, exports]);

  // Preview for collapsed state
  const previewContent =
    exports.length > 0 ? (
      <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
        {exports.length} preset{exports.length !== 1 ? 's' : ''}
      </span>
    ) : undefined;

  return (
    <CollapsibleSection
      title="Export"
      sectionId="export"
      icon={<ExportIcon />}
      defaultOpen={false}
      showAddButton
      onAdd={handleAddExport}
      preview={previewContent}
    >
      <div style={styles.content}>
        {exports.length === 0 ? (
          <div style={styles.emptyState}>No export presets. Click + to add one.</div>
        ) : (
          <>
            {exports.map((exportSetting) => (
              <div key={exportSetting.id} style={styles.exportItem}>
                {/* Scale */}
                <div style={styles.scaleInput}>
                  <NumberInput
                    value={exportSetting.scale}
                    onChange={(scale) => {
                      updateExport(exportSetting.id, { scale });
                    }}
                    min={0.5}
                    max={4}
                    step={0.5}
                    precision={1}
                    unit="x"
                    disabled={disabled}
                  />
                </div>

                {/* Format */}
                <select
                  value={exportSetting.format}
                  onChange={(e) => {
                    updateExport(exportSetting.id, { format: e.target.value as ExportFormat });
                  }}
                  disabled={disabled}
                  style={styles.formatSelect}
                >
                  {formatOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Suffix */}
                <input
                  type="text"
                  value={exportSetting.suffix ?? ''}
                  onChange={(e) => {
                    updateExport(exportSetting.id, { suffix: e.target.value });
                  }}
                  placeholder="suffix"
                  disabled={disabled}
                  style={styles.suffixInput}
                />

                {/* Remove */}
                <AddRemoveControls
                  onRemove={() => {
                    handleRemoveExport(exportSetting.id);
                  }}
                  canRemove={!disabled}
                  compact
                />
              </div>
            ))}

            {/* Export button */}
            {onExport ? (
              <button
                style={{
                  ...styles.exportButton,
                  backgroundColor: isHovered ? 'var(--primary-hover)' : 'var(--primary)',
                }}
                onClick={handleExport}
                onMouseEnter={() => {
                  setIsHovered(true);
                }}
                onMouseLeave={() => {
                  setIsHovered(false);
                }}
                disabled={disabled || exports.length === 0}
              >
                <ExportIcon />
                <span>Export</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default ExportSection;
