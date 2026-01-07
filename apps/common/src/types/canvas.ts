/**
 * Canvas Types for Tauri IPC
 *
 * These types must match the Rust protocol types in src-tauri/src/agent/protocol.rs
 * AND the agent-bridge types in agent-bridge/src/canvas/types.ts
 *
 * All schemas use .strict() to reject extra keys for type safety.
 *
 * ⚠️  TESTED: These schemas are validated by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test files:
 *     - agent-bridge/src/__tests__/canvas-types.test.ts
 *     - agent-bridge/src/__tests__/canvas-real-e2e.test.ts (REAL API validation)
 */

import { z } from 'zod';

// =============================================================================
// POSITION & ENUM SCHEMAS
// =============================================================================

/** Position on the canvas */
export const CanvasPositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();
export type CanvasPosition = z.infer<typeof CanvasPositionSchema>;

/** Node type discriminator - matches Rust #[serde(rename_all = "lowercase")] */
export const CanvasNodeTypeSchema = z.enum(['sandpack', 'page']);
export type CanvasNodeType = z.infer<typeof CanvasNodeTypeSchema>;

/** Page layout mode */
export const PageLayoutSchema = z.enum(['flex', 'grid', 'stack']);
export type PageLayout = z.infer<typeof PageLayoutSchema>;

/** Page viewport size */
export const PageViewportSchema = z.enum(['desktop', 'tablet', 'mobile']);
export type PageViewport = z.infer<typeof PageViewportSchema>;

/** Slot position mode */
export const SlotPositionModeSchema = z.enum(['flow', 'absolute']);
export type SlotPositionMode = z.infer<typeof SlotPositionModeSchema>;

/** Layout direction */
export const LayoutDirectionSchema = z.enum(['row', 'column']);
export type LayoutDirection = z.infer<typeof LayoutDirectionSchema>;

/** Tool execution status */
export const ToolExecutionStatusSchema = z.enum(['pending', 'running', 'success', 'error']);
export type ToolExecutionStatus = z.infer<typeof ToolExecutionStatusSchema>;

/** Canvas session status */
export const CanvasSessionStatusSchema = z.enum(['ready', 'busy', 'error']);
export type CanvasSessionStatus = z.infer<typeof CanvasSessionStatusSchema>;

// =============================================================================
// LAYOUT & SLOT SCHEMAS
// =============================================================================

/** Layout options for page nodes */
export const LayoutOptionsSchema = z
  .object({
    direction: LayoutDirectionSchema.optional(),
    gap: z.string().optional(),
    padding: z.string().optional(),
    alignItems: z.string().optional(),
    justifyContent: z.string().optional(),
    wrap: z.boolean().optional(),
    gridColumns: z.string().optional(),
    gridRows: z.string().optional(),
    gridAreas: z.array(z.string()).optional(),
  })
  .strict();
export type LayoutOptions = z.infer<typeof LayoutOptionsSchema>;

/** Slot position within a page */
export const SlotPositionSchema = z
  .object({
    mode: SlotPositionModeSchema.optional(),
    gridArea: z.string().optional(),
    flexGrow: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
  })
  .strict();
export type SlotPosition = z.infer<typeof SlotPositionSchema>;

/** A slot in a page that contains a component reference */
export const PageSlotSchema = z
  .object({
    slotId: z.string(),
    componentId: z.string(),
    position: SlotPositionSchema.optional(),
    zIndex: z.number().optional(),
    visible: z.boolean().optional(),
  })
  .strict();
export type PageSlot = z.infer<typeof PageSlotSchema>;

/** Background options for page nodes */
export const PageBackgroundSchema = z
  .object({
    color: z.string().optional(),
    gradient: z.string().optional(),
  })
  .strict();
export type PageBackground = z.infer<typeof PageBackgroundSchema>;

// =============================================================================
// NODE DATA SCHEMAS
// =============================================================================

/** Data for sandpack (component) nodes */
export const SandpackNodeDataSchema = z
  .object({
    name: z.string(),
    code: z.string(),
    error: z.string().optional(),
    isLoading: z.boolean().optional(),
  })
  .strict();
