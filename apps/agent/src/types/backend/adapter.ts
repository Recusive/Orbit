export type BackendId = 'claude' | 'opencode';

export interface BackendCapabilities {
  readonly rewind: boolean;
  readonly planMode: boolean;
  readonly acceptMode: boolean;
  readonly thinkingMode: boolean;
  readonly effortLevel: boolean;
  readonly permissionUi: 'inline';
  readonly modelSelector: 'claude-models' | 'provider-models';
  readonly titleGeneration: 'agent-bridge' | 'server-side';
  readonly conversationStorage: 'jsonl' | 'sqlite';
  readonly worktreeIsolation: boolean;
  readonly sessionSharing: boolean;
  readonly subagents: boolean;
}

export const CLAUDE_CAPABILITIES: BackendCapabilities = {
  rewind: true,
  planMode: true,
  acceptMode: true,
  thinkingMode: true,
  effortLevel: true,
  permissionUi: 'inline',
  modelSelector: 'claude-models',
  titleGeneration: 'agent-bridge',
  conversationStorage: 'jsonl',
  worktreeIsolation: true,
  sessionSharing: false,
  subagents: true,
};

export const OPENCODE_CAPABILITIES: BackendCapabilities = {
  rewind: true,
  planMode: true,
  acceptMode: false,
  thinkingMode: false,
  effortLevel: false,
  permissionUi: 'inline',
  modelSelector: 'provider-models',
  titleGeneration: 'server-side',
  conversationStorage: 'sqlite',
  worktreeIsolation: false,
  sessionSharing: true,
  subagents: true,
};

export function getCapabilities(backend: BackendId): BackendCapabilities {
  return backend === 'claude' ? CLAUDE_CAPABILITIES : OPENCODE_CAPABILITIES;
}
