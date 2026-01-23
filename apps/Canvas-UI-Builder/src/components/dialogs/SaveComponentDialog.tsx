/**
 * SaveComponentDialog - Dialog for saving customized components
 *
 * Provides two modes:
 * - Save as Custom: Create a wrapper component in ~/.orbit/canvas/components/custom/
 * - Export to Project: Copy component files to a user-selected directory
 */
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, Save } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

type SaveMode = 'custom' | 'export';

export interface SaveComponentDialogProps {
  /** Whether the dialog is open */
  readonly open: boolean;
  /** Callback when open state changes */
  readonly onOpenChange: (open: boolean) => void;
  /** Name of the source component (e.g., 'button') */
  readonly componentName: string;
  /** Type of the source component */
  readonly componentType: 'ui' | 'custom';
  /** CSS style overrides applied to the component */
  readonly styles: Record<string, string>;
  /** Additional props for the component */
  readonly props: Record<string, unknown>;
  /** Callback when save/export completes successfully */
  readonly onSaved: () => void;
}

interface SaveResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

// ============================================
// Mode Toggle Button
// ============================================

interface ModeButtonProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly description: string;
}

const ModeButton: FC<ModeButtonProps> = ({ active, onClick, icon, label, description }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      active
        ? 'border-primary bg-primary/5 text-foreground'
        : 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:bg-primary/5'
    )}
  >
    <span
      className={cn('p-2 rounded-full', active ? 'bg-primary/10' : 'bg-muted')}
      aria-hidden="true"
    >
      {icon}
    </span>
    <span className="font-medium text-sm">{label}</span>
    <span className="text-xs text-muted-foreground text-center">{description}</span>
  </button>
);

// ============================================
// Main Component
// ============================================

export const SaveComponentDialog: FC<SaveComponentDialogProps> = ({
  open,
  onOpenChange,
  componentName,
  componentType,
  styles,
  props,
  onSaved,
}) => {
  const [mode, setMode] = useState<SaveMode>('custom');
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format component name for display
  const displayName = componentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen) {
      setCustomName('');
      setError(null);
      setMode('custom');
    }
    onOpenChange(isOpen);
  };

  // Save as custom component
  const handleSaveAsCustom = async (): Promise<void> => {
    const trimmedName = customName.trim();
    if (!trimmedName) {
      setError('Please enter a component name');
      return;
    }

    // Validate name format (lowercase, hyphens, no spaces)
    const normalizedName = trimmedName.toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z][a-z0-9-]*$/.test(normalizedName)) {
      setError(
        'Name must start with a letter and contain only lowercase letters, numbers, and hyphens'
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await invoke<SaveResult>('canvas_save_custom_component', {
        input: {
          name: normalizedName,
          sourceName: componentName,
          sourceType: componentType,
          styles,
          props,
        },
      });

      if (result.success) {
        onSaved();
        handleOpenChange(false);
      } else {
        setError(result.error ?? 'Failed to save component');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Export to project directory
  const handleExport = async (): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select export destination',
      });

      if (!selected) {
        // User cancelled
        setSaving(false);
        return;
      }

      const result = await invoke<SaveResult>('canvas_export_component', {
        componentName,
        componentType,
        destinationDir: selected,
      });

      if (result.success) {
        onSaved();
        handleOpenChange(false);
      } else {
        setError(result.error ?? 'Failed to export component');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            Save Component
          </DialogTitle>
          <DialogDescription>Save your customized {displayName} component</DialogDescription>
        </DialogHeader>

        {/* Mode Selection */}
        <div className="flex gap-3 py-4">
          <ModeButton
            active={mode === 'custom'}
            onClick={() => {
              setMode('custom');
            }}
            icon={<Download className="h-5 w-5" />}
            label="Save as Custom"
            description="Save to your local library"
          />
          <ModeButton
            active={mode === 'export'}
            onClick={() => {
              setMode('export');
            }}
            icon={<FolderOpen className="h-5 w-5" />}
            label="Export to Project"
            description="Copy to your project folder"
          />
        </div>

        {/* Mode Content */}
        {mode === 'custom' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="component-name" className="text-sm font-medium">
                Component Name
              </label>
              <Input
                id="component-name"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                }}
                placeholder="my-custom-button"
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Will be saved to{' '}
                <code className="bg-muted px-1 rounded">~/.orbit/canvas/components/custom/</code>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export this component to your project. This will copy the component file and the{' '}
              <code className="bg-muted px-1 rounded">utils.ts</code> helper to your chosen
              directory.
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click &quot;Export&quot; to choose a folder
              </span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error ? (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              handleOpenChange(false);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          {mode === 'custom' ? (
            <Button onClick={handleSaveAsCustom} disabled={saving || !customName.trim()}>
              {saving ? 'Saving...' : 'Save Component'}
            </Button>
          ) : (
            <Button onClick={handleExport} disabled={saving}>
              {saving ? 'Exporting...' : 'Export'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
