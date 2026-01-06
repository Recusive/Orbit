/**
 * IPC Protocol Types
 *
 * Strict TypeScript types for postMessage communication between
 * Canvas webview and VS Code Extension Host.
 *
 * This file is the single source of truth for all IPC message types.
 */

// =============================================================================
// PERCEPTION TYPES (from Sandpack iframe)
// =============================================================================

export interface AriaNode {
  role: string;
  name?: string;
  description?: string;
  value?: string;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  level?: number;
  children?: AriaNode[];
}

export interface ComputedStyleValue {
  raw: string;
  token?: string;
  semantic?: string;
}

export interface ElementBounds {
  selector: string;
  tagName: string;
  id?: string;
  className?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  sourceLoc?: string;
}

export interface AriaSnapshotResult {
  ariaTree: AriaNode;
  textRepresentation: string;
  elementCount: number;
}

export interface ComputedStylesResult {
  selector: string;
  matchCount: number;
  styles: Record<string, ComputedStyleValue>;
  suggestedClasses?: string[];
}

export interface ElementBoundsResult {
  elements: ElementBounds[];
  viewport: { width: number; height: number };
}

export interface VerifyResult {
  rendered: boolean;
  errors?: string[];
  ariaSummary: string;
  foundElements?: string[];
  missingElements?: string[];
  dimensions?: { width: number; height: number };
}

export type PerceptionResult =
  | AriaSnapshotResult
  | ComputedStylesResult
  | ElementBoundsResult
  | VerifyResult;

// =============================================================================
// COMPONENT TOOL DATA TYPES
// =============================================================================

export interface CreateComponentData {
  nodeId: string;
  name: string;
  code: string;
  position: { x: number; y: number };
}

export interface UpdateComponentData {
  nodeId: string;
  code: string;
  name?: string;
}

export interface DeleteComponentData {
  nodeId: string;
}

export interface ConnectComponentsData {
  edgeId: string;
  sourceId: string;
  targetId: string;
}

export interface MoveComponentData {
  nodeId: string;
  position: { x: number; y: number };
}

// =============================================================================
// PERCEPTION TOOL DATA TYPES
// =============================================================================

export interface GetAriaSnapshotData {
  nodeId: string;
  includeHidden?: boolean;
  requestId: string;
}

export interface GetComputedStylesData {
  nodeId: string;
  selector?: string;
  properties?: string[];
  requestId: string;
}

export interface GetElementBoundsData {
  nodeId: string;
  selector?: string;
  includeChildren?: boolean;
  requestId: string;
}

export interface VerifyComponentData {
  nodeId: string;
  expectedElements?: string[];
  requestId: string;
}

// =============================================================================
// PAGE COMPOSITION TOOL DATA TYPES
// =============================================================================

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

export interface CreatePageData {
  pageId: string;
  name?: string;
  layout?: 'flex' | 'grid' | 'stack';
  layoutOptions?: LayoutOptions;
  viewport?: 'desktop' | 'tablet' | 'mobile';
  background?: {
    color?: string;
    gradient?: string;
  };
  position?: { x: number; y: number };
}

export interface SlotPosition {
  mode?: 'flow' | 'absolute';
  gridArea?: string;
  flexGrow?: number;
  x?: number;
  y?: number;
  width?: string;
  height?: string;
}

export interface AddToPageData {
  pageId: string;
  componentId: string;
  slotId?: string;
  position?: SlotPosition;
  zIndex?: number;
}

export interface RemoveFromPageData {
  pageId: string;
  slotId: string;
}

export interface ReorderLayersData {
  pageId: string;
  slotId: string;
  newIndex: number;
  zIndex?: number;
}

export interface UpdateLayoutData {
  pageId: string;
  layout?: 'flex' | 'grid' | 'stack';
  layoutOptions?: LayoutOptions;
}

export interface UpdatePageSlotData {
  pageId: string;
  slotId: string;
  position?: SlotPosition;
  zIndex?: number;
  visible?: boolean;
}

// =============================================================================
// CANVAS TOOL DISCRIMINATED UNION
// =============================================================================

