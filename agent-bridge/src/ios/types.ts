/**
 * iOS integration types shared by the service, manager, and MCP layer.
 */

import { z } from 'zod';

import {
  BrowserConsoleLogLevels,
  BrowserScrollDirections,
  BrowserTargetShape,
  BrowserWaitForSelectorStates,
  OptionalTargetSchema,
  TargetSchema,
} from '../browser/types.js';

import type {
  BrowserConsoleLogEntry,
  BrowserConsoleLogLevel,
  BrowserOptionalTargetInput,
  BrowserScrollDirection,
  BrowserTargetInput,
  BrowserWaitForSelectorState,
  SnapshotResponse,
} from '../browser/types.js';

export type IOSLifecycleState = 'idle' | 'launching' | 'ready' | 'closing' | 'disposed';

export type IOSDeviceState = 'Shutdown' | 'Booted' | 'Creating';

export const IOSSwipeDirections = BrowserScrollDirections;
export const IOSScrollDirections = BrowserScrollDirections;
export const IOSConsoleLogLevels = BrowserConsoleLogLevels;
export const IOSWaitForSelectorStates = BrowserWaitForSelectorStates;
export const IOSTargetShape = BrowserTargetShape;
export const IOSTargetSchema = TargetSchema;
export const IOSOptionalTargetSchema = OptionalTargetSchema;

export const IOSToolNames = [
  'ios_device_list',
  'ios_launch',
  'ios_close',
  'ios_navigate',
  'ios_back',
  'ios_forward',
  'ios_reload',
  'ios_snapshot',
  'ios_get_text',
  'ios_get_html',
  'ios_screenshot',
  'ios_tap',
  'ios_fill',
  'ios_type',
  'ios_select',
  'ios_check',
  'ios_uncheck',
  'ios_swipe',
  'ios_scroll',
  'ios_eval',
  'ios_wait_for_selector',
  'ios_console_logs',
] as const;

export type IOSToolName = (typeof IOSToolNames)[number];
export type IOSTargetInput = BrowserTargetInput;
export type IOSOptionalTargetInput = BrowserOptionalTargetInput;
export type IOSScrollDirection = BrowserScrollDirection;
export type IOSSwipeDirection = (typeof IOSSwipeDirections)[number];
export type IOSConsoleLogLevel = BrowserConsoleLogLevel;
export type IOSWaitForSelectorState = BrowserWaitForSelectorState;

export interface IOSDevice {
  name: string;
  udid: string;
  state: IOSDeviceState;
  runtime: string;
  isAvailable: boolean;
}

export interface IOSLaunchResult {
  udid: string;
  name: string;
  runtime: string;
  appiumPort: number;
}

export interface IOSSnapshotOptions {
  interactive?: boolean;
  cursor?: boolean;
  compact?: boolean;
}

export interface IOSSuccessResult {
  success: true;
}

export interface IOSTextResult {
  text: string;
}

export interface IOSHtmlResult {
  html: string;
}

export interface IOSScreenshotResult {
  image: string;
  format: 'png';
}

export interface IOSTapResult {
  tapped: true;
}

export interface IOSFillResult {
  filled: true;
}

export interface IOSTypeResult {
  typed: true;
}

export interface IOSSelectResult {
  selected: true;
}

export interface IOSCheckResult {
  checked: true;
}

export interface IOSUncheckResult {
  unchecked: true;
}

export interface IOSSwipeResult {
  swiped: true;
}

export interface IOSScrollResult {
  scrollX: number;
  scrollY: number;
}

export interface IOSWaitForSelectorResult {
  matched: true;
}

export interface IOSConsoleLogsResult {
  logs: BrowserConsoleLogEntry[];
}

export interface IOSEvalResult {
  result: unknown;
}

export interface IOSDeviceListResult {
  devices: IOSDevice[];
}

export interface IOSAppiumProcess {
  readonly port: number;
  readonly pid?: number;
  onExit(callback: (code: number | null) => void): () => void;
  terminate(signal: 'SIGTERM' | 'SIGKILL'): Promise<void>;
  waitForExit(timeoutMs: number): Promise<number | null>;
}

