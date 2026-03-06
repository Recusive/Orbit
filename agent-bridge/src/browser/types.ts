/**
 * Browser MCP Types
 *
 * Shared browser-tool input contracts and lightweight result types used by the
 * embedded browser MCP server and its frontend bridge.
 */

import { z } from 'zod';

// ============================================
// Shared Schemas
// ============================================

export const BrowserTargetShape = {
  ref: z.string().optional().describe('Element ref from browser_snapshot (preferred)'),
  selector: z.string().optional().describe('CSS selector (legacy, still supported)'),
} satisfies Record<string, z.ZodType>;

export const OptionalTargetSchema = z.object(BrowserTargetShape);

export const TargetSchema = OptionalTargetSchema.refine(
  (value) => value.ref !== undefined || value.selector !== undefined,
  'Provide ref (from snapshot) or selector (CSS)'
);

export const BrowserScrollDirections = ['up', 'down', 'left', 'right'] as const;
export const BrowserStorageStores = ['local', 'session'] as const;
export const BrowserConsoleLogLevels = ['error', 'warn', 'info', 'log'] as const;
export const BrowserWaitForSelectorStates = ['attached', 'detached', 'hidden', 'visible'] as const;

export type BrowserTargetInput = z.infer<typeof TargetSchema>;
export type BrowserOptionalTargetInput = z.infer<typeof OptionalTargetSchema>;
export type BrowserScrollDirection = (typeof BrowserScrollDirections)[number];
export type BrowserStorageStore = (typeof BrowserStorageStores)[number];
export type BrowserConsoleLogLevel = (typeof BrowserConsoleLogLevels)[number];
export type BrowserWaitForSelectorState = (typeof BrowserWaitForSelectorStates)[number];

function getValidationErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid browser tool input';
}

export function validateTargetInput(input: unknown): BrowserTargetInput {
  const result = TargetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(getValidationErrorMessage(result.error));
  }
  return result.data;
}

export function validateOptionalTargetInput(input: unknown): BrowserOptionalTargetInput {
  const result = OptionalTargetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(getValidationErrorMessage(result.error));
  }
  return result.data;
}

// ============================================
// Result Types
// ============================================

export interface BrowserToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BrowserToolResultTyped<T> extends BrowserToolResult {
  success: true;
  data: T;
}

export interface BrowserToolError extends BrowserToolResult {
  success: false;
  error: string;
}

export interface McpToolRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface McpToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string | null;
  path: string | null;
  expires: number | null;
}

export interface BrowserNetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  size: number;
}

