import { Handle, Position } from '@xyflow/react';
import React, { useMemo, useCallback } from 'react';

import { LayerAgentToolbar } from '../components/agent/LayerAgentToolbar';
import { components } from '../lib/design/designTokens';

import type { NodeProps } from '@xyflow/react';
import './SandpackNode.css';

// Node data interface
export interface SandpackNodeData {
  label: string;
  code: string;
  viewport: 'mobile' | 'tablet' | 'desktop';
  showCode: boolean;
  customCSS?: string;
  [key: string]: unknown;
}

export interface SandpackNodeProps extends NodeProps {
  data: SandpackNodeData;
}

// Icons
const CodeIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

/**
 * SandpackNode - React Flow node representing a live React component
 *
 * Shows a code preview with AI agent toolbar when selected.
 * The component is editable via the Code tab in the right sidebar.
 */
export function SandpackNode({ id, data, selected }: SandpackNodeProps): React.JSX.Element {
  // Extract first few lines of code for preview
  const codePreview = useMemo(() => {
    const lines = data.code.split('\n').slice(0, 8);
    return lines.join('\n');
  }, [data.code]);

  // Count lines of code
  const lineCount = useMemo(() => {
    return data.code.split('\n').length;
  }, [data.code]);

  // Handle skill activation from the toolbar
  // Dispatches a custom event that AgentChatPanel listens to
  const handleSkillActivate = useCallback(
    (skillId: string, prompt: string) => {
      // Dispatch a custom event for the chat panel to handle
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

  return (
    <>
      {/* AI Agent Toolbar - appears above node when selected */}
      <LayerAgentToolbar
        nodeId={id}
        label={data.label}
        code={data.code}
        isVisible={selected || false}
        onSkillActivate={handleSkillActivate}
      />

      <div
        className={`sandpack-node ${selected ? 'sandpack-node--selected' : ''}`}
        style={{ width: components.node.width }}
      >
        {/* Header */}
        <div className="sandpack-node__header">
          <div className="sandpack-node__header-left">
            <div className="sandpack-node__icon-wrapper">
              <CodeIcon />
            </div>
            <span className="sandpack-node__label">{data.label}</span>
          </div>
          <div className="sandpack-node__header-right">
            <span className="sandpack-node__viewport-badge">{data.viewport}</span>
          </div>
        </div>

        {/* Code Preview */}
        <div className="sandpack-node__code-preview">
          <pre className="sandpack-node__code">{codePreview}</pre>
          {lineCount > 8 && (
            <div className="sandpack-node__fade-overlay">
              <span className="sandpack-node__more-lines">+{lineCount - 8} more lines</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sandpack-node__footer">
          <span className="sandpack-node__footer-text">{lineCount} lines</span>
        </div>
      </div>

      {/* Connection handles */}
      <Handle type="target" position={Position.Top} className="sandpack-node__handle" />
      <Handle type="source" position={Position.Bottom} className="sandpack-node__handle" />
    </>
  );
}

// Default node data
export function getDefaultSandpackNodeData(): SandpackNodeData {
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
    showCode: false,
  };
}
