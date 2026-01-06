/**
 * Canvas Types
 *
 * Core type definitions for canvas state, nodes, edges, and sessions.
 * Ported from Orbit's canvasIpcProtocol.ts - plain TypeScript only.
 */

// =============================================================================
// NODE TYPES
// =============================================================================

/**
 * Position on the canvas
 */
export interface CanvasPosition {
  x: number;
  y: number;
}

/**
 * Node type discriminator
 */
export type CanvasNodeType = 'sandpack' | 'page';

/**
 * Base node properties shared by all node types
 */
export interface CanvasNodeBase {
  id: string;
  type: CanvasNodeType;
  position: CanvasPosition;
  data: Record<string, unknown>;
}

/**
 * Sandpack (component) node - renders React components
 */
export interface SandpackNode extends CanvasNodeBase {
  type: 'sandpack';
  data: {
    name: string;
    code: string;
    error?: string;
    isLoading?: boolean;
  };
}

/**
 * Page node - container for composing multiple components
 */
export interface PageNode extends CanvasNodeBase {
  type: 'page';
  data: {
    name?: string;
    layout?: 'flex' | 'grid' | 'stack';
    layoutOptions?: LayoutOptions;
    viewport?: 'desktop' | 'tablet' | 'mobile';
    background?: {
      color?: string;
      gradient?: string;
    };
    slots?: PageSlot[];
  };
}

/**
 * Layout options for page nodes
 */
export interface LayoutOptions {
  direction?: 'row' | 'column';
  gap?: string;
  padding?: string;
  alignItems?: string;
  justifyContent?: string;
  wrap?: boolean;
  gridColumns?: string;
  gridRows?: string;
  gridAreas?: string[];
}

/**
 * Slot position within a page
 */
export interface SlotPosition {
  mode?: 'flow' | 'absolute';
  gridArea?: string;
  flexGrow?: number;
  x?: number;
  y?: number;
  width?: string;
  height?: string;
}

/**
 * A slot in a page that contains a component reference
 */
export interface PageSlot {
  slotId: string;
  componentId: string;
  position?: SlotPosition;
  zIndex?: number;
  visible?: boolean;
}

/**
 * Union type for all canvas nodes
 */
export type CanvasNode = SandpackNode | PageNode;

// =============================================================================
// EDGE TYPES
// =============================================================================

/**
 * Edge connecting two nodes on the canvas
 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// STATE TYPES
// =============================================================================

/**
 * Complete canvas state
 */
export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId?: string | null;
  selectedNodeType?: CanvasNodeType;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/**
 * Canvas session configuration
 */
export interface CanvasSessionConfig {
  sessionId?: string;
  cwd?: string;
  model?: string;
  thinkingEnabled?: boolean;
}

/**
 * Canvas session status
 */
export type CanvasSessionStatus = 'ready' | 'busy' | 'error';

/**
 * Canvas session state
 */
export interface CanvasSession {
  config: CanvasSessionConfig;
  status: CanvasSessionStatus;
  state: CanvasState;
}

// =============================================================================
// SDK MESSAGE TYPES
// =============================================================================

/**
 * SDK message type discriminator
 */
export type SDKMessageType = 'text' | 'thinking' | 'tool_use' | 'error' | 'result';

/**
 * Metadata for tool_use messages
 */
export interface ToolUseMetadata {
  toolName: string;
  toolId: string;
  toolInput: Record<string, unknown>;
  status: ToolExecutionStatus;
}

/**
 * Metadata for error messages
 */
export interface ErrorMetadata {
  code?: string;
  recoverable?: boolean;
}

/**
 * Message from the canvas agent to the UI
 */
export interface SDKMessage {
  type: SDKMessageType;
  content: string;
  metadata?: ToolUseMetadata | ErrorMetadata | Record<string, unknown>;
}

// =============================================================================
// MCP TOOL TYPES
// =============================================================================

/**
 * JSON Schema type for tool input schemas
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  description?: string;
}

/**
 * MCP Tool definition - matches Claude Agent SDK format
 */
export interface CanvasTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/**
 * Tool execution status
 */
export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * Tool request sent to webview for execution
 */
export interface McpToolRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * Tool response from webview after execution
 */
export interface McpToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}
