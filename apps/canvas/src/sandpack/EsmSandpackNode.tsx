/**
 * EsmSandpackNode - Canvas node with ESM-based live preview (no Sandpack bundler)
 *
 * Features:
 * - No external bundler service calls
 * - Faster initial load (no dependency installation)
 * - Device frame selector
 * - Click-to-select element editing with Tailwind class modification
 */
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

import { DeviceFrameSelector } from '../components/DeviceFrameSelector';
import { LayerAgentToolbar } from '../components/LayerAgentToolbar';
import { updateClassNameInCode } from '../lib/codeTransformer';

import { EsmPreview } from './EsmPreview';
import { DEVICE_PRESETS } from './sandpackConfig';

import type { SelectedElement } from './EsmPreview';
import type { NodeProps } from '@xyflow/react';

import './LiveSandpackNode.css';

// Node data interface
export interface EsmSandpackNodeData {
  label: string;
  code: string;
  deviceId?: string;
  viewport?: string; // Legacy support
  isLoading?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export interface EsmSandpackNodeProps extends NodeProps {
  data: EsmSandpackNodeData;
}

// Generate unique instance ID
function generateInstanceId(nodeId: string): string {
  return `${nodeId}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

// Map legacy viewport to device ID
function getDeviceIdFromLegacy(viewport?: string): string {
  const legacyMap: Record<string, string> = {
    mobile: 'iphone-14',
    tablet: 'ipad',
    desktop: 'macbook-air',
  };
  return legacyMap[viewport ?? 'desktop'] ?? 'macbook-air';
}

// Icons
const PlayIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const BoltIcon = (): React.JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const EditIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CursorIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
  </svg>
);

/**
 * EsmSandpackNode - React Flow node with ESM-based live preview
 */
export function EsmSandpackNode({ id, data, selected }: EsmSandpackNodeProps): React.JSX.Element {
  const { updateNodeData } = useReactFlow();
  const [nodeSize, setNodeSize] = useState({ width: 400, height: 350 });
  const [instanceId] = useState(() => generateInstanceId(id));
  const [previewStatus, setPreviewStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [editingClasses, setEditingClasses] = useState(false);
  const [classEditorValue, setClassEditorValue] = useState('');
  const [pendingClassUpdate, setPendingClassUpdate] = useState<string | null>(null);

  // Get current device (support both new deviceId and legacy viewport)
  const currentDeviceId = data.deviceId ?? getDeviceIdFromLegacy(data.viewport);
  const currentDevice = DEVICE_PRESETS[currentDeviceId] ??
    DEVICE_PRESETS['macbook-air'] ?? {
      width: 1280,
      height: 832,
      label: 'MacBook Air',
      category: 'desktop' as const,
    };

  // Handle resize
  const handleResize = useCallback(
    (_unused: unknown, params: { width: number; height: number }) => {
      setNodeSize({ width: params.width, height: params.height });
    },
    []
  );

  // Handle device change
  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      updateNodeData(id, { deviceId });
    },
    [id, updateNodeData]
  );

  // Handle skill activation from toolbar
  const handleSkillActivate = useCallback(
    (skillId: string, prompt: string) => {
      const event = new CustomEvent('orbit:agent-skill', {
        detail: {
          skillId,
          prompt,
          nodeId: id,
          nodeLabel: data.label,
        },
      });
      window.dispatchEvent(event);
    },
    [id, data.label]
  );

  // Handle preview ready
  const handlePreviewReady = useCallback(() => {
    setPreviewStatus('ready');
  }, []);

  // Handle preview error
  const handlePreviewError = useCallback(() => {
    setPreviewStatus('error');
  }, []);

  // Handle element selection from preview
  const handleElementSelect = useCallback(
    (element: SelectedElement) => {
      setSelectedElement(element);
      setClassEditorValue(element.className);
      setEditingClasses(false);
      // Dispatch event for external listeners (e.g., properties panel)
      const event = new CustomEvent('orbit:element-selected', {
        detail: {
          nodeId: id,
          element,
        },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) {
        setSelectedElement(null);
        setEditingClasses(false);
      }
      return !prev;
    });
  }, []);

  // Start editing classes
  const startEditingClasses = useCallback(() => {
    if (selectedElement) {
      setClassEditorValue(selectedElement.className);
      setEditingClasses(true);
    }
  }, [selectedElement]);

  // Submit class changes
  const submitClassChanges = useCallback(() => {
    if (!selectedElement || classEditorValue === selectedElement.className) {
      setEditingClasses(false);
      return;
    }

    // Update the preview immediately
    setPendingClassUpdate(classEditorValue);

    // Update the code in the node data
    const newCode = updateClassNameInCode(
      data.code,
      {
        tagName: selectedElement.tagName,
        className: selectedElement.className,
        path: selectedElement.path,
      },
      classEditorValue
    );

    if (newCode !== data.code) {
      updateNodeData(id, { code: newCode });
    }

    // Update selected element state
    setSelectedElement((prev) => (prev ? { ...prev, className: classEditorValue } : null));
    setEditingClasses(false);

    // Clear pending update after a short delay
    setTimeout(() => {
      setPendingClassUpdate(null);
    }, 100);
  }, [selectedElement, classEditorValue, data.code, id, updateNodeData]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    if (selectedElement) {
      setClassEditorValue(selectedElement.className);
    }
    setEditingClasses(false);
  }, [selectedElement]);

  // Calculate available preview height (total height minus header)
  const previewHeight = nodeSize.height - 44;

  return (
    <>
      {/* Resize handles */}
      <NodeResizer
        minWidth={250}
        minHeight={200}
        maxWidth={1200}
        maxHeight={900}
        onResize={handleResize}
        isVisible={selected}
        lineClassName="live-sandpack-node__resizer-line"
        handleClassName="live-sandpack-node__resizer-handle"
      />

      {/* AI Agent Toolbar - appears above node when selected */}
      <LayerAgentToolbar
        nodeId={id}
        label={data.label}
        code={data.code}
        isVisible={selected}
        onSkillActivate={handleSkillActivate}
      />

      <div
        className={`live-sandpack-node ${selected ? 'live-sandpack-node--selected' : ''}`}
        style={{
          width: nodeSize.width,
          height: nodeSize.height,
        }}
      >
        {/* Header */}
        <div className="live-sandpack-node__header">
          <div className="live-sandpack-node__header-left">
            <div className="live-sandpack-node__icon-wrapper">
              <PlayIcon />
            </div>
            <span className="live-sandpack-node__label">{data.label}</span>
            {/* Status indicator */}
            {previewStatus === 'ready' && !editMode && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  marginLeft: 6,
                  padding: '2px 5px',
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 500,
                }}
                title="ESM Preview - Fast mode (no bundler)"
              >
                <BoltIcon />
                Live
              </span>
            )}
            {/* Edit mode indicator */}
            {editMode ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  marginLeft: 6,
                  padding: '2px 5px',
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 500,
                }}
              >
                <CursorIcon />
                Edit Mode
              </span>
            ) : null}
          </div>
          <div
            className="live-sandpack-node__header-right"
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
          >
            {/* Edit Mode Toggle */}
            <button
              onClick={toggleEditMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                padding: 0,
                backgroundColor: editMode ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                border: editMode ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                color: editMode ? '#fff' : '#e5e7eb',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={editMode ? 'Exit edit mode' : 'Enter edit mode (click to select elements)'}
            >
              <EditIcon />
            </button>
            {/* Device Frame Selector */}
            <DeviceFrameSelector
              selectedDevice={currentDeviceId}
              onDeviceChange={handleDeviceChange}
              compact={nodeSize.width < 350}
            />
          </div>
        </div>

        {/* Selected Element Info */}
        {editMode && selectedElement ? (
          <div
            style={{
              padding: '6px 10px',
              backgroundColor: '#1e3a5f',
              borderBottom: '1px solid #374151',
              fontSize: 10,
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600, color: '#60a5fa' }}>{selectedElement.tagName}</span>
            {selectedElement.className ? (
              <span style={{ color: '#9ca3af' }}>.{selectedElement.className.split(' ')[0]}</span>
            ) : null}
            <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 9 }}>
              {selectedElement.path.length > 40
                ? '...' + selectedElement.path.slice(-40)
                : selectedElement.path}
            </span>
            {/* Edit Classes Button */}
            <button
              onClick={startEditingClasses}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: 3,
                color: '#fff',
                fontSize: 9,
                fontWeight: 500,
                cursor: 'pointer',
              }}
              title="Edit Tailwind classes"
            >
              <EditIcon />
              Classes
            </button>
          </div>
        ) : null}

        {/* Inline Class Editor */}
        {editMode && selectedElement && editingClasses ? (
          <div
            style={{
              padding: '8px 10px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid #374151',
            }}
          >
            <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>Tailwind Classes</div>
            <textarea
              value={classEditorValue}
              onChange={(e) => {
                setClassEditorValue(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitClassChanges();
                } else if (e.key === 'Escape') {
                  cancelEditing();
                }
              }}
              style={{
                width: '100%',
                minHeight: 40,
                padding: '6px 8px',
                backgroundColor: '#0f172a',
                border: '1px solid #475569',
                borderRadius: 4,
                color: '#e2e8f0',
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                resize: 'vertical',
                outline: 'none',
              }}
              placeholder="e.g., p-4 bg-blue-500 text-white"
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={submitClassChanges}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#22c55e',
                  border: 'none',
                  borderRadius: 3,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
              <button
                onClick={cancelEditing}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#64748b',
                  border: 'none',
                  borderRadius: 3,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6b7280' }}>
                Enter to apply, Esc to cancel
              </span>
            </div>
          </div>
        ) : null}

        {/* Live Preview */}
        <div
          className="live-sandpack-node__preview"
          style={{
            height:
              editMode && selectedElement
                ? previewHeight - 28 - (editingClasses ? 100 : 0)
                : previewHeight,
          }}
        >
          <EsmPreview
            nodeId={id}
            instanceId={instanceId}
            code={data.code}
            deviceId={currentDeviceId}
            deviceWidth={currentDevice.width}
            deviceHeight={currentDevice.height}
            nodeWidth={nodeSize.width}
            nodeHeight={
              editMode && selectedElement
                ? previewHeight - 28 - (editingClasses ? 100 : 0)
                : previewHeight
            }
            editMode={editMode}
            onReady={handlePreviewReady}
            onError={handlePreviewError}
            onElementSelect={handleElementSelect}
            pendingClassUpdate={pendingClassUpdate}
          />
        </div>
      </div>

      {/* Connection handles */}
      <Handle type="target" position={Position.Top} className="live-sandpack-node__handle" />
      <Handle type="source" position={Position.Bottom} className="live-sandpack-node__handle" />
    </>
  );
}

// Default node data
export function getDefaultEsmSandpackNodeData(): EsmSandpackNodeData {
  return {
    label: 'Component',
    code: `import React from 'react';

export default function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-900">
        Hello World
      </h1>
      <p className="text-gray-600 mt-2">
        Edit this component to see live updates
      </p>
    </div>
  );
}`,
    deviceId: 'iphone-14',
  };
}
