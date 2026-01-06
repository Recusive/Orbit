/**
 * LiveSandpackNode - Canvas node with live inline React component rendering
 *
 * Replaces the code preview with an actual rendered preview inside the node.
 * Features:
 * - Embedded SandpackProvider per node
 * - Scaled iframe preview using InlinePreview
 * - NodeResizer for resize handles
 * - Registers with SandpackInstanceManager for lifecycle management
 */
import { SandpackProvider } from '@codesandbox/sandpack-react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LayerAgentToolbar } from '../components/LayerAgentToolbar';

import { InlinePreview } from './InlinePreview';
import { useSandpackInstanceManager } from './SandpackInstanceManager';
import {
  SANDPACK_DEPENDENCIES,
  INDEX_TEMPLATE,
  createHtmlTemplateWithBridge,
  ensureReactImport,
} from './sandpackConfig';

import type { ViewportType } from './sandpackConfig';
import type { NodeProps } from '@xyflow/react';

import './LiveSandpackNode.css';

// Node data interface
export interface LiveSandpackNodeData {
  label: string;
  code: string;
  viewport: ViewportType;
  isLoading?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export interface LiveSandpackNodeProps extends NodeProps {
  data: LiveSandpackNodeData;
}

// Generate unique instance ID
function generateInstanceId(nodeId: string): string {
  return `${nodeId}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

// Icons
const PlayIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

/**
 * LiveSandpackNode - React Flow node with embedded live preview
 */
export function LiveSandpackNode({ id, data, selected }: LiveSandpackNodeProps): React.JSX.Element {
  const [nodeSize, setNodeSize] = useState({ width: 320, height: 280 });
  const [instanceId] = useState(() => generateInstanceId(id));
  const containerRef = useRef<HTMLDivElement>(null);

  // Instance manager for lifecycle tracking
  const { register, unregister, updateStatus } = useSandpackInstanceManager();

  // Register on mount, unregister on unmount
  useEffect(() => {
    register(id, instanceId);
    return (): void => {
      unregister(instanceId);
    };
  }, [id, instanceId, register, unregister]);

  // Handle resize
  const handleResize = useCallback((_: unknown, params: { width: number; height: number }) => {
    setNodeSize({ width: params.width, height: params.height });
  }, []);

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
  const handlePreviewReady = useCallback(
    (instId: string) => {
      updateStatus(instId, 'ready');
    },
    [updateStatus]
  );

  // Handle preview error
  const handlePreviewError = useCallback(
    (instId: string, error: string) => {
      updateStatus(instId, 'error', error);
    },
    [updateStatus]
  );

  // Build Sandpack files (ensure React import for JSX support)
  const sandpackFiles = useMemo(() => {
    const files = {
      '/App.tsx': ensureReactImport(data.code),
      '/index.tsx': INDEX_TEMPLATE,
      '/public/index.html': createHtmlTemplateWithBridge(id, instanceId),
    };
    return files;
  }, [data.code, id, instanceId]);

  // Calculate available preview height (total height minus header)
  const previewHeight = nodeSize.height - 40; // 40px for header

  return (
    <>
      {/* Resize handles */}
      <NodeResizer
        minWidth={200}
        minHeight={180}
        maxWidth={800}
        maxHeight={600}
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
        ref={containerRef}
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
          </div>
          <div className="live-sandpack-node__header-right">
            <span className="live-sandpack-node__viewport-badge">{data.viewport}</span>
          </div>
        </div>

        {/* Live Preview */}
        <div className="live-sandpack-node__preview" style={{ height: previewHeight }}>
          <SandpackProvider
            template="react-ts"
            theme="light"
            files={sandpackFiles}
            customSetup={{
              dependencies: SANDPACK_DEPENDENCIES,
            }}
            options={{
              externalResources: ['https://cdn.tailwindcss.com'],
              // Extend bundler timeout to 60 seconds (default is 30s)
              bundlerTimeOut: 60000,
              // Only initialize when node is visible in viewport
              initMode: 'user-visible',
            }}
          >
            <InlinePreview
              nodeId={id}
              instanceId={instanceId}
              viewport={data.viewport}
              nodeWidth={nodeSize.width}
              nodeHeight={previewHeight}
              onReady={handlePreviewReady}
              onError={handlePreviewError}
            />
          </SandpackProvider>
        </div>
      </div>

      {/* Connection handles */}
      <Handle type="target" position={Position.Top} className="live-sandpack-node__handle" />
      <Handle type="source" position={Position.Bottom} className="live-sandpack-node__handle" />
    </>
  );
}

// Default node data
export function getDefaultLiveSandpackNodeData(): LiveSandpackNodeData {
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
    viewport: 'desktop',
  };
}
