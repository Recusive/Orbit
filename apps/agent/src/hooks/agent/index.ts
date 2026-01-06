/**
 * Agent hooks - Backend communication and agent state
 */

export { useAgent } from './use-agent';
export type { UseAgentReturn } from './use-agent';

export { useTauri, useAgentStream, markSessionAsForked, setRewindContext } from './use-tauri';
export type { UseTauriOptions, UseTauriReturn, AgentStreamCallbacks } from './use-tauri';