export type SandpackNodeData = z.infer<typeof SandpackNodeDataSchema>;

/** Data for page (container) nodes */
export const PageNodeDataSchema = z
  .object({
    name: z.string().optional(),
    layout: PageLayoutSchema.optional(),
    layoutOptions: LayoutOptionsSchema.optional(),
    viewport: PageViewportSchema.optional(),
    background: PageBackgroundSchema.optional(),
    slots: z.array(PageSlotSchema).optional(),
  })
  .strict();
export type PageNodeData = z.infer<typeof PageNodeDataSchema>;

// =============================================================================
// CANVAS NODE SCHEMAS (Tagged Union)
// =============================================================================

/** Sandpack node - renders React components */
export const SandpackNodeSchema = z
  .object({
    type: z.literal('sandpack'),
    id: z.string(),
    position: CanvasPositionSchema,
    data: SandpackNodeDataSchema,
  })
  .strict();
export type SandpackNode = z.infer<typeof SandpackNodeSchema>;

/** Page node - container for composing multiple components */
export const PageNodeSchema = z
  .object({
    type: z.literal('page'),
    id: z.string(),
    position: CanvasPositionSchema,
    data: PageNodeDataSchema,
  })
  .strict();
export type PageNode = z.infer<typeof PageNodeSchema>;

/** Canvas node - discriminated union for type-safe node variants */
export const CanvasNodeSchema = z.discriminatedUnion('type', [SandpackNodeSchema, PageNodeSchema]);
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

/** Edge connecting two nodes on the canvas */
export const CanvasEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

// =============================================================================
// STATE SCHEMAS
// =============================================================================

/** Complete canvas state */
export const CanvasStateSchema = z
  .object({
    nodes: z.array(CanvasNodeSchema),
    edges: z.array(CanvasEdgeSchema),
    selectedNodeId: z.string().nullish(),
    selectedNodeType: CanvasNodeTypeSchema.optional(),
  })
  .strict();
export type CanvasState = z.infer<typeof CanvasStateSchema>;

/** Canvas session configuration */
export const CanvasSessionConfigSchema = z
  .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    model: z.string().optional(),
    thinkingEnabled: z.boolean().optional(),
  })
  .strict();
export type CanvasSessionConfig = z.infer<typeof CanvasSessionConfigSchema>;

/** Canvas session state */
export const CanvasSessionSchema = z
  .object({
    config: CanvasSessionConfigSchema,
    status: CanvasSessionStatusSchema,
    state: CanvasStateSchema,
  })
  .strict();
export type CanvasSession = z.infer<typeof CanvasSessionSchema>;

// =============================================================================
// SDK MESSAGE SCHEMAS
// =============================================================================

/** SDK message type discriminator - matches Rust #[serde(rename_all = "snake_case")] */
export const SDKMessageTypeSchema = z.enum(['text', 'thinking', 'tool_use', 'error', 'result']);
export type SDKMessageType = z.infer<typeof SDKMessageTypeSchema>;

/** Metadata for tool_use messages */
export const ToolUseMetadataSchema = z
  .object({
    toolName: z.string(),
    toolId: z.string(),
    toolInput: z.record(z.string(), z.unknown()),
    status: ToolExecutionStatusSchema,
  })
  .strict();
export type ToolUseMetadata = z.infer<typeof ToolUseMetadataSchema>;

/** Metadata for error messages */
export const ErrorMetadataSchema = z
  .object({
    code: z.string().optional(),
    recoverable: z.boolean().optional(),
  })
  .strict();
export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

/** Message from the canvas agent to the UI */
export const SDKMessageSchema = z
  .object({
    type: SDKMessageTypeSchema,
    content: z.string(),
    metadata: z
      .union([ToolUseMetadataSchema, ErrorMetadataSchema, z.record(z.string(), z.unknown())])
      .optional(),
  })
  .strict();
export type SDKMessage = z.infer<typeof SDKMessageSchema>;

