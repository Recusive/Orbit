/**
 * Page Properties Panel for Design System Canvas
 *
 * Allows editing page-level settings like layout, background, and viewport.
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../lib/designTokens';
import { VIEWPORT_PRESETS } from '../sandpack/sandpackConfig';
import { LAYOUT_PRESETS } from '../types/pageTypes';

import type { ViewportType } from '../sandpack/sandpackConfig';
import type { PageNodeData, PageLayout, FlexDirection, LayoutPreset } from '../types/pageTypes';

interface PagePropertiesPanelProps {
  pageData: PageNodeData;
  onUpdatePage: (updates: Partial<PageNodeData>) => void;
}

// SVG Icons
const ChevronDownIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ChevronRightIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const LayoutIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const MonitorIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const PaletteIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="13.5" cy="6.5" r=".5"></circle>
    <circle cx="17.5" cy="10.5" r=".5"></circle>
    <circle cx="8.5" cy="7.5" r=".5"></circle>
    <circle cx="6.5" cy="12.5" r=".5"></circle>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"></path>
  </svg>
);

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    overflow: 'hidden',
  },
  header: {
    padding: `${String(spacing.lg)}px ${String(spacing.xl)}px`,
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--foreground)',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.sm)}px 0`,
    cursor: 'pointer',
    color: 'var(--foreground)',
  },
  sectionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    color: 'var(--muted-foreground)',
  },
  sectionTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sectionContent: {
    paddingLeft: spacing.xl,
    paddingTop: spacing.sm,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    display: 'block',
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
    cursor: 'pointer',
  },
  colorInput: {
    width: 32,
    height: 32,
    padding: 0,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm,
  },
  presetButton: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  presetButtonActive: {
    borderColor: 'var(--ring)',
    backgroundColor: 'var(--accent)',
  },
  presetIcon: {
    width: 40,
    height: 30,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: {
    fontSize: fontSize.xs,
    color: 'var(--foreground)',
  },
  row: {
    display: 'flex',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
};

// Layout preset icons
function LayoutPresetIcon({ preset }: { preset: LayoutPreset }): React.JSX.Element {
  switch (preset) {
    case 'single-column':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect x="6" y="2" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'two-column':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect x="2" y="2" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="2" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'sidebar-left':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect
            x="2"
            y="2"
            width="6"
            height="16"
            rx="1"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="10"
            y="2"
            width="12"
            height="16"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'sidebar-right':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect x="2" y="2" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect
            x="16"
            y="2"
            width="6"
            height="16"
            rx="1"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'header-main-footer':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect
            x="2"
            y="2"
            width="20"
            height="4"
            rx="1"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="2" y="8" width="20" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect
            x="2"
            y="16"
            width="20"
            height="2"
            rx="0.5"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      );
    case 'dashboard':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect
            x="2"
            y="2"
            width="6"
            height="16"
            rx="1"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="10"
            y="2"
            width="12"
            height="4"
            rx="1"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="10"
            y="8"
            width="12"
            height="10"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'free-form':
      return (
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <rect x="2" y="2" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="11" y="4" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="4" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="18" y="8" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default:
      return <></>;
  }
}

const PRESET_LABELS: Record<LayoutPreset, string> = {
  'single-column': 'Single Column',
  'two-column': 'Two Column',
  'sidebar-left': 'Sidebar Left',
  'sidebar-right': 'Sidebar Right',
  'header-main-footer': 'Header/Footer',
  dashboard: 'Dashboard',
  'free-form': 'Free Form',
};

export function PagePropertiesPanel({
  pageData,
  onUpdatePage,
}: PagePropertiesPanelProps): React.JSX.Element {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['layout', 'viewport', 'background'])
  );

  const toggleSection = (section: string): void => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleLayoutPreset = useCallback(
    (preset: LayoutPreset) => {
      onUpdatePage({
        layout: { ...LAYOUT_PRESETS[preset] } as PageLayout,
      });
    },
    [onUpdatePage]
  );

  const handleLayoutChange = useCallback(
    (updates: Partial<PageLayout>) => {
      onUpdatePage({
        layout: { ...pageData.layout, ...updates },
      });
    },
    [pageData.layout, onUpdatePage]
  );

  const handleViewportChange = useCallback(
    (viewport: ViewportType) => {
      onUpdatePage({ viewport });
    },
    [onUpdatePage]
  );

  const handleBackgroundColorChange = useCallback(
    (color: string) => {
      onUpdatePage({
        background: { ...pageData.background, color },
      });
    },
    [pageData.background, onUpdatePage]
  );

  // Determine which preset is currently active
  const activePreset = Object.entries(LAYOUT_PRESETS).find(([, layout]) => {
    return layout.type === pageData.layout.type;
  })?.[0] as LayoutPreset | undefined;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Page Properties</span>
      </div>

      <div style={styles.scrollContainer}>
        {/* Page Name */}
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>Page Name</label>
          <input
            type="text"
            value={pageData.name}
            onChange={(e) => {
              onUpdatePage({ name: e.target.value });
            }}
            style={styles.input}
          />
        </div>

        {/* Layout Section */}
        <div style={styles.section}>
          <div
            style={styles.sectionHeader}
            onClick={() => {
              toggleSection('layout');
            }}
          >
            {expandedSections.has('layout') ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <div style={styles.sectionIcon}>
              <LayoutIcon />
            </div>
            <span style={styles.sectionTitle}>Layout</span>
          </div>

          {expandedSections.has('layout') && (
            <div style={styles.sectionContent}>
              {/* Layout Presets */}
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Preset</label>
                <div style={styles.presetGrid}>
                  {(Object.keys(LAYOUT_PRESETS) as LayoutPreset[]).map((preset) => (
                    <button
                      key={preset}
                      style={{
                        ...styles.presetButton,
                        ...(activePreset === preset ? styles.presetButtonActive : {}),
                      }}
                      onClick={() => {
                        handleLayoutPreset(preset);
                      }}
                    >
                      <div style={styles.presetIcon}>
                        <LayoutPresetIcon preset={preset} />
                      </div>
                      <span style={styles.presetLabel}>{PRESET_LABELS[preset]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gap */}
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Gap</label>
                <input
                  type="text"
                  value={pageData.layout.gap ?? '0'}
                  onChange={(e) => {
                    handleLayoutChange({ gap: e.target.value });
                  }}
                  style={styles.input}
                  placeholder="e.g., 16px, 1rem"
                />
              </div>

              {/* Padding */}
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Padding</label>
                <input
                  type="text"
                  value={pageData.layout.padding ?? '0'}
                  onChange={(e) => {
                    handleLayoutChange({ padding: e.target.value });
                  }}
                  style={styles.input}
                  placeholder="e.g., 24px, 1rem"
                />
              </div>

              {/* Flex-specific options */}
              {pageData.layout.type === 'flex' && (
                <>
                  <div style={styles.row}>
                    <div style={styles.col}>
                      <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>Direction</label>
                        <select
                          value={pageData.layout.direction ?? 'column'}
                          onChange={(e) => {
                            handleLayoutChange({ direction: e.target.value as FlexDirection });
                          }}
                          style={styles.select}
                        >
                          <option value="column">Column</option>
                          <option value="row">Row</option>
                        </select>
                      </div>
                    </div>
                    <div style={styles.col}>
                      <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>Align</label>
                        <select
                          value={pageData.layout.alignItems ?? 'stretch'}
                          onChange={(e) => {
                            handleLayoutChange({ alignItems: e.target.value });
                          }}
                          style={styles.select}
                        >
                          <option value="stretch">Stretch</option>
                          <option value="flex-start">Start</option>
                          <option value="center">Center</option>
                          <option value="flex-end">End</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Viewport Section */}
        <div style={styles.section}>
          <div
            style={styles.sectionHeader}
            onClick={() => {
              toggleSection('viewport');
            }}
          >
            {expandedSections.has('viewport') ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <div style={styles.sectionIcon}>
              <MonitorIcon />
            </div>
            <span style={styles.sectionTitle}>Viewport</span>
          </div>

          {expandedSections.has('viewport') && (
            <div style={styles.sectionContent}>
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Device</label>
                <select
                  value={pageData.viewport}
                  onChange={(e) => {
                    handleViewportChange(e.target.value as ViewportType);
                  }}
                  style={styles.select}
                >
                  {(Object.keys(VIEWPORT_PRESETS) as ViewportType[]).map((viewport) => (
                    <option key={viewport} value={viewport}>
                      {VIEWPORT_PRESETS[viewport].label} ({VIEWPORT_PRESETS[viewport].width}x
                      {VIEWPORT_PRESETS[viewport].height})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.row}>
                <div style={styles.col}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>Width</label>
                    <input
                      type="number"
                      value={
                        pageData.customSize?.width ?? VIEWPORT_PRESETS[pageData.viewport].width
                      }
                      onChange={(e) => {
                        onUpdatePage({
                          customSize: {
                            width: parseInt(e.target.value, 10) || 0,
                            height:
                              pageData.customSize?.height ??
                              VIEWPORT_PRESETS[pageData.viewport].height,
                          },
                        });
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.col}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>Height</label>
                    <input
                      type="number"
                      value={
                        pageData.customSize?.height ?? VIEWPORT_PRESETS[pageData.viewport].height
                      }
                      onChange={(e) => {
                        onUpdatePage({
                          customSize: {
                            width:
                              pageData.customSize?.width ??
                              VIEWPORT_PRESETS[pageData.viewport].width,
                            height: parseInt(e.target.value, 10) || 0,
                          },
                        });
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Background Section */}
        <div style={styles.section}>
          <div
            style={styles.sectionHeader}
            onClick={() => {
              toggleSection('background');
            }}
          >
            {expandedSections.has('background') ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <div style={styles.sectionIcon}>
              <PaletteIcon />
            </div>
            <span style={styles.sectionTitle}>Background</span>
          </div>

          {expandedSections.has('background') && (
            <div style={styles.sectionContent}>
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Color</label>
                <div style={styles.colorRow}>
                  <input
                    type="color"
                    value={pageData.background?.color ?? '#ffffff'}
                    onChange={(e) => {
                      handleBackgroundColorChange(e.target.value);
                    }}
                    style={styles.colorInput}
                  />
                  <input
                    type="text"
                    value={pageData.background?.color ?? '#ffffff'}
                    onChange={(e) => {
                      handleBackgroundColorChange(e.target.value);
                    }}
                    style={{ ...styles.input, flex: 1 }}
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
