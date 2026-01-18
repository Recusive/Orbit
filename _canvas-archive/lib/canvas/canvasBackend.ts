/**
 * Canvas Backend abstraction layer for Tauri
 *
 * This module provides a unified API for canvas operations.
 * All functions use Tauri invoke() for communication with the Rust backend.
 */

// ============================================
// Tauri Detection & Imports
// ============================================

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    console.warn(`[Mock] invoke('${command}')`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

// ============================================
// Canvas Types
// ============================================

/** Position on the canvas */
export interface CanvasPosition {
  x: number;
  y: number;
}

/** Node type discriminator */
export type CanvasNodeType = 'sandpack' | 'page';

/** Page layout mode */
export type PageLayout = 'flex' | 'grid' | 'stack';

/** Page viewport size */
export type PageViewport = 'desktop' | 'tablet' | 'mobile';

/** Slot position mode */
export type SlotPositionMode = 'flow' | 'absolute';

/** Layout options for page nodes */
export interface LayoutOptions {
  direction?: string;
  gap?: string;
  padding?: string;
  alignItems?: string;
  justifyContent?: string;
  wrap?: boolean;
  gridColumns?: string;
  gridRows?: string;
  gridAreas?: string[];
}

/** Slot position within a page */
export interface SlotPosition {
  mode?: SlotPositionMode;
  gridArea?: string;
  flexGrow?: number;
  x?: number;
  y?: number;
  width?: string;
  height?: string;
}

/** A slot in a page that contains a component reference */
export interface PageSlot {
  slotId: string;
  componentId: string;
  position?: SlotPosition;
  zIndex?: number;
  visible?: boolean;
}

/** Background options for page nodes */
export interface PageBackground {
  color?: string;
  gradient?: string;
}

/** Data for sandpack (component) nodes */
export interface SandpackNodeData {
  name: string;
  code: string;
  error?: string;
  isLoading?: boolean;
}

/** Data for page (container) nodes */
export interface PageNodeData {
  name?: string;
  layout?: PageLayout;
  layoutOptions?: LayoutOptions;
  viewport?: PageViewport;
  background?: PageBackground;
  slots?: PageSlot[];
}

/** Sandpack canvas node */
export interface SandpackNode {
  type: 'sandpack';
  id: string;
  position: CanvasPosition;
  data: SandpackNodeData;
}

/** Page canvas node */
export interface PageNode {
  type: 'page';
  id: string;
  position: CanvasPosition;
  data: PageNodeData;
}

/** Canvas node - tagged union for type-safe node variants */
export type CanvasNode = SandpackNode | PageNode;

/** Edge connecting two nodes on the canvas */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: unknown;
}

/** Complete canvas state */
export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId?: string;
  selectedNodeType?: CanvasNodeType;
}

/** Canvas session configuration */
export interface CanvasSessionConfig {
  sessionId?: string;
  cwd?: string;
  model?: string;
  thinkingEnabled?: boolean;
}

/** Tool response from webview after execution */
export interface McpToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================
// Canvas Session Operations
// ============================================

/**
 * Create a new canvas session.
 *
 * @param sessionId - Unique identifier for the session
 * @param config - Optional session configuration
 */
export async function canvasCreateSession(
  sessionId: string,
  config?: CanvasSessionConfig
): Promise<void> {
  return invoke('canvas_create_session', { sessionId, config });
}

/**
 * Delete a canvas session.
 *
 * @param sessionId - Session identifier to delete
 */
export async function canvasDeleteSession(sessionId: string): Promise<void> {
  return invoke('canvas_delete_session', { sessionId });
}

/**
 * Send a message to a canvas session with the current canvas state.
 *
 * @param sessionId - Session identifier
 * @param message - User message to send
 * @param state - Current canvas state (nodes, edges, selection)
 */
export async function canvasSendMessage(
  sessionId: string,
  message: string,
  state: CanvasState
): Promise<void> {
  return invoke('canvas_send_message', { sessionId, message, canvasState: state });
}

/**
 * Interrupt a running canvas session.
 *
 * @param sessionId - Session identifier to interrupt
 */
export async function canvasInterrupt(sessionId: string): Promise<void> {
  return invoke('canvas_interrupt', { sessionId });
}

/**
 * Send a tool response back to a canvas session.
 *
 * @param sessionId - Session identifier
 * @param response - Tool execution response
 */
export async function canvasToolResponse(
  sessionId: string,
  response: McpToolResponse
): Promise<void> {
  return invoke('canvas_tool_response', { sessionId, response });
}

// ============================================
// Utility
// ============================================

/**
 * Check if running in Tauri environment.
 */
export function isTauri(): boolean {
  return IS_TAURI;
}