export type CanvasToolData =
  // Component tools
  | { tool: 'create_component'; data: CreateComponentData }
  | { tool: 'update_component'; data: UpdateComponentData }
  | { tool: 'delete_component'; data: DeleteComponentData }
  | { tool: 'connect_components'; data: ConnectComponentsData }
  | { tool: 'move_component'; data: MoveComponentData }
  // Perception tools
  | { tool: 'get_aria_snapshot'; data: GetAriaSnapshotData }
  | { tool: 'get_computed_styles'; data: GetComputedStylesData }
  | { tool: 'get_element_bounds'; data: GetElementBoundsData }
  | { tool: 'verify_component'; data: VerifyComponentData }
  // Page Composition tools
  | { tool: 'create_page'; data: CreatePageData }
  | { tool: 'add_to_page'; data: AddToPageData }
  | { tool: 'remove_from_page'; data: RemoveFromPageData }
  | { tool: 'reorder_layers'; data: ReorderLayersData }
  | { tool: 'update_layout'; data: UpdateLayoutData }
  | { tool: 'update_page_slot'; data: UpdatePageSlotData };

// =============================================================================
// MCP PROTOCOL TYPES
// =============================================================================

export interface McpToolRequest {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface McpToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// =============================================================================
// ORCHESTRATOR TYPES (imported from orchestrator module)
// =============================================================================

import type {
  OrchestratorState,
  OrchestratorError,
  Conflict,
  Resolution,
  OrchestratorControlAction,
} from '../orchestrator/types';

// Re-export for convenience
export type {
  OrchestratorState,
  OrchestratorError,
  Conflict,
  Resolution,
  OrchestratorControlAction,
};

// =============================================================================
// CANVAS → EXTENSION HOST MESSAGES
// =============================================================================

export interface SandpackErrorMessage {
  type: 'sandpack-error';
  nodeId: string;
  error: string;
  stack?: string;
}

export interface RequestFixMessage {
  type: 'request-fix';
  nodeId: string;
  code: string;
  error: string;
}

export interface SendPromptMessage {
  type: 'send-prompt';
  prompt: string;
  nodeId?: string;
}

export interface CanvasStateMessage {
  type: 'canvas-state';
  nodes: unknown[];
  edges: unknown[];
  selectedNodeId?: string;
  selectedNodeType?: 'sandpack' | 'page';
}

export interface CreateSessionMessage {
  type: 'create-session';
  sessionId: string;
}

export interface DeleteSessionMessage {
  type: 'delete-session';
  sessionId: string;
}

export interface ExportComponentMessage {
  type: 'export-component';
  nodeId: string;
  code: string;
  suggestedFilename: string;
}

export interface PerceptionResultMessage {
  type: 'perception-result';
  requestId: string;
  toolName: string;
  nodeId: string;
  result: PerceptionResult;
}

export interface McpToolResponseMessage {
  type: 'mcp-tool-response';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface WebviewReadyMessage {
  type: 'webview-ready';
}

export interface CanvasInitializedMessage {
  type: 'canvas-initialized';
  payload?: unknown;
}

// Orchestrator messages (Canvas -> Extension)
export interface ConflictResolutionMessage {
  type: 'conflict-resolution';
  conflictId: string;
  resolution: Resolution;
}

export interface OrchestratorControlMessage {
  type: 'orchestrator-control';
  action: OrchestratorControlAction;
  taskId?: string;
}

export type CanvasToExtensionMessage =
  | SandpackErrorMessage
  | RequestFixMessage
  | SendPromptMessage
  | CanvasStateMessage
  | CreateSessionMessage
  | DeleteSessionMessage
  | ExportComponentMessage
  | PerceptionResultMessage
  | McpToolResponseMessage
  | WebviewReadyMessage
  | CanvasInitializedMessage
  | ConflictResolutionMessage
  | OrchestratorControlMessage;

// =============================================================================
// EXTENSION HOST → CANVAS MESSAGES
// =============================================================================

export interface AgentResponseMessage {
  type: 'agent-response';
  nodeId?: string;
  content: string;
  done: boolean;
}

export interface AgentThinkingMessage {
  type: 'agent-thinking';
  content: string;
}

export interface AgentToolUseMessage {
  type: 'agent-tool-use';
  toolName: string;
  toolId: string;
  toolInput: unknown;
  status: 'running' | 'success' | 'error';
}

export interface CodeUpdateMessage {
  type: 'code-update';
  nodeId: string;
  code: string;
}

export interface AgentErrorMessage {
  type: 'agent-error';
  error: string;
}

export interface SessionStateMessage {
  type: 'session-state';
  sessionId: string;
  status: 'ready' | 'busy' | 'error';
}

export interface ThemeUpdateMessage {
  type: 'theme-update';
  payload: {
    type: string;
    colors: {
      background?: string;
      foreground?: string;
    };
  };
}

export interface CanvasToolExecuteMessage {
  type: 'canvas-tool-execute';
  payload: CanvasToolData;
}

export interface ExportResultMessage {
  type: 'export-result';
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface McpToolRequestMessage {
  type: 'mcp-tool-request';
  payload: McpToolRequest;
}

export interface StateUpdateMessage {
  type: 'state-update';
  payload: {
    nodes: unknown[];
    edges: unknown[];
    selectedNodeId?: string;
    selectedNodeType?: 'sandpack' | 'page';
  };
}

export interface LayoutMessage {
  type: 'layout';
  payload: {
    width: number;
    height: number;
  };
}

// Orchestrator messages (Extension -> Canvas)
export interface OrchestratorStateMessage {
  type: 'orchestrator-state';
  payload: OrchestratorState;
}

export interface OrchestratorErrorMessage {
  type: 'orchestrator-error';
  payload: OrchestratorError;
}

export interface ConflictDetectedMessage {
  type: 'conflict-detected';
  payload: {
    conflict: Conflict;
    requiresUserInput: boolean;
    options?: Resolution[];
  };
}

export type ExtensionToCanvasMessage =
  | AgentResponseMessage
  | AgentThinkingMessage
  | AgentToolUseMessage
  | CodeUpdateMessage
  | AgentErrorMessage
  | SessionStateMessage
  | ThemeUpdateMessage
  | CanvasToolExecuteMessage
  | ExportResultMessage
  | McpToolRequestMessage
  | StateUpdateMessage
  | LayoutMessage
  | OrchestratorStateMessage
  | OrchestratorErrorMessage
  | ConflictDetectedMessage;

// =============================================================================
// COMBINED TYPE
// =============================================================================

export type OrbitMessage = CanvasToExtensionMessage | ExtensionToCanvasMessage;

// =============================================================================
// MESSAGE TYPE GUARDS (Runtime Validation)
// =============================================================================

const CANVAS_TO_EXTENSION_TYPES = new Set([
  'sandpack-error',
  'request-fix',
  'send-prompt',
  'canvas-state',
  'create-session',
  'delete-session',
  'export-component',
  'perception-result',
  'mcp-tool-response',
  'webview-ready',
  'canvas-initialized',
  // Orchestrator messages
  'conflict-resolution',
  'orchestrator-control',
]);

const EXTENSION_TO_CANVAS_TYPES = new Set([
  'agent-response',
  'agent-thinking',
  'agent-tool-use',
  'code-update',
  'agent-error',
  'session-state',
  'theme-update',
  'canvas-tool-execute',
  'export-result',
  'mcp-tool-request',
  'state-update',
  'layout',
  // Orchestrator messages
  'orchestrator-state',
  'orchestrator-error',
  'conflict-detected',
]);

/**
 * Check if a value is a valid message object with a type field
 */
function isMessageObject(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

/**
 * Validate that a message is a valid ExtensionToCanvasMessage
 */
export function isExtensionToCanvasMessage(message: unknown): message is ExtensionToCanvasMessage {
  if (!isMessageObject(message)) return false;
  return EXTENSION_TO_CANVAS_TYPES.has(message.type);
}

/**
 * Validate that a message is a valid CanvasToExtensionMessage
 */
export function isCanvasToExtensionMessage(message: unknown): message is CanvasToExtensionMessage {
  if (!isMessageObject(message)) return false;
  return CANVAS_TO_EXTENSION_TYPES.has(message.type);
}

/**
 * Parse and validate an incoming message from the extension host
 * Returns null if the message is invalid
 */
export function parseExtensionMessage(event: MessageEvent): ExtensionToCanvasMessage | null {
  const message: unknown = event.data;

  if (!isExtensionToCanvasMessage(message)) {
    return null;
  }

  return message;
}

// VS Code API type is declared in main.tsx to allow flexibility for mock API
