/**
 * Types exports
 */

// Design Node Types (unified system)
export * from './designNodeTypes';

// Page and custom CSS types
export * from './pageTypes';
export * from './customCSS';

// IPC Protocol (Canvas <-> Extension Host communication)
// Re-export selectively to avoid conflicts with pageTypes
export type {
  // Perception types
  AriaNode,
  ComputedStyleValue,
  ElementBounds,
  AriaSnapshotResult,
  ComputedStylesResult,
  ElementBoundsResult,
  VerifyResult,
  PerceptionResult,
  // Component tool types
  CreateComponentData,
  UpdateComponentData,
  DeleteComponentData,
  ConnectComponentsData,
  MoveComponentData,
  // Perception tool types
  GetAriaSnapshotData,
  GetComputedStylesData,
  GetElementBoundsData,
  VerifyComponentData,
  // Page tool types (excluding SlotPosition - already in pageTypes)
  LayoutOptions,
  CreatePageData,
  AddToPageData,
  RemoveFromPageData,
  ReorderLayersData,
  UpdateLayoutData,
  UpdatePageSlotData,
  // Canvas tool union
  CanvasToolData,
  // MCP types
  McpToolRequest,
  McpToolResponse,
  // Message types
  CanvasToExtensionMessage,
  ExtensionToCanvasMessage,
  OrbitMessage,
} from './ipcProtocol';

export {
  isExtensionToCanvasMessage,
  isCanvasToExtensionMessage,
  parseExtensionMessage,
} from './ipcProtocol';
