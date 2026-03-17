/**
 * iOS action dispatcher.
 *
 * [warning] TESTED: This dispatcher is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test file: src/__tests__/ios-mcp-server.test.ts
 */

import { validateTargetInput } from '../browser/types.js';

import type { IOSService } from './ios-service.js';
import type {
  IOSCheckResult,
  IOSConsoleLogLevel,
  IOSConsoleLogsResult,
  IOSDeviceListResult,
  IOSEvalResult,
  IOSFillResult,
  IOSHtmlResult,
  IOSLaunchResult,
  IOSScrollResult,
  IOSSelectResult,
  IOSScreenshotResult,
  IOSScrollDirection,
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
import type { SnapshotResponse } from '../browser/types.js';

const DEFAULT_SWIPE_DURATION_MS = 300;
const DEFAULT_SCROLL_AMOUNT = 300;
const DEFAULT_WAIT_TIMEOUT_MS = 30000;
const MAX_WAIT_TIMEOUT_MS = 120000;

function getRequiredTarget(args: Record<string, unknown>): IOSTargetInput {
  return validateTargetInput(args);
}

function getOptionalNestedTarget(
  args: Record<string, unknown>,
  key: string
): IOSTargetInput | undefined {
  const rawTarget = args[key];
  if (rawTarget === undefined) {
    return undefined;
  }

  return validateTargetInput(rawTarget);
}

function normalizeDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SWIPE_DURATION_MS;
  }
  return Math.trunc(value);
}

function normalizeScrollAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SCROLL_AMOUNT;
  }
  return Math.trunc(value);
}

function normalizeWaitTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(value), MAX_WAIT_TIMEOUT_MS);
}

function requireLease(service: IOSService, sessionId: string): void {
  if (!service.hasLease(sessionId)) {
    throw new Error('No iOS lease for session');
  }
}

export type IOSActionResult =
  | IOSDeviceListResult
  | IOSLaunchResult
  | IOSSuccessResult
  | SnapshotResponse
  | IOSTextResult
  | IOSHtmlResult
  | IOSScreenshotResult
  | IOSTapResult
  | IOSFillResult
  | IOSTypeResult
  | IOSSelectResult
  | IOSCheckResult
  | IOSUncheckResult
  | IOSSwipeResult
  | IOSScrollResult
  | IOSEvalResult
  | IOSWaitForSelectorResult
  | IOSConsoleLogsResult;

export async function executeIOSAction(
  service: IOSService,
  sessionId: string,
  toolName: IOSToolName,
  args: Record<string, unknown>
): Promise<IOSActionResult> {
  if (toolName === 'ios_device_list') {
    const devices = await service.listDevices();
    return { devices };
  }

  if (toolName === 'ios_launch') {
    const device =
      typeof args.device === 'string' && args.device.length > 0 ? args.device : undefined;
    const manager = await service.acquire(sessionId, device);
    const result = manager.getLaunchResult();
    if (result === null) {
      throw new Error('iOS not ready');
    }
    return result;
  }

  if (toolName === 'ios_close') {
    requireLease(service, sessionId);
    await service.release(sessionId);
    return { success: true };
  }

  const manager = await service.getManager(sessionId);

  switch (toolName) {
    case 'ios_navigate':
      return manager.navigate(args.url as string);
    case 'ios_back':
      return manager.back();
    case 'ios_forward':
      return manager.forward();
    case 'ios_reload':
      return manager.reload();
    case 'ios_snapshot':
      return manager.snapshot({
        interactive: args.interactive !== false,
        cursor: args.cursor === true,
        compact: args.compact === true,
      });
    case 'ios_get_text':
      return manager.getText(getRequiredTarget(args));
    case 'ios_get_html':
      return manager.getHtml(getRequiredTarget(args), args.outer === true);
    case 'ios_screenshot':
      return manager.screenshot();
    case 'ios_tap':
      return manager.tap(getRequiredTarget(args));
    case 'ios_fill':
      return manager.fill(getRequiredTarget(args), args.value as string);
    case 'ios_type':
      return manager.type(getRequiredTarget(args), args.text as string);
    case 'ios_select':
      return manager.select(getRequiredTarget(args), args.values as string[]);
    case 'ios_check':
      return manager.check(getRequiredTarget(args));
    case 'ios_uncheck':
      return manager.uncheck(getRequiredTarget(args));
    case 'ios_swipe':
      return manager.swipe(
        args.direction as IOSSwipeDirection,
        getOptionalNestedTarget(args, 'target'),
        normalizeDuration(args.duration)
      );
    case 'ios_scroll':
      return manager.scroll(
        args.direction as IOSScrollDirection,
        normalizeScrollAmount(args.amount)
      );
    case 'ios_eval':
      return manager.evaluate(args.script as string);
    case 'ios_wait_for_selector':
      return manager.waitForSelector(
        args.selector as string,
        args.state as IOSWaitForSelectorState | undefined,
        normalizeWaitTimeout(args.timeout)
      );
    case 'ios_console_logs':
      return manager.consoleLogs(args.level as IOSConsoleLogLevel | undefined);
    default: {
      const exhaustiveCheck: never = toolName;
      void exhaustiveCheck;
      throw new Error('Unsupported iOS tool');
    }
  }
}
