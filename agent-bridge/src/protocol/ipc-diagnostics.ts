import type { z } from 'zod';

const SAFE_REQUEST_TYPES = new Set([
  'browser:tool_response',
  'cleanup_sessions',
  'create_agent',
  'create_command',
  'create_session',
  'delete_agent',
  'delete_command',
  'delete_session',
  'enhance_bug_report',
  'fork_session',
  'fork_session_at',
  'generate_agent_definition',
  'generate_command_definition',
  'generate_title',
  'get_accept_mode',
  'get_agent',
  'get_command',
  'get_plan_mode',
  'get_sdk_session_id',
  'get_stored_session',
  'get_thinking_mode',
  'interrupt',
  'is_session_ready',
  'list_agents',
  'list_commands',
  'list_skills',
  'permission_response',
  'rewind_files',
  'send_message',
  'set_accept_mode',
  'set_effort_level',
  'set_model',
  'set_plan_mode',
  'set_thinking_mode',
  'shutdown',
  'update_agent',
  'update_command',
  'update_credentials',
]);

const MAX_TOP_LEVEL_KEYS = 20;
const SAFE_DIAGNOSTIC_KEYS = new Set([
  'agent',
  'apiKey',
  'atMessageUuid',
  'attachments',
  'checkpointId',
  'command',
  'config',
  'description',
  'displayName',
  'enabled',
  'error',
  'effort',
  'keepAlive',
  'maxAgeDays',
  'maxTokens',
  'message',
  'messageContent',
  'model',
  'name',
  'options',
  'originalName',
  'parentUuid',
  'requestId',
  'response',
  'result',
  'scope',
  'sessionId',
  'source',
  'success',
  'target',
  'type',
  'userMessage',
  'workspacePath',
]);

type ParsedKind =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'string'
  | 'symbol'
  | 'undefined';

export interface BridgeIpcLineSummary {
  readonly lineLength: number;
  readonly parsedKind: ParsedKind;
  readonly requestType?: string;
  readonly topLevelKeyCount?: number;
  readonly topLevelKeys?: readonly string[];
  readonly trimmedLength: number;
}

function getParsedKind(value: unknown): ParsedKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeKey(key: string): string {
  return SAFE_DIAGNOSTIC_KEYS.has(key) ? key : '[unrecognized-key]';
}

function summarizeRequestType(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return value === undefined ? undefined : `[${getParsedKind(value)}]`;
  }

  return SAFE_REQUEST_TYPES.has(value) ? value : '[unrecognized]';
}

/**
 * Build value-free diagnostics for invalid bridge IPC lines.
 *
 * [warning] TESTED: Bridge IPC diagnostics are covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test src/__tests__/ipc-diagnostics-redaction.test.ts
 *     Test file: src/__tests__/ipc-diagnostics-redaction.test.ts
 */
export function summarizeBridgeIpcLine(line: string, parsed?: unknown): BridgeIpcLineSummary {
  const summary: BridgeIpcLineSummary = {
    lineLength: line.length,
    parsedKind: getParsedKind(parsed),
    trimmedLength: line.trim().length,
  };

  if (!isRecord(parsed)) {
    return summary;
  }

  const keys = Object.keys(parsed);
  const requestType = summarizeRequestType(parsed.type);

  return {
    ...summary,
    ...(requestType !== undefined ? { requestType } : {}),
    topLevelKeyCount: keys.length,
    topLevelKeys: keys.slice(0, MAX_TOP_LEVEL_KEYS).map(summarizeKey),
  };
}

function formatIssuePath(path: readonly (string | number | symbol)[]): string {
  if (path.length === 0) {
    return '_root';
  }

  return path
    .map((segment) => {
      if (typeof segment === 'number') return '[index]';
      if (typeof segment === 'symbol') return '[symbol]';
      return summarizeKey(segment);
    })
    .join('.');
}

function sanitizeIssueMessage(message: string): string {
  return message.replace(/"[^"]*"/g, '"[value]"');
}

function getUnrecognizedKeyCount(issue: z.ZodError['issues'][number]): number | undefined {
  if (!('keys' in issue) || !Array.isArray(issue.keys)) {
    return undefined;
  }

  return issue.keys.length;
}

export function formatBridgeIpcValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = formatIssuePath(issue.path);

      if (issue.code === 'unrecognized_keys') {
        const count = getUnrecognizedKeyCount(issue);
        return `${path}: Unrecognized ${String(count ?? 'unknown')} key(s)`;
      }

      return `${path}: ${sanitizeIssueMessage(issue.message)}`;
    })
    .join('\n');
}
