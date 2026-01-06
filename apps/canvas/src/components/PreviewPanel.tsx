import { SandpackProvider } from '@codesandbox/sandpack-react';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';

import { useTauriCanvas } from '../hooks/useTauriCanvas';
import { useVisualEditing } from '../hooks/useVisualEditing';
import { codeGenerator } from '../lib/codeGenerator';
import { SandpackPreview as SandpackPreviewComponent } from '../sandpack/SandpackPreview';
import {
  SANDPACK_DEPENDENCIES,
  INDEX_TEMPLATE,
  createHtmlTemplateWithBridge,
} from '../sandpack/sandpackConfig';

import { SelectionOverlay, SnapGuides } from './SelectionOverlay';

import type { SelectedElement } from '../hooks/useVisualEditing';
import type { ViewportType } from '../sandpack/sandpackConfig';
import type { Node, Edge } from '@xyflow/react';

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface PreviewPanelProps {
  nodes: Node[];
  edges: Edge[];
  isVisible: boolean;
  onToggleVisibility: () => void;
  embedded?: boolean;
  selectedNodeCode?: string;
  selectedNodeViewport?: ViewportType;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onSizeChange?: (nodeId: string, size: { width: number; height: number }) => void;
  enableVisualEditing?: boolean;
}

// Bridge message types from Sandpack iframe
interface BridgeMessage {
  type: 'component-ready' | 'component-error' | 'component-rendered' | 'user-interaction';
  nodeId: string;
  payload?: {
    dimensions?: { width: number; height: number };
    error?: string;
    errorStack?: string;
    event?: string;
    target?: string;
    sourceLoc?: string | null;
    rect?: DOMRect | null;
  };
}

// =============================================================================
// ICONS
// =============================================================================

const PreviewIcon = (): React.JSX.Element => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const RefreshIcon = (): React.JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

const MaximizeIcon = (): React.JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 3 21 3 21 9"></polyline>
    <polyline points="9 21 3 21 3 15"></polyline>
    <line x1="21" y1="3" x2="14" y2="10"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const MinimizeIcon = (): React.JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 14 10 14 10 20"></polyline>
    <polyline points="20 10 14 10 14 4"></polyline>
    <line x1="14" y1="10" x2="21" y2="3"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const ChevronLeftIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

// Device icons
const MobileIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
  </svg>
);

const TabletIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
  </svg>
);

const DesktopIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const EmptyPreviewIcon = (): React.JSX.Element => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" opacity="0.3"></rect>
    <line x1="8" y1="21" x2="16" y2="21" opacity="0.3"></line>
    <line x1="12" y1="17" x2="12" y2="21" opacity="0.3"></line>
    <circle cx="12" cy="10" r="3" opacity="0.5"></circle>
  </svg>
);

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--background)',
    borderLeft: 'none',
    transition: `width 200ms ${EASE_OUT}`,
    height: '100%',
  },
  containerExpanded: {
    width: 320,
  },
  containerCollapsed: {
    width: 48,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: 'none',
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    minHeight: 36,
  },
  headerCollapsed: {
    flexDirection: 'column' as const,
    padding: '12px 8px',
    gap: 12,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    textTransform: 'lowercase' as const,
    letterSpacing: '0.06em',
  },
  headerTitleVertical: {
    writingMode: 'vertical-rl' as const,
    textOrientation: 'mixed' as const,
    transform: 'rotate(180deg)',
    fontSize: 10,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    transition: `all 200ms ${EASE_OUT}`,
  },
  iconButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  iconButtonActive: {
    transform: 'scale(0.95)',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  previewWrapper: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 2px 6px -2px rgba(0, 0, 0, 0.08)',
  },
  deviceSelector: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: 'none',
    backgroundColor: 'transparent',
  },
  deviceTabs: {
    display: 'flex',
    gap: 2,
    padding: 3,
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    borderRadius: 8,
  },
  deviceButton: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 3,
    padding: '8px 12px',
    fontSize: 10,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    transition: `all 200ms ${EASE_OUT}`,
    minWidth: 60,
  },
  deviceButtonActive: {
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
  },
  deviceButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    color: 'var(--foreground)',
  },
  deviceLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  deviceDimensions: {
    fontSize: 9,
    fontWeight: 400,
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    letterSpacing: '0.01em',
  },
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    transition: `all 200ms ${EASE_OUT}`,
  },
  refreshButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  refreshButtonActive: {
    transform: 'scale(0.95)',
  },
  chevron: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    display: 'flex',
    alignItems: 'center',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 32,
    textAlign: 'center' as const,
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
    borderRadius: 10,
  },
  emptyStateIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 40%, transparent)',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 11,
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    lineHeight: 1.5,
  },
  viewportInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 16px',
    backgroundColor: 'color-mix(in oklch, #000000 75%, transparent)',
    backdropFilter: 'blur(4px)',
    borderRadius: 6,
    position: 'absolute' as const,
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  viewportLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
  },
  viewportValue: {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
  },
};

