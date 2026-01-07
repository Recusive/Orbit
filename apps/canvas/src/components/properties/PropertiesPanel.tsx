/**
 * PropertiesPanel
 *
 * Main properties panel component.
 * Orchestrates all property sections for the selected design node.
 *
 * Section collapse behavior:
 * - Position: Open by default
 * - Layout, Appearance, Fill, Stroke, Effects, Constraints, Export: Collapsed
 */

import React, { useMemo, useCallback, useState } from 'react';

import { spacing, fontSize, fontWeight } from '../../lib/design/designTokens';

import { PropertyHeader } from './PropertyHeader';
import { AppearanceSection } from './sections/AppearanceSection';
import { ConstraintsSection } from './sections/ConstraintsSection';
import { EffectsSection } from './sections/EffectsSection';
import { ExportSection } from './sections/ExportSection';
import { FillSection } from './sections/FillSection';
import { LayoutSection } from './sections/LayoutSection';
import { PositionSection } from './sections/PositionSection';
import { StrokeSection } from './sections/StrokeSection';
import { TextSection } from './sections/TextSection';

import type { CornerRadii } from './inputs/CornerRadiusInput';
import type { BlendMode } from './sections/AppearanceSection';
import type { ExportSetting } from './sections/ExportSection';
import type {
  DesignNode,
  Fill,
  Stroke,
  Constraints,
  AutoLayout,
  TextNode,
} from '../../types/designNodeTypes';

