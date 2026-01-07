/**
 * Canvas Types Module
 */

// Core types
export type {
  // Node types
  CanvasPosition,
  CanvasNodeType,
  CanvasNodeBase,
  SandpackNode,
  PageNode,
  LayoutOptions,
  SlotPosition,
  PageSlot,
  CanvasNode,
  // Edge types
  CanvasEdge,
  // State types
  CanvasState,
  // Session types
  CanvasSessionConfig,
  CanvasSessionStatus,
  CanvasSession,
  // SDK Message types
  SDKMessageType,
  ToolUseMetadata,
  ErrorMetadata,
  SDKMessage,
  // MCP Tool types
  JSONSchema,
  CanvasTool,
  ToolExecutionStatus,
  McpToolRequest,
  McpToolResponse,
} from './types.js';

// Schemas
export {
  CanvasPositionSchema,
  CreateComponentResultSchema,
  UpdateComponentResultSchema,
  DeleteComponentResultSchema,
  ConnectComponentsResultSchema,
  MoveComponentResultSchema,
  ComponentInfoSchema,
  EdgeInfoSchema,
  SlotInfoSchema,
  LayoutInfoSchema,
  PageInfoSchema,
  GetCanvasStateResultSchema,
  AriaNodeSchema,
  GetAriaSnapshotResultSchema,
  ComputedStyleValueSchema,
  GetComputedStylesResultSchema,
  RectSchema,
  ElementBoundsSchema,
  GetElementBoundsResultSchema,
  VerifyComponentResultSchema,
  CreatePageResultSchema,
  AddToPageResultSchema,
  RemoveFromPageResultSchema,
  ReorderLayersResultSchema,
  UpdateLayoutResultSchema,
  UpdatePageSlotResultSchema,
  GenerateVariantsResultSchema,
  IterateDesignResultSchema,
  CreateLayoutResultSchema,
  CanvasToolResultSchema,
  getJsonSchema,
} from './schemas.js';

export type {
  CreateComponentResult,
  UpdateComponentResult,
  DeleteComponentResult,
  ConnectComponentsResult,
  MoveComponentResult,
  GetCanvasStateResult,
  GetAriaSnapshotResult,
  GetComputedStylesResult,
  GetElementBoundsResult,
  VerifyComponentResult,
  CreatePageResult,
  AddToPageResult,
  RemoveFromPageResult,
  ReorderLayersResult,
  UpdateLayoutResult,
  UpdatePageSlotResult,
  GenerateVariantsResult,
  IterateDesignResult,
  CreateLayoutResult,
  CanvasToolResult,
} from './schemas.js';