// =============================================================================
// MCP TOOL SCHEMAS
// =============================================================================

/** JSON Schema type for tool input schemas (recursive type) */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  description?: string;
}

/** MCP Tool definition - matches Claude Agent SDK format */
export interface CanvasTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** Tool request sent to webview for execution */
export const McpToolRequestSchema = z
  .object({
    requestId: z.string(),
    toolName: z.string(),
    toolInput: z.record(z.string(), z.unknown()),
  })
  .strict();
export type McpToolRequest = z.infer<typeof McpToolRequestSchema>;

/** Tool response from webview after execution */
export const McpToolResponseSchema = z
  .object({
    requestId: z.string(),
    success: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .strict();
export type McpToolResponse = z.infer<typeof McpToolResponseSchema>;

// =============================================================================
// TAURI EVENT PAYLOAD SCHEMAS
// =============================================================================

/** Payload for canvas:message event */
export const CanvasMessagePayloadSchema = z
  .object({
    sessionId: z.string(),
    message: SDKMessageSchema,
  })
  .strict();
export type CanvasMessagePayload = z.infer<typeof CanvasMessagePayloadSchema>;

/** Payload for canvas:tool_request event */
export const CanvasToolRequestPayloadSchema = z
  .object({
    sessionId: z.string(),
    request: McpToolRequestSchema,
  })
  .strict();
export type CanvasToolRequestPayload = z.infer<typeof CanvasToolRequestPayloadSchema>;

/** Payload for canvas:error event */
export const CanvasErrorPayloadSchema = z
  .object({
    sessionId: z.string(),
    error: z.string(),
  })
  .strict();
export type CanvasErrorPayload = z.infer<typeof CanvasErrorPayloadSchema>;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Type guard for SandpackNode */
export function isSandpackNode(node: CanvasNode): node is SandpackNode {
  return node.type === 'sandpack';
}

/** Type guard for PageNode */
export function isPageNode(node: CanvasNode): node is PageNode {
  return node.type === 'page';
}

/** Type guard for ToolUseMetadata */
export function isToolUseMetadata(metadata: unknown): metadata is ToolUseMetadata {
  return ToolUseMetadataSchema.safeParse(metadata).success;
}

/** Type guard for ErrorMetadata */
export function isErrorMetadata(metadata: unknown): metadata is ErrorMetadata {
  return ErrorMetadataSchema.safeParse(metadata).success;
}

// =============================================================================
// PARSE HELPERS
// =============================================================================

/** Parse and validate canvas state from unknown data */
export function parseCanvasState(data: unknown): CanvasState {
  return CanvasStateSchema.parse(data);
}

/** Safely parse canvas state, returning null on failure */
export function safeParseCanvasState(data: unknown): CanvasState | null {
  const result = CanvasStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Parse and validate SDK message from unknown data */
export function parseSDKMessage(data: unknown): SDKMessage {
  return SDKMessageSchema.parse(data);
}

/** Safely parse SDK message, returning null on failure */
export function safeParseSDKMessage(data: unknown): SDKMessage | null {
  const result = SDKMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Parse and validate canvas node from unknown data */
export function parseCanvasNode(data: unknown): CanvasNode {
  return CanvasNodeSchema.parse(data);
}

/** Safely parse canvas node, returning null on failure */
export function safeParseCanvasNode(data: unknown): CanvasNode | null {
  const result = CanvasNodeSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Parse and validate MCP tool request from unknown data */
export function parseMcpToolRequest(data: unknown): McpToolRequest {
  return McpToolRequestSchema.parse(data);
}

/** Safely parse MCP tool request, returning null on failure */
export function safeParseMcpToolRequest(data: unknown): McpToolRequest | null {
  const result = McpToolRequestSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Parse and validate MCP tool response from unknown data */
export function parseMcpToolResponse(data: unknown): McpToolResponse {
  return McpToolResponseSchema.parse(data);
}

/** Safely parse MCP tool response, returning null on failure */
export function safeParseMcpToolResponse(data: unknown): McpToolResponse | null {
  const result = McpToolResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}
