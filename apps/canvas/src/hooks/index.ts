/**
 * Hooks exports
 */
export { useOrbitMessaging, type CanvasToolData } from './useOrbitMessaging';
export { useAgentChat } from './useAgentChat';
export { useCanvasPersistence } from './useCanvasPersistence';
export {
  useCanvasActions,
  type CanvasActions,
  type ContextMenuState,
  type UseCanvasActionsOptions,
} from './useCanvasActions';
export { useCanvasShortcuts, type UseCanvasShortcutsOptions } from './useCanvasShortcuts';
export {
  useVisualEditing,
  type SelectedElement,
  type VisualEditingState,
  type UseVisualEditingOptions,
  type UseVisualEditingReturn,
  type Point,
} from './useVisualEditing';
export {
  usePerception,
  installPerceptionTestHarness,
  type UsePerceptionResult,
  type UsePerceptionOptions,
  type PerceptionToolType,
  type PerceptionRequest,
  type PerceptionResultPayload,
  type AriaNode,
  type PerceptionTestHarness,
} from './usePerception';
export {
  useMcpToolExecution,
  type UseMcpToolExecutionOptions,
  type UseMcpToolExecutionReturn,
} from './useMcpToolExecution';
export { useDesignTree, type UseDesignTreeReturn, type DesignAction } from './useDesignTree';
export {
  useDrawingTools,
  type DrawingTool,
  type DrawingState,
  type PreviewRect,
  type UseDrawingToolsOptions,
  type UseDrawingToolsReturn,
} from './useDrawingTools';
export {
  useSmartGuides,
  type Guide,
  type GuideType,
  type BoundingBox,
  type SnapResult,
  type UseSmartGuidesOptions,
  type UseSmartGuidesReturn,
} from './useSmartGuides';
export {
  useWorkflowPersistence,
  type WorkflowExport,
  type WorkflowImportResult,
} from './useWorkflowPersistence';
export { useVisiblePreviewNodes, getVisibleNodes } from './useVisiblePreviewNodes';

// Extracted hooks for CanvasApp refactoring
export {
  useDesignEffects,
  type UseDesignEffectsOptions,
  type UseDesignEffectsReturn,
} from './useDesignEffects';
export {
  useCanvasHandlers,
  type UseCanvasHandlersOptions,
  type UseCanvasHandlersReturn,
} from './useCanvasHandlers';
export {
  useDrawingMode,
  type UseDrawingModeOptions,
  type UseDrawingModeReturn,
} from './useDrawingMode';
export { useCanvasMode, type UseCanvasModeReturn } from './useCanvasMode';
export { useLayerManagement } from './useLayerManagement';
export {
  useCanvasToolExecution,
  type UseCanvasToolExecutionOptions,
  type UseCanvasToolExecutionReturn,
} from './useCanvasToolExecution';

// Tauri Canvas Communication
export {
  useTauriCanvas,
  type TauriCanvasCallbacks,
  type UseTauriCanvasResult,
  type SDKMessage,
  type McpToolRequest as TauriMcpToolRequest,
  type CanvasState as TauriCanvasState,
} from './useTauriCanvas';
export {
  isTauriEnvironment,
  canvasCreateSession,
  canvasDeleteSession,
  canvasSendMessage,
  canvasToolResponse,
  canvasOrchestratorControl,
  onCanvasMessage,
  onCanvasToolRequest,
  onCanvasError,
  type SDKMessageType,
  type SessionConfig,
  type CanvasMessageEvent,
  type CanvasToolRequestEvent,
  type CanvasErrorEvent,
} from './canvasBackend';
