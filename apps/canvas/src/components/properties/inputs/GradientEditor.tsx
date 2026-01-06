/**
 * GradientEditor
 *
 * Gradient editor with:
 * - Gradient type selector (linear, radial)
 * - Visual gradient bar with draggable stops
 * - Angle control for linear gradients
 * - Add/remove stops
 */

import React, { useState, useCallback, useRef } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/design/designTokens';
import { IconButton, IconButtonGroup } from '../shared/IconButton';

import { ColorInput } from './ColorInput';
import { NumberInput } from './NumberInput';

import type { GradientStop } from '../../../types/designNodeTypes';

export type GradientType = 'linear' | 'radial';

export interface GradientEditorProps {
  type: GradientType;
  angle: number;
  stops: GradientStop[];
  onTypeChange: (type: GradientType) => void;
  onAngleChange: (angle: number) => void;
  onStopsChange: (stops: GradientStop[]) => void;
  disabled?: boolean;
}

// Icons
const LinearGradientIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="6" y1="18" x2="18" y2="6" strokeOpacity="0.5" />
  </svg>
);

const RadialGradientIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="6" strokeOpacity="0.5" />
    <circle cx="12" cy="12" r="3" strokeOpacity="0.3" />
  </svg>
);

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 40,
  },
  gradientBarContainer: {
    position: 'relative' as const,
    height: 24,
    borderRadius: radii.sm,
    border: '1px solid var(--border)',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  gradientBar: {
    width: '100%',
    height: '100%',
  },
  stopHandle: {
    position: 'absolute' as const,
    top: -4,
    width: 12,
    height: 32,
    transform: 'translateX(-50%)',
    cursor: 'grab',
  },
  stopHandleInner: {
    width: 12,
    height: 12,
    marginTop: 10,
    borderRadius: '50%',
    border: '2px solid white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  stopsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  stopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stopPosition: {
    width: 50,
  },
  angleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  angleLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 40,
  },
  angleInput: {
    width: 70,
  },
};