export interface BrowserBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserScreenshotData {
  url: string;
  title: string;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface BrowserConsoleLogEntry {
  level: BrowserConsoleLogLevel;
  message: string;
  timestamp: number;
}

export interface BrowserRuntimeInfo {
  available: boolean;
  reason?: string;
  version?: string;
  epoch?: number;
  capabilities?: {
    snapshot: boolean;
    refResolution: boolean;
    consoleCapture: boolean;
    networkCapture: boolean;
    storageAccess: boolean;
  };
}

export interface SnapshotResponse {
  epoch: number;
  snapshot: string;
  refCount: number;
  totalElements: number;
  emittedElements: number;
  truncated: boolean;
  url: string;
  title: string;
  durationMs: number;
}

// ============================================
// Command Types
// ============================================

export interface BrowserOpenCommand {
  type: 'browser:open';
  url?: string;
}

export interface BrowserNavigateCommand {
  type: 'browser:navigate';
  url: string;
}

export interface BrowserSnapshotCommand {
  type: 'browser:snapshot';
  interactive?: boolean;
  cursor?: boolean;
  compact?: boolean;
}

export interface BrowserGetUrlCommand {
  type: 'browser:get_url';
}

export interface BrowserGetTitleCommand {
  type: 'browser:get_title';
}

export interface BrowserClickCommand extends BrowserTargetInput {
  type: 'browser:click';
}

export interface BrowserTypeCommand extends BrowserTargetInput {
  type: 'browser:type';
  text: string;
}

export interface BrowserFillCommand extends BrowserTargetInput {
  type: 'browser:fill';
  value: string;
}

export interface BrowserSelectCommand extends BrowserTargetInput {
  type: 'browser:select';
  values: string[];
}

export interface BrowserCheckCommand extends BrowserTargetInput {
  type: 'browser:check';
}

export interface BrowserUncheckCommand extends BrowserTargetInput {
  type: 'browser:uncheck';
}

export interface BrowserHoverCommand extends BrowserTargetInput {
  type: 'browser:hover';
}

export interface BrowserFocusCommand extends BrowserTargetInput {
  type: 'browser:focus';
}

export interface BrowserScrollCommand extends BrowserOptionalTargetInput {
  type: 'browser:scroll';
  direction: BrowserScrollDirection;
  amount?: number;
}

export interface BrowserScrollIntoViewCommand extends BrowserTargetInput {
  type: 'browser:scroll_into_view';
}

export interface BrowserWaitForSelectorCommand {
  type: 'browser:wait_for_selector';
  selector: string;
  state?: BrowserWaitForSelectorState;
  timeout?: number;
}

export interface BrowserWaitForUrlCommand {
  type: 'browser:wait_for_url';
  url: string;
  timeout?: number;
}

export interface BrowserEvalCommand {
  type: 'browser:eval';
  script: string;
}

export interface BrowserScreenshotCommand {
  type: 'browser:screenshot';
}

export interface BrowserGetHtmlCommand extends BrowserOptionalTargetInput {
  type: 'browser:get_html';
  outer?: boolean;
}

export interface BrowserGetTextCommand extends BrowserOptionalTargetInput {
  type: 'browser:get_text';
}

export interface BrowserIsVisibleCommand extends BrowserTargetInput {
  type: 'browser:is_visible';
}

export interface BrowserIsEnabledCommand extends BrowserTargetInput {
  type: 'browser:is_enabled';
}

export interface BrowserGetAttributeCommand extends BrowserTargetInput {
  type: 'browser:get_attribute';
  name: string;
}

export interface BrowserBoundingBoxCommand extends BrowserTargetInput {
  type: 'browser:bounding_box';
}

export interface BrowserCountCommand {
  type: 'browser:count';
  selector: string;
}

export interface BrowserCookiesGetCommand {
  type: 'browser:cookies_get';
  name?: string;
  domain?: string;
}

export interface BrowserCookiesClearCommand {
  type: 'browser:cookies_clear';
  name?: string;
  domain?: string;
}

export interface BrowserStorageGetCommand {
  type: 'browser:storage_get';
  key: string;
  store?: BrowserStorageStore;
}

export interface BrowserStorageSetCommand {
  type: 'browser:storage_set';
  key: string;
  value: string;
  store?: BrowserStorageStore;
}

export interface BrowserStorageClearCommand {
  type: 'browser:storage_clear';
  store?: BrowserStorageStore;
}

export interface BrowserNetworkRequestsCommand {
  type: 'browser:network_requests';
  filter?: {
    url?: string;
    method?: string;
    status?: number;
  };
}

export interface BrowserConsoleLogsCommand {
  type: 'browser:console_logs';
  level?: BrowserConsoleLogLevel;
}

export interface BrowserBackCommand {
  type: 'browser:back';
}

export interface BrowserForwardCommand {
  type: 'browser:forward';
}

export interface BrowserReloadCommand {
  type: 'browser:reload';
}

export interface BrowserCloseCommand {
  type: 'browser:close';
}

export interface BrowserRuntimeInfoCommand {
  type: 'browser:runtime_info';
}

export type BrowserCommand =
  | BrowserOpenCommand
  | BrowserNavigateCommand
  | BrowserSnapshotCommand
  | BrowserGetUrlCommand
  | BrowserGetTitleCommand
  | BrowserClickCommand
  | BrowserTypeCommand
  | BrowserFillCommand
  | BrowserSelectCommand
  | BrowserCheckCommand
  | BrowserUncheckCommand
  | BrowserHoverCommand
  | BrowserFocusCommand
  | BrowserScrollCommand
  | BrowserScrollIntoViewCommand
  | BrowserWaitForSelectorCommand
  | BrowserWaitForUrlCommand
  | BrowserEvalCommand
  | BrowserScreenshotCommand
  | BrowserGetHtmlCommand
  | BrowserGetTextCommand
  | BrowserIsVisibleCommand
  | BrowserIsEnabledCommand
  | BrowserGetAttributeCommand
  | BrowserBoundingBoxCommand
  | BrowserCountCommand
  | BrowserCookiesGetCommand
  | BrowserCookiesClearCommand
  | BrowserStorageGetCommand
  | BrowserStorageSetCommand
  | BrowserStorageClearCommand
  | BrowserNetworkRequestsCommand
  | BrowserConsoleLogsCommand
  | BrowserBackCommand
  | BrowserForwardCommand
  | BrowserReloadCommand
  | BrowserCloseCommand
  | BrowserRuntimeInfoCommand;

export type BrowserCommandType = BrowserCommand['type'];

// ============================================
// Helper Type Guards
// ============================================

export function isSuccess<T>(result: BrowserToolResult): result is BrowserToolResultTyped<T> {
  return result.success;
}

export function isError(result: BrowserToolResult): result is BrowserToolError {
  return !result.success;
}