type DeviceSize = 'mobile' | 'tablet' | 'desktop';

const deviceToViewport: Record<DeviceSize, ViewportType> = {
  mobile: 'mobile',
  tablet: 'tablet',
  desktop: 'desktop',
};

const deviceSizes: Record<
  DeviceSize,
  {
    width: string;
    height: string;
    label: string;
    dimensions: string;
    icon: React.FC;
  }
> = {
  mobile: {
    width: '375px',
    height: '667px',
    label: 'Mobile',
    dimensions: '375 × 667',
    icon: MobileIcon,
  },
  tablet: {
    width: '768px',
    height: '1024px',
    label: 'Tablet',
    dimensions: '768 × 1024',
    icon: TabletIcon,
  },
  desktop: {
    width: '100%',
    height: '100%',
    label: 'Desktop',
    dimensions: 'Responsive',
    icon: DesktopIcon,
  },
};

const MAX_FIX_RETRIES = 3;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PreviewPanel({
  nodes,
  edges,
  isVisible,
  onToggleVisibility,
  embedded = false,
  selectedNodeCode,
  selectedNodeViewport,
  selectedNodeId,
  onSelectNode,
  onPositionChange,
  onSizeChange,
  enableVisualEditing = false,
}: PreviewPanelProps): React.JSX.Element {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<DeviceSize | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [retryCount, setRetryCount] = useState<Record<string, number>>({});

  const previewContainerRef = useRef<HTMLDivElement>(null);

  const visualEditing = useVisualEditing({
    ...(onPositionChange !== undefined ? { onPositionChange } : {}),
    ...(onSizeChange !== undefined ? { onSizeChange } : {}),
    containerRef: previewContainerRef,
    enableSnapping: true,
    snapThreshold: 8,
  });

  const { sendError, requestFix } = useTauriCanvas();

  // Listen for bridge messages
  useEffect(() => {
    const handleBridgeMessage = (event: MessageEvent<unknown>): void => {
      const message = event.data;
      if (
        message === null ||
        message === undefined ||
        typeof message !== 'object' ||
        !('type' in message)
      ) {
        return;
      }
      const bridgeMessage = message as BridgeMessage;

      switch (bridgeMessage.type) {
        case 'user-interaction':
          if (bridgeMessage.payload?.sourceLoc && onSelectNode) {
            onSelectNode(bridgeMessage.payload.sourceLoc);

            if (enableVisualEditing && bridgeMessage.payload.rect) {
              const rect = bridgeMessage.payload.rect;
              const selectedElement: SelectedElement = {
                layerId: bridgeMessage.payload.sourceLoc,
                componentId: bridgeMessage.payload.sourceLoc,
                rect: {
                  x: rect.x || 0,
                  y: rect.y || 0,
                  width: rect.width || 100,
                  height: rect.height || 100,
                },
                isAbsolute: true,
              };
              visualEditing.selectElement(selectedElement);
            }
          }
          break;

        case 'component-error':
          if (bridgeMessage.payload?.error) {
            setLastError(bridgeMessage.payload.error);
            sendError(
              bridgeMessage.nodeId,
              bridgeMessage.payload.error,
              bridgeMessage.payload.errorStack
            );
          }
          break;

        case 'component-ready':
          setLastError(null);
          break;

        case 'component-rendered':
          break;
      }
    };

    window.addEventListener('message', handleBridgeMessage);
    return () => {
      window.removeEventListener('message', handleBridgeMessage);
    };
  }, [onSelectNode, sendError, enableVisualEditing, visualEditing]);

  const triggerAutoFix = useCallback(
    (nodeId: string, code: string, error: string) => {
      const currentRetries = retryCount[nodeId] ?? 0;

      if (currentRetries >= MAX_FIX_RETRIES) {
        return;
      }

      setIsFixing(true);
      setRetryCount((prev) => ({ ...prev, [nodeId]: currentRetries + 1 }));
      requestFix(nodeId, code, error);
    },
    [retryCount, requestFix]
  );

  const handleSandpackError = useCallback(
    (nodeId: string, error: string) => {
      setLastError(error);
      sendError(nodeId, error);

      if (selectedNodeCode && nodeId === selectedNodeId) {
        triggerAutoFix(nodeId, selectedNodeCode, error);
      }
    },
    [sendError, selectedNodeCode, selectedNodeId, triggerAutoFix]
  );

  const handleSandpackReady = useCallback(() => {
    setLastError(null);
    setIsFixing(false);
    if (selectedNodeId) {
      setRetryCount((prev) => ({ ...prev, [selectedNodeId]: 0 }));
    }
  }, [selectedNodeId]);

  const handleRequestFix = useCallback(() => {
    if (lastError && selectedNodeId && selectedNodeCode) {
      setIsFixing(true);
      requestFix(selectedNodeId, selectedNodeCode, lastError);
      setRetryCount((prev) => ({
        ...prev,
        [selectedNodeId]: (prev[selectedNodeId] ?? 0) + 1,
      }));
    }
  }, [lastError, selectedNodeId, selectedNodeCode, requestFix]);

  // Note: Removed auto-refresh on code change.
  // Sandpack automatically updates when files change via its internal file watcher.
  // Forcing remount via key change causes "Maximum update depth exceeded" error
  // because unregisterBundler calls setState during unmount cycle.

  const effectiveDevice = useMemo<DeviceSize>(() => {
    if (selectedNodeViewport) {
      return selectedNodeViewport as DeviceSize;
    }
    return device;
  }, [selectedNodeViewport, device]);

  const generatedCode = useMemo(() => {
    if (selectedNodeCode) {
      return selectedNodeCode;
    }
    return codeGenerator.generateTSX(nodes, edges);
  }, [nodes, edges, selectedNodeCode]);

  const sandpackFiles = useMemo(() => {
    let appCode: string;

    if (selectedNodeCode) {
      appCode = selectedNodeCode;
    } else {
      appCode = `${generatedCode}

export default function App() {
  return <GeneratedComponent />;
}
`;
    }

    const effectiveNodeId = selectedNodeId ?? 'preview-panel';

    return {
      '/App.tsx': appCode,
      '/index.tsx': INDEX_TEMPLATE,
      '/public/index.html': createHtmlTemplateWithBridge(effectiveNodeId),
    };
  }, [generatedCode, selectedNodeCode, selectedNodeId]);

  const handleRefresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshCounter((prev) => prev + 1);
  }, []);

  const handleToggleMaximize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMaximized(!isMaximized);
    },
    [isMaximized]
  );

  const handleDeviceChange = useCallback((newDevice: DeviceSize, e: React.MouseEvent) => {
    e.stopPropagation();
    setDevice(newDevice);
  }, []);

  const isEmpty = nodes.length === 0 && !selectedNodeCode;
  const viewport = deviceToViewport[effectiveDevice];
  const currentDeviceInfo = deviceSizes[effectiveDevice];

  // Render device button
  const renderDeviceButton = (deviceKey: DeviceSize): React.ReactNode => {
    const deviceInfo = deviceSizes[deviceKey];
    const Icon = deviceInfo.icon;
    const isActive = effectiveDevice === deviceKey;
    const isHovered = hoveredDevice === deviceKey && !isActive;

    return (
      <button
        key={deviceKey}
        onClick={(e) => {
          handleDeviceChange(deviceKey, e);
        }}
        onMouseEnter={() => {
          setHoveredDevice(deviceKey);
        }}
        onMouseLeave={() => {
          setHoveredDevice(null);
        }}
        style={{
          ...styles.deviceButton,
          ...(isActive ? styles.deviceButtonActive : {}),
          ...(isHovered ? styles.deviceButtonHover : {}),
        }}
        title={`${deviceInfo.label} (${deviceInfo.dimensions})`}
      >
        <Icon />
        <span style={styles.deviceLabel}>{deviceInfo.label}</span>
        <span style={styles.deviceDimensions}>{deviceInfo.dimensions}</span>
      </button>
    );
  };

  // Sandpack preview content
  const renderSandpackPreview = (): React.ReactNode => {
    if (isEmpty) {
      return (
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>
            <EmptyPreviewIcon />
          </div>
          <div style={styles.emptyStateTitle}>No preview available</div>
          <div style={styles.emptyStateText}>
            Add components to the canvas
            <br />
            to see a live preview
          </div>
        </div>
      );
    }

    const effectiveNodeId = selectedNodeId ?? 'preview-panel';

    // Use stable key: only remount when node changes or manual refresh
    const sandpackKey = `${effectiveNodeId}-${String(refreshCounter)}`;

    return (
      <SandpackProvider
        key={sandpackKey}
        template="react-ts"
        theme="light"
        files={sandpackFiles}
        customSetup={{
          dependencies: SANDPACK_DEPENDENCIES,
        }}
        options={{
          externalResources: ['https://cdn.tailwindcss.com'],
        }}
      >
        <div style={{ height: '100%', width: '100%', position: 'relative' }}>
          <SandpackPreviewComponent
            nodeId={effectiveNodeId}
            viewport={viewport}
            showErrorOverlay={true}
            onError={handleSandpackError}
            onReady={handleSandpackReady}
            responsive={embedded ? effectiveDevice === 'desktop' : false}
          />
          {/* Fix status overlay */}
          {(isFixing || lastError) && selectedNodeId ? (
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 20,
              }}
            >
              {isFixing ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    boxShadow: '0 4px 12px var(--primary)',
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      border: '2px solid var(--muted-foreground)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  Fixing... ({retryCount[selectedNodeId] ?? 1}/{MAX_FIX_RETRIES})
                </div>
              ) : lastError ? (
                <button
                  onClick={handleRequestFix}
                  disabled={(retryCount[selectedNodeId] ?? 0) >= MAX_FIX_RETRIES}
                  style={{
                    padding: '8px 16px',
                    backgroundColor:
                      (retryCount[selectedNodeId] ?? 0) >= MAX_FIX_RETRIES
                        ? '#6b7280'
                        : 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor:
                      (retryCount[selectedNodeId] ?? 0) >= MAX_FIX_RETRIES
                        ? 'not-allowed'
                        : 'pointer',
                    boxShadow: '0 4px 12px var(--primary)',
                    opacity: (retryCount[selectedNodeId] ?? 0) >= MAX_FIX_RETRIES ? 0.7 : 1,
                    transition: `all 200ms ${EASE_OUT}`,
                  }}
                >
                  {(retryCount[selectedNodeId] ?? 0) >= MAX_FIX_RETRIES
                    ? 'Max retries reached'
                    : `Retry Fix (${String(retryCount[selectedNodeId] ?? 0)}/${String(MAX_FIX_RETRIES)})`}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Visual Editing Overlay */}
          {enableVisualEditing ? (
            <>
              {visualEditing.snapGuides.length > 0 && (
                <SnapGuides
                  guides={visualEditing.snapGuides}
                  containerRect={{
                    width: previewContainerRef.current?.clientWidth ?? 800,
                    height: previewContainerRef.current?.clientHeight ?? 600,
                  }}
                />
              )}

              {visualEditing.selectedElement ? (
                <SelectionOverlay
                  rect={visualEditing.currentRect}
                  isAbsolute={visualEditing.selectedElement.isAbsolute}
                  isLocked={false}
                  onDragStart={visualEditing.startDrag}
                  onResizeStart={visualEditing.startResize}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </SandpackProvider>
    );
  };

  // Embedded mode
  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Device Selector */}
        <div style={styles.deviceSelector}>
          <div style={styles.deviceTabs}>
            {(['mobile', 'tablet', 'desktop'] as DeviceSize[]).map(renderDeviceButton)}
          </div>
          <button
            onClick={handleRefresh}
            onMouseEnter={() => {
              setHoveredButton('refresh');
            }}
            onMouseLeave={() => {
              setHoveredButton(null);
            }}
            style={{
              ...styles.refreshButton,
              ...(hoveredButton === 'refresh' ? styles.refreshButtonHover : {}),
            }}
            title="Refresh preview"
          >
            <RefreshIcon />
          </button>
        </div>

        {/* Viewport info bar */}
        {!isEmpty && (
          <div style={styles.viewportInfo}>
            <span style={styles.viewportLabel}>Viewport:</span>
            <span style={styles.viewportValue}>{currentDeviceInfo.dimensions}</span>
          </div>
        )}

        {/* Preview Content */}
        <div
          ref={previewContainerRef}
          style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {renderSandpackPreview()}
        </div>
      </div>
    );
  }

  // Original collapsible mode
  const containerStyle = {
    ...styles.container,
    ...(isVisible
      ? isMaximized
        ? { width: 480 }
        : styles.containerExpanded
      : styles.containerCollapsed),
  };

  const headerStyle = {
    ...styles.header,
    ...(isVisible ? {} : styles.headerCollapsed),
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle} onClick={onToggleVisibility}>
        <div style={styles.headerLeft}>
          <span style={{ color: 'var(--primary)' }}>
            <PreviewIcon />
          </span>
          {isVisible ? (
            <span style={styles.headerTitle}>Preview</span>
          ) : (
            <span style={{ ...styles.headerTitle, ...styles.headerTitleVertical }}>Preview</span>
          )}
        </div>
        {isVisible ? (
          <div style={styles.headerRight}>
            <button
              onClick={handleRefresh}
              onMouseEnter={() => {
                setHoveredButton('refresh');
              }}
              onMouseLeave={() => {
                setHoveredButton(null);
              }}
              style={{
                ...styles.iconButton,
                ...(hoveredButton === 'refresh' ? styles.iconButtonHover : {}),
              }}
              title="Refresh preview"
            >
              <RefreshIcon />
            </button>
            <button
              onClick={handleToggleMaximize}
              onMouseEnter={() => {
                setHoveredButton('maximize');
              }}
              onMouseLeave={() => {
                setHoveredButton(null);
              }}
              style={{
                ...styles.iconButton,
                ...(hoveredButton === 'maximize' ? styles.iconButtonHover : {}),
              }}
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
            <span style={styles.chevron}>
              <ChevronRightIcon />
            </span>
          </div>
        ) : null}
        {!isVisible && (
          <span style={styles.chevron}>
            <ChevronLeftIcon />
          </span>
        )}
      </div>

      {/* Device Selector */}
      {isVisible ? (
        <div style={styles.deviceSelector}>
          <div style={styles.deviceTabs}>
            {(['mobile', 'tablet', 'desktop'] as DeviceSize[]).map(renderDeviceButton)}
          </div>
        </div>
      ) : null}

      {/* Preview Content */}
      {isVisible ? (
        <div ref={previewContainerRef} style={styles.content}>
          {renderSandpackPreview()}
        </div>
      ) : null}
    </div>
  );
}