export function GradientEditor({
  type,
  angle,
  stops,
  onTypeChange,
  onAngleChange,
  onStopsChange,
  disabled = false,
}: GradientEditorProps): React.JSX.Element {
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Generate CSS gradient string
  const getGradientCSS = useCallback((): string => {
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    const stopStrings = sortedStops
      .map((s) => `${s.color} ${String(s.position * 100)}%`)
      .join(', ');

    if (type === 'radial') {
      return `radial-gradient(circle, ${stopStrings})`;
    }
    return `linear-gradient(${String(angle)}deg, ${stopStrings})`;
  }, [type, angle, stops]);

  // Handle clicking on gradient bar to add stop
  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || isDragging) return;

      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      // Don't add if too close to existing stop
      const tooClose = stops.some((s) => Math.abs(s.position - position) < 0.05);
      if (tooClose) return;

      // Interpolate color at position
      const sortedStops = [...stops].sort((a, b) => a.position - b.position);
      let color = '#888888';

      for (let i = 0; i < sortedStops.length - 1; i++) {
        const currentStop = sortedStops[i];
        const nextStop = sortedStops[i + 1];
        if (
          currentStop &&
          nextStop &&
          position >= currentStop.position &&
          position <= nextStop.position
        ) {
          // Simple: just pick the color of the nearest stop
          const mid = (currentStop.position + nextStop.position) / 2;
          color = position < mid ? currentStop.color : nextStop.color;
          break;
        }
      }

      const newStops = [...stops, { position, color }];
      onStopsChange(newStops);
      setSelectedStopIndex(newStops.length - 1);
    },
    [disabled, isDragging, stops, onStopsChange]
  );

  // Handle stop drag
  const handleStopMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      setIsDragging(true);
      setSelectedStopIndex(index);

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const rect = barRef.current?.getBoundingClientRect();
        if (!rect) return;

        const position = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
        const newStops = stops.map((s, i) => (i === index ? { ...s, position } : s));
        onStopsChange(newStops);
      };

      const handleMouseUp = (): void => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [disabled, stops, onStopsChange]
  );

  // Handle stop color change
  const handleStopColorChange = useCallback(
    (index: number, color: string) => {
      const newStops = stops.map((s, i) => (i === index ? { ...s, color } : s));
      onStopsChange(newStops);
    },
    [stops, onStopsChange]
  );

  // Handle stop position change
  const handleStopPositionChange = useCallback(
    (index: number, position: number) => {
      const normalizedPosition = Math.max(0, Math.min(100, position)) / 100;
      const newStops = stops.map((s, i) =>
        i === index ? { ...s, position: normalizedPosition } : s
      );
      onStopsChange(newStops);
    },
    [stops, onStopsChange]
  );

  // Remove stop
  const handleRemoveStop = useCallback(
    (index: number) => {
      if (stops.length <= 2) return; // Minimum 2 stops
      const newStops = stops.filter((_, i) => i !== index);
      onStopsChange(newStops);
      setSelectedStopIndex(null);
    },
    [stops, onStopsChange]
  );

  return (
    <div style={styles.container}>
      {/* Gradient type selector */}
      <div style={styles.header}>
        <span style={styles.typeLabel}>Type</span>
        <IconButtonGroup>
          <IconButton
            icon={<LinearGradientIcon />}
            onClick={() => {
              onTypeChange('linear');
            }}
            isActive={type === 'linear'}
            disabled={disabled}
            title="Linear gradient"
            size="sm"
          />
          <IconButton
            icon={<RadialGradientIcon />}
            onClick={() => {
              onTypeChange('radial');
            }}
            isActive={type === 'radial'}
            disabled={disabled}
            title="Radial gradient"
            size="sm"
          />
        </IconButtonGroup>
      </div>

      {/* Angle control (only for linear) */}
      {type === 'linear' ? (
        <div style={styles.angleRow}>
          <span style={styles.angleLabel}>Angle</span>
          <div style={styles.angleInput}>
            <NumberInput
              value={angle}
              onChange={onAngleChange}
              min={0}
              max={360}
              unit="°"
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}

      {/* Gradient preview bar */}
      <div ref={barRef} style={styles.gradientBarContainer} onClick={handleBarClick}>
        <div
          style={{
            ...styles.gradientBar,
            background: getGradientCSS(),
          }}
        />
        {/* Stop handles */}
        {stops.map((stop, index) => (
          <div
            key={index}
            style={{
              ...styles.stopHandle,
              left: `${String(stop.position * 100)}%`,
            }}
            onMouseDown={(e) => {
              handleStopMouseDown(index, e);
            }}
          >
            <div
              style={{
                ...styles.stopHandleInner,
                backgroundColor: stop.color,
                boxShadow:
                  selectedStopIndex === index
                    ? '0 0 0 2px var(--primary), 0 1px 3px rgba(0,0,0,0.3)'
                    : '0 1px 3px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Stop list */}
      <div style={styles.stopsContainer}>
        {stops.map((stop, index) => (
          <div
            key={index}
            style={{
              ...styles.stopRow,
              backgroundColor: selectedStopIndex === index ? 'var(--accent)' : 'transparent',
              padding: spacing.xs,
              borderRadius: radii.sm,
              transition: `background-color ${motion.fast} ${motion.ease}`,
            }}
            onClick={() => {
              setSelectedStopIndex(index);
            }}
          >
            <ColorInput
              color={stop.color}
              onColorChange={(color: string) => {
                handleStopColorChange(index, color);
              }}
              disabled={disabled}
              compact
            />
            <div style={styles.stopPosition}>
              <NumberInput
                value={Math.round(stop.position * 100)}
                onChange={(pos) => {
                  handleStopPositionChange(index, pos);
                }}
                min={0}
                max={100}
                unit="%"
                disabled={disabled}
              />
            </div>
            <IconButton
              icon={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              }
              onClick={() => {
                handleRemoveStop(index);
              }}
              disabled={disabled || stops.length <= 2}
              title="Remove stop"
              size="sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default GradientEditor;
