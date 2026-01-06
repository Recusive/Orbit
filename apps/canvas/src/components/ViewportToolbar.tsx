import React from 'react';

import { spacing, radii, fontSize, fontWeight, letterSpacing, motion } from '../lib/designTokens';
import { VIEWPORT_PRESETS } from '../sandpack/sandpackConfig';

import type { ViewportType } from '../sandpack/sandpackConfig';

export interface ViewportToolbarProps {
  currentViewport: ViewportType;
  onViewportChange: (viewport: ViewportType) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

// Icons
const PhoneIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
  </svg>
);

const TabletIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
  </svg>
);

const MonitorIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const ZoomInIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    <line x1="11" y1="8" x2="11" y2="14"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const ZoomOutIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const viewportConfig: Record<ViewportType, { icon: React.ReactNode; label: string }> = {
  mobile: { icon: <PhoneIcon />, label: 'Mobile' },
  tablet: { icon: <TabletIcon />, label: 'Tablet' },
  desktop: { icon: <MonitorIcon />, label: 'Desktop' },
};

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

/**
 * ViewportToolbar - Global viewport and zoom controls for the canvas
 */
export function ViewportToolbar({
  currentViewport,
  onViewportChange,
  zoom,
  onZoomChange,
}: ViewportToolbarProps): React.JSX.Element {
  const handleZoomIn = (): void => {
    const currentIndex = ZOOM_PRESETS.findIndex((z) => z >= zoom);
    const nextIndex = Math.min(currentIndex + 1, ZOOM_PRESETS.length - 1);
    const nextZoom = ZOOM_PRESETS[nextIndex];
    if (nextZoom !== undefined) {
      onZoomChange(nextZoom);
    }
  };

  const handleZoomOut = (): void => {
    const currentIndex = ZOOM_PRESETS.findIndex((z) => z >= zoom);
    const prevIndex = Math.max(currentIndex - 1, 0);
    const prevZoom = ZOOM_PRESETS[prevIndex];
    if (prevZoom !== undefined) {
      onZoomChange(prevZoom);
    }
  };

  return (
    <div style={styles['toolbar']}>
      {/* Viewport selector */}
      <div style={styles['viewportSection']}>
        <span style={styles['sectionLabel']}>Viewport</span>
        <div style={styles['viewportButtons']}>
          {(Object.keys(VIEWPORT_PRESETS) as ViewportType[]).map((vp) => {
            const config = viewportConfig[vp];
            const dimensions = VIEWPORT_PRESETS[vp];
            const isActive = currentViewport === vp;

            return (
              <button
                key={vp}
                style={{
                  ...styles['viewportButton'],
                  ...(isActive ? styles['viewportButtonActive'] : {}),
                }}
                onClick={() => {
                  onViewportChange(vp);
                }}
                title={`${config.label} (${String(dimensions.width)}×${String(dimensions.height)})`}
              >
                {config.icon}
                <span style={styles['viewportLabel']}>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={styles['divider']} />

      {/* Zoom controls */}
      <div style={styles['zoomSection']}>
        <span style={styles['sectionLabel']}>Zoom</span>
        <div style={styles['zoomControls']}>
          <button
            style={styles['zoomButton']}
            onClick={handleZoomOut}
            disabled={ZOOM_PRESETS[0] !== undefined && zoom <= ZOOM_PRESETS[0]}
            title="Zoom out"
          >
            <ZoomOutIcon />
          </button>

          <select
            style={styles['zoomSelect']}
            value={zoom}
            onChange={(e) => {
              onZoomChange(Number(e.target.value));
            }}
          >
            {ZOOM_PRESETS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>

          <button
            style={styles['zoomButton']}
            onClick={handleZoomIn}
            disabled={(() => {
              const maxZoom = ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
              return maxZoom !== undefined && zoom >= maxZoom;
            })()}
            title="Zoom in"
          >
            <ZoomInIcon />
          </button>
        </div>
      </div>

      {/* Current dimensions display */}
      <div style={styles['dimensionsDisplay']}>
        <span style={styles['dimensionsText']}>
          {VIEWPORT_PRESETS[currentViewport].width} × {VIEWPORT_PRESETS[currentViewport].height}
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing['2xl'],
    padding: `${String(spacing.lg)}px ${String(spacing['2xl'])}px`,
    backgroundColor: 'var(--background)',
    borderBottom: '1px solid var(--border)',
  },
  viewportSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  viewportButtons: {
    display: 'flex',
    backgroundColor: 'var(--input)',
    borderRadius: radii.md,
    padding: spacing.xs,
  },
  viewportButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.md)}px ${String(spacing.xl)}px`,
    border: 'none',
    background: 'transparent',
    borderRadius: radii.sm,
    cursor: 'pointer',
    color: 'var(--muted-foreground)',
    fontSize: fontSize.sm,
    transition: `all ${motion.normal} ${motion.ease}`,
  },
  viewportButtonActive: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  viewportLabel: {
    fontSize: fontSize.sm,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'var(--border)',
  },
  zoomSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  zoomButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--input)',
    borderRadius: radii.sm,
    cursor: 'pointer',
    color: 'var(--muted-foreground)',
    transition: `all ${motion.normal} ${motion.ease}`,
  },
  zoomSelect: {
    padding: `${String(spacing.sm)}px ${String(spacing.lg)}px`,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    cursor: 'pointer',
    minWidth: 60,
  },
  dimensionsDisplay: {
    marginLeft: 'auto',
    padding: `${String(spacing.sm)}px ${String(spacing.lg)}px`,
    backgroundColor: 'var(--input)',
    borderRadius: radii.sm,
  },
  dimensionsText: {
    fontSize: fontSize.xs,
    color: 'var(--muted-foreground)',
    fontFamily: 'monospace',
  },
};
