/**
 * Testing Utilities
 *
 * Shared test utilities for the Orbit frontend apps.
 *
 * @example
 * ```typescript
 * import { createMockInvoke, mockResponses } from '@orbit/common/testing';
 * ```
 */

export { createMockInvoke, mockResponses, mockTauriCommand, resetTauriMocks } from './tauri-mocks';

export type {
  FileEntryResponse,
  GitStatusResponse,
  MockInvokeFn,
  MockResponseMap,
  TerminalInfoResponse,
} from './tauri-mocks';