export interface IOSAutomationSession {
  deleteSession(): Promise<void>;
  navigate(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  snapshot(options: IOSSnapshotOptions): Promise<SnapshotResponse>;
  getText(target: IOSTargetInput): Promise<string>;
  getHtml(target: IOSTargetInput, outer?: boolean): Promise<string>;
  screenshot(): Promise<IOSScreenshotResult>;
  tap(target: IOSTargetInput): Promise<void>;
  fill(target: IOSTargetInput, value: string): Promise<void>;
  type(target: IOSTargetInput, text: string): Promise<void>;
  select(target: IOSTargetInput, values: string[]): Promise<void>;
  check(target: IOSTargetInput): Promise<void>;
  uncheck(target: IOSTargetInput): Promise<void>;
  swipe(direction: IOSSwipeDirection, target?: IOSTargetInput, duration?: number): Promise<void>;
  scroll(direction: IOSScrollDirection, amount?: number): Promise<IOSScrollResult>;
  evaluate(script: string): Promise<unknown>;
  waitForSelector(
    selector: string,
    state?: IOSWaitForSelectorState,
    timeout?: number
  ): Promise<void>;
  consoleLogs(level?: IOSConsoleLogLevel): Promise<BrowserConsoleLogEntry[]>;
}

export interface IOSManagerDependencies {
  listDevices(signal: AbortSignal): Promise<IOSDevice[]>;
  bootDevice(device: IOSDevice, signal: AbortSignal): Promise<void>;
  shutdownDevice(device: IOSDevice): Promise<void>;
  startAppium(signal: AbortSignal): Promise<IOSAppiumProcess>;
  createAutomationSession(
    device: IOSDevice,
    appiumPort: number,
    signal: AbortSignal
  ): Promise<IOSAutomationSession>;
}

export interface IOSManagerOptions {
  dependencies?: IOSManagerDependencies;
}

export interface IOSManagerLike {
  readonly state: IOSLifecycleState;
  listDevices(): Promise<IOSDevice[]>;
  launch(deviceQuery?: string): Promise<IOSLaunchResult>;
  navigate(url: string): Promise<IOSSuccessResult>;
  back(): Promise<IOSSuccessResult>;
  forward(): Promise<IOSSuccessResult>;
  reload(): Promise<IOSSuccessResult>;
  snapshot(options: IOSSnapshotOptions): Promise<SnapshotResponse>;
  getText(target: IOSTargetInput): Promise<IOSTextResult>;
  getHtml(target: IOSTargetInput, outer?: boolean): Promise<IOSHtmlResult>;
  screenshot(): Promise<IOSScreenshotResult>;
  tap(target: IOSTargetInput): Promise<IOSTapResult>;
  fill(target: IOSTargetInput, value: string): Promise<IOSFillResult>;
  type(target: IOSTargetInput, text: string): Promise<IOSTypeResult>;
  select(target: IOSTargetInput, values: string[]): Promise<IOSSelectResult>;
  check(target: IOSTargetInput): Promise<IOSCheckResult>;
  uncheck(target: IOSTargetInput): Promise<IOSUncheckResult>;
  swipe(
    direction: IOSSwipeDirection,
    target?: IOSTargetInput,
    duration?: number
  ): Promise<IOSSwipeResult>;
  scroll(direction: IOSScrollDirection, amount?: number): Promise<IOSScrollResult>;
  evaluate(script: string): Promise<IOSEvalResult>;
  waitForSelector(
    selector: string,
    state?: IOSWaitForSelectorState,
    timeout?: number
  ): Promise<IOSWaitForSelectorResult>;
  consoleLogs(level?: IOSConsoleLogLevel): Promise<IOSConsoleLogsResult>;
  close(): Promise<void>;
  dispose(): Promise<void>;
  assertUsable(): void;
  getLaunchResult(): IOSLaunchResult | null;
}

export type IOSManagerFactory = () => IOSManagerLike;

export interface IOSServiceOptions {
  managerFactory?: IOSManagerFactory;
}

export const IOSSwipeDirectionSchema = z.enum(IOSSwipeDirections);
export const IOSScrollDirectionSchema = z.enum(IOSScrollDirections);
export const IOSConsoleLogLevelSchema = z.enum(IOSConsoleLogLevels);
export const IOSWaitForSelectorStateSchema = z.enum(IOSWaitForSelectorStates);
