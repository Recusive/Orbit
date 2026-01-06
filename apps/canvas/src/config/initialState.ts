/**
 * Initial canvas state configuration
 * Contains default nodes, edges, and node creation utilities
 */
import { getComponentLabel, getComponentTemplate } from '../lib/components/componentTemplates';
import { getDefaultPageNodeData } from '../sandpack/index';

import type { ComponentType } from '../lib/components/componentTemplates';
import type { SandpackNodeData } from '../sandpack/SandpackNode';
import type { Edge, Node } from '@xyflow/react';

/**
 * Create SandpackNode data from a component type template
 */
export function createSandpackNodeData(componentType: string): SandpackNodeData {
  const type = componentType as ComponentType;
  return {
    label: getComponentLabel(type),
    code: getComponentTemplate(type),
    viewport: 'mobile',
    showCode: false,
  };
}

/**
 * Generate unique node ID
 */
export function generateNodeId(type: string): string {
  return `${type}-${String(Date.now())}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a page node with default data
 */
export function createPageNode(position: { x: number; y: number }, name?: string): Node {
  const data = getDefaultPageNodeData();
  if (name !== undefined && name !== '') {
    data.name = name;
  }
  return {
    id: generateNodeId('page'),
    type: 'page',
    position,
    data,
  };
}

/**
 * Default initial nodes for a new canvas
 * Code-first: Demo nodes are all SandpackNodes with live code
 */
export const initialNodes: Node[] = [
  // Welcome card component
  {
    id: 'sandpack-welcome',
    type: 'sandpack',
    position: { x: 100, y: 50 },
    data: {
      label: 'Welcome Card',
      code: `export default function App() {
	return (
		<div className="p-6 max-w-sm mx-auto bg-white rounded-xl shadow-lg">
			<div className="flex items-center space-x-4">
				<div className="shrink-0">
					<div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
				</div>
				<div>
					<div className="text-xl font-medium text-black">Welcome!</div>
					<p className="text-slate-500">Click a node to preview in sidebar</p>
				</div>
			</div>
		</div>
	);
}`,
      viewport: 'mobile',
      showCode: false,
    },
  },
  // Button component
  {
    id: 'sandpack-button',
    type: 'sandpack',
    position: { x: 550, y: 50 },
    data: createSandpackNodeData('button'),
  },
  // Form component
  {
    id: 'sandpack-form',
    type: 'sandpack',
    position: { x: 100, y: 400 },
    data: createSandpackNodeData('form'),
  },
  // Card component
  {
    id: 'sandpack-card',
    type: 'sandpack',
    position: { x: 550, y: 400 },
    data: createSandpackNodeData('card'),
  },
];

/**
 * Edges represent import/composition relationships
 */
export const initialEdges: Edge[] = [];
