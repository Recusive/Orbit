/**
 * iOS module exports.
 */

export { IOSManager } from './ios-manager.js';
export { IOSService, canEnableIOS } from './ios-service.js';
export { executeIOSAction } from './ios-actions.js';
export { createIOSMcpServer, getIOSToolNames } from './ios-mcp-server.js';
export type {
  IOSAppiumProcess,
  IOSAutomationSession,
  IOSCheckResult,
  IOSConsoleLogLevel,
  IOSConsoleLogsResult,
  IOSDevice,
  IOSDeviceListResult,
  IOSDeviceState,
  IOSEvalResult,
  IOSFillResult,
  IOSHtmlResult,
  IOSLaunchResult,
  IOSLifecycleState,
  IOSManagerDependencies,
  IOSManagerFactory,
  IOSManagerLike,
  IOSManagerOptions,
  IOSOptionalTargetInput,
  IOSScrollDirection,
  IOSScrollResult,
  IOSSelectResult,
  IOSSnapshotOptions,
  IOSScreenshotResult,
  IOSServiceOptions,
  IOSSuccessResult,
  IOSSwipeDirection,
  IOSSwipeResult,
  IOSTapResult,
  IOSTargetInput,
  IOSTextResult,
  IOSToolName,
  IOSTypeResult,
  IOSUncheckResult,
  IOSWaitForSelectorResult,
  IOSWaitForSelectorState,
} from './types.js';
export {
  IOSConsoleLogLevelSchema,
  IOSConsoleLogLevels,
  IOSOptionalTargetSchema,
  IOSScrollDirectionSchema,
  IOSScrollDirections,
  IOSSwipeDirectionSchema,
  IOSSwipeDirections,
  IOSTargetSchema,
  IOSTargetShape,
  IOSToolNames,
  IOSWaitForSelectorStateSchema,
  IOSWaitForSelectorStates,
} from './types.js';