export interface PropertiesPanelProps {
  /** Selected design node */
  selectedNode: DesignNode | null;
  /** Update callback */
  onUpdateNode: (nodeId: string, updates: Partial<DesignNode>) => void;
  /** Constraints callback */
  onSetConstraints?: (nodeId: string, constraints: Constraints) => void;
  /** Auto layout callbacks */
  onEnableAutoLayout?: (nodeId: string, direction: 'horizontal' | 'vertical') => void;
  onDisableAutoLayout?: (nodeId: string) => void;
  onUpdateAutoLayout?: (nodeId: string, updates: Partial<AutoLayout>) => void;
  /** Export callback */
  onExport?: (nodeId: string, settings: ExportSetting[]) => void;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    overflow: 'hidden',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${String(spacing['4xl'])}px ${String(spacing['2xl'])}px`,
    textAlign: 'center' as const,
    flex: 1,
  },
  emptyStateIcon: {
    width: 48,
    height: 48,
    marginBottom: spacing.xl,
    color: 'var(--muted-foreground)',
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    marginBottom: spacing.sm,
  },
  emptyStateHint: {
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
    opacity: 0.7,
  },
};

const EmptyStateIcon = (): React.JSX.Element => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.3" />
    <path d="M8 12h8M12 8v8" opacity="0.5" />
  </svg>
);

export function PropertiesPanel({
  selectedNode,
  onUpdateNode,
  onSetConstraints,
  onEnableAutoLayout,
  onDisableAutoLayout,
  onUpdateAutoLayout,
  onExport,
}: PropertiesPanelProps): React.JSX.Element {
  // Local state for export presets
  const [exportPresets, setExportPresets] = useState<ExportSetting[]>([]);

  // Determine node type for conditional rendering
  const nodeType = useMemo(() => {
    if (!selectedNode) return null;
    return selectedNode.type;
  }, [selectedNode]);

  const isFrame = nodeType === 'frame';
  const isText = nodeType === 'text';

  // Get corner radius as number or CornerRadii
  const cornerRadius = useMemo(() => {
    if (!selectedNode) return 0;
    const cr = selectedNode.cornerRadius;
    if (typeof cr === 'number') return cr;
    return cr as CornerRadii;
  }, [selectedNode]);

  // Update helpers
  const handleUpdate = useCallback(
    (updates: Partial<DesignNode>) => {
      if (selectedNode) {
        onUpdateNode(selectedNode.id, updates);
      }
    },
    [selectedNode, onUpdateNode]
  );

  // Position handlers
  const handleXChange = useCallback(
    (x: number) => {
      handleUpdate({ x });
    },
    [handleUpdate]
  );
  const handleYChange = useCallback(
    (y: number) => {
      handleUpdate({ y });
    },
    [handleUpdate]
  );
  const handleRotationChange = useCallback(
    (rotation: number) => {
      handleUpdate({ rotation });
    },
    [handleUpdate]
  );

  // Layout handlers
  const handleWidthChange = useCallback(
    (width: number) => {
      handleUpdate({ width });
    },
    [handleUpdate]
  );
  const handleHeightChange = useCallback(
    (height: number) => {
      handleUpdate({ height });
    },
    [handleUpdate]
  );
  const handleClipContentChange = useCallback(
    (clipContent: boolean) => {
      handleUpdate({ clipContent });
    },
    [handleUpdate]
  );

  // Appearance handlers
  const handleOpacityChange = useCallback(
    (opacity: number) => {
      handleUpdate({ opacity });
    },
    [handleUpdate]
  );
  const handleCornerRadiusChange = useCallback(
    (radius: number | CornerRadii) => {
      handleUpdate({ cornerRadius: radius });
    },
    [handleUpdate]
  );
  const handleBlendModeChange = useCallback(
    (blendMode: BlendMode) => {
      handleUpdate({ blendMode });
    },
    [handleUpdate]
  );

  // Fill handlers
  const handleFillsChange = useCallback(
    (fills: Fill[]) => {
      handleUpdate({ fills });
    },
    [handleUpdate]
  );

  // Stroke handlers
  const handleStrokesChange = useCallback(
    (strokes: Stroke[]) => {
      handleUpdate({ strokes });
    },
    [handleUpdate]
  );

  // Effects handlers
  const handleShadowsChange = useCallback(
    (shadows: DesignNode['effects']['shadows']) => {
      if (!selectedNode) return;
      handleUpdate({
        effects: {
          shadows,
          ...(selectedNode.effects.blur ? { blur: selectedNode.effects.blur } : {}),
        },
      });
    },
    [selectedNode, handleUpdate]
  );

  const handleBlurChange = useCallback(
    (blur: DesignNode['effects']['blur']) => {
      if (!selectedNode) return;
      handleUpdate({
        effects: {
          shadows: selectedNode.effects.shadows,
          ...(blur ? { blur } : {}),
        },
      });
    },
    [selectedNode, handleUpdate]
  );

  // Constraints handlers
  const handleConstraintsChange = useCallback(
    (constraints: Constraints) => {
      if (selectedNode && onSetConstraints) {
        onSetConstraints(selectedNode.id, constraints);
      } else if (selectedNode) {
        handleUpdate({ constraints });
      }
    },
    [selectedNode, onSetConstraints, handleUpdate]
  );

  // Auto-layout handlers
  const handleEnableAutoLayout = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (selectedNode && onEnableAutoLayout) {
        onEnableAutoLayout(selectedNode.id, direction);
      }
    },
    [selectedNode, onEnableAutoLayout]
  );

  const handleDisableAutoLayout = useCallback(() => {
    if (selectedNode && onDisableAutoLayout) {
      onDisableAutoLayout(selectedNode.id);
    }
  }, [selectedNode, onDisableAutoLayout]);

  const handleUpdateAutoLayout = useCallback(
    (updates: Partial<AutoLayout>) => {
      if (selectedNode && onUpdateAutoLayout) {
        onUpdateAutoLayout(selectedNode.id, updates);
      }
    },
    [selectedNode, onUpdateAutoLayout]
  );

  // Export handlers
  const handleExport = useCallback(
    (settings: ExportSetting[]) => {
      if (selectedNode && onExport) {
        onExport(selectedNode.id, settings);
      }
    },
    [selectedNode, onExport]
  );

  // Empty state
  if (!selectedNode) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>
            <EmptyStateIcon />
          </div>
          <div style={styles.emptyStateTitle}>No Selection</div>
          <div style={styles.emptyStateHint}>Select an element to view its properties</div>
        </div>
      </div>
    );
  }

  // Get auto-layout from frame nodes
  const autoLayout = isFrame && 'autoLayout' in selectedNode ? selectedNode.autoLayout : undefined;

  // Get text properties from text nodes
  const textProps =
    isText && 'textProperties' in selectedNode ? selectedNode.textProperties : undefined;

  return (
    <div style={styles.container}>
      {/* Header with type and name */}
      <PropertyHeader
        nodeType={selectedNode.type}
        nodeName={selectedNode.name}
        onNameChange={(name) => {
          handleUpdate({ name });
        }}
      />

      {/* Scrollable sections container */}
      <div style={styles.scrollContainer}>
        {/* Position Section - Open by default */}
        <PositionSection
          x={selectedNode.x}
          y={selectedNode.y}
          rotation={selectedNode.rotation}
          onXChange={handleXChange}
          onYChange={handleYChange}
          onRotationChange={handleRotationChange}
        />

        {/* Layout Section */}
        <LayoutSection
          width={selectedNode.width}
          height={selectedNode.height}
          clipContent={selectedNode.clipContent}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          isFrame={isFrame}
          {...(autoLayout ? { autoLayout } : {})}
          {...(isFrame
            ? {
                onClipContentChange: handleClipContentChange,
                onEnableAutoLayout: handleEnableAutoLayout,
                onDisableAutoLayout: handleDisableAutoLayout,
                onUpdateAutoLayout: handleUpdateAutoLayout,
              }
            : {})}
        />

        {/* Appearance Section */}
        <AppearanceSection
          opacity={selectedNode.opacity}
          cornerRadius={cornerRadius}
          blendMode={selectedNode.blendMode ?? 'normal'}
          onOpacityChange={handleOpacityChange}
          onCornerRadiusChange={handleCornerRadiusChange}
          onBlendModeChange={handleBlendModeChange}
        />

        {/* Text Section - only for text nodes */}
        {isText && textProps ? (
          <TextSection
            fontFamily={textProps.fontFamily}
            fontSize={textProps.fontSize}
            fontWeight={textProps.fontWeight}
            lineHeight={textProps.lineHeight}
            letterSpacing={textProps.letterSpacing}
            textAlign={textProps.textAlign}
            textAlignVertical={textProps.textAlignVertical}
            textDecoration={textProps.textDecoration}
            textCase={textProps.textCase ?? 'none'}
            onFontFamilyChange={(fontFamily) => {
              handleUpdate({ textProperties: { ...textProps, fontFamily } } as Partial<TextNode>);
            }}
            onFontSizeChange={(fontSize) => {
              handleUpdate({ textProperties: { ...textProps, fontSize } } as Partial<TextNode>);
            }}
            onFontWeightChange={(fontWeight) => {
              handleUpdate({ textProperties: { ...textProps, fontWeight } } as Partial<TextNode>);
            }}
            onLineHeightChange={(lineHeight) => {
              handleUpdate({ textProperties: { ...textProps, lineHeight } } as Partial<TextNode>);
            }}
            onLetterSpacingChange={(letterSpacing) => {
              handleUpdate({
                textProperties: { ...textProps, letterSpacing },
              } as Partial<TextNode>);
            }}
            onTextAlignChange={(textAlign) => {
              handleUpdate({ textProperties: { ...textProps, textAlign } } as Partial<TextNode>);
            }}
            onTextAlignVerticalChange={(textAlignVertical) => {
              handleUpdate({
                textProperties: { ...textProps, textAlignVertical },
              } as Partial<TextNode>);
            }}
            onTextDecorationChange={(textDecoration) => {
              handleUpdate({
                textProperties: { ...textProps, textDecoration },
              } as Partial<TextNode>);
            }}
            onTextCaseChange={(textCase) => {
              handleUpdate({ textProperties: { ...textProps, textCase } } as Partial<TextNode>);
            }}
          />
        ) : null}

        {/* Fill Section */}
        <FillSection fills={selectedNode.fills} onFillsChange={handleFillsChange} />

        {/* Stroke Section */}
        <StrokeSection strokes={selectedNode.strokes} onStrokesChange={handleStrokesChange} />

        {/* Effects Section */}
        <EffectsSection
          shadows={selectedNode.effects.shadows}
          onShadowsChange={handleShadowsChange}
          onBlurChange={handleBlurChange}
          {...(selectedNode.effects.blur ? { blur: selectedNode.effects.blur } : {})}
        />

        {/* Constraints Section */}
        <ConstraintsSection
          constraints={selectedNode.constraints}
          onChange={handleConstraintsChange}
        />

        {/* Export Section */}
        <ExportSection
          exports={exportPresets}
          onExportsChange={setExportPresets}
          {...(onExport ? { onExport: handleExport } : {})}
        />
      </div>
    </div>
  );
}

export default PropertiesPanel;
