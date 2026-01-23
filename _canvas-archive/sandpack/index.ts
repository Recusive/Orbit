/**
 * Sandpack integration for Orbit Canvas
 * Provides isolated React component rendering with error handling
 */

// Node components
export {
  SandpackNode,
  getDefaultSandpackNodeData,
  type SandpackNodeData,
  type SandpackNodeProps,
} from './SandpackNode';
export {
  LiveSandpackNode,
  getDefaultLiveSandpackNodeData,
  type LiveSandpackNodeData,
  type LiveSandpackNodeProps,
} from './LiveSandpackNode';
export {
  EsmSandpackNode,
  getDefaultEsmSandpackNodeData,
  type EsmSandpackNodeData,
  type EsmSandpackNodeProps,
} from './EsmSandpackNode';
export { PageNode, getDefaultPageNodeData, type PageNodeProps } from './PageNode';

// Preview components
export { SandpackPreview, type SandpackPreviewProps } from './SandpackPreview';
export { InlinePreview, type InlinePreviewProps } from './InlinePreview';
export { EsmPreview, type EsmPreviewProps } from './EsmPreview';

// HMR components
export {
  SandpackProviderWrapper,
  type SandpackProviderWrapperProps,
} from './SandpackProviderWrapper';
export { SandpackFileUpdater, type SandpackFileUpdaterProps } from './SandpackFileUpdater';
export { HMRErrorBoundary, type HMRErrorBoundaryProps } from './HMRErrorBoundary';

// Instance management
export {
  useSandpackInstanceManager,
  selectInstanceCount,
  selectActiveCount,
  type SandpackInstance,
  type InstanceStatus,
} from './SandpackInstanceManager';
export {
  sandpackMessageBus,
  useMessageBusSubscription,
  type CanvasToSandboxMessage,
  type SandboxToCanvasMessage,
  type BusMessage,
} from './SandpackMessageBus';

// Bridge
export {
  useSandpackBridge,
  generateBridgeScript,
  BRIDGE_SCRIPT,
  type UseSandpackBridgeOptions,
  type BridgeMessage,
  type AgentToSandboxMessage,
  type SandboxToAgentMessage,
} from './useSandpackBridge';

// Config
export {
  VIEWPORT_PRESETS,
  type ViewportType,
  DEVICE_PRESETS,
  DEVICE_CATEGORIES,
  getDevicesByCategory,
  type DevicePreset,
  type DeviceId,
  SANDPACK_DEPENDENCIES,
  SANDPACK_CONFIG,
  createDefaultFiles,
  createHtmlTemplateWithBridge,
  ensureReactImport,
  DEFAULT_APP_TEMPLATE,
  HTML_TEMPLATE,
  ERROR_MESSAGES,
  SANDBOX_TIMEOUTS,
} from './sandpackConfig';
