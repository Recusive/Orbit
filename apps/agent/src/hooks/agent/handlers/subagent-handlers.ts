import type { WebviewMessage } from '@/types/protocol';

import {
  getWorkspacePath,
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  generateAgentDefinition,
} from '@/lib/api';

export async function handleSubagentsList(
  message: Extract<WebviewMessage, { type: 'subagents:list' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    const agents = await listAgents(workspacePath);
    window.postMessage(
      {
        type: 'subagents:list:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        agents,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to list subagents';
    console.error('[Orbit] List subagents error:', errorMessage);
    window.postMessage(
      {
        type: 'subagents:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleSubagentsCreate(
  message: Extract<WebviewMessage, { type: 'subagents:create' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    // Filter undefined values to match exactOptionalPropertyTypes
    const agentInput = {
      name: message.agent.name,
      description: message.agent.description,
      prompt: message.agent.prompt,
      ...(message.agent.tools && { tools: message.agent.tools }),
      ...(message.agent.disallowedTools && { disallowedTools: message.agent.disallowedTools }),
      ...(message.agent.model && { model: message.agent.model }),
    };
    const agent = await createAgent(workspacePath, agentInput);
    window.postMessage(
      {
        type: 'subagents:created',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        agent,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to create subagent';
    console.error('[Orbit] Create subagent error:', errorMessage);
    window.postMessage(
      {
        type: 'subagents:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleSubagentsUpdate(
  message: Extract<WebviewMessage, { type: 'subagents:update' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    // Filter undefined values to match exactOptionalPropertyTypes
    const agentInput = {
      name: message.agent.name,
      description: message.agent.description,
      prompt: message.agent.prompt,
      ...(message.agent.tools && { tools: message.agent.tools }),
      ...(message.agent.disallowedTools && { disallowedTools: message.agent.disallowedTools }),
      ...(message.agent.model && { model: message.agent.model }),
    };
    const agent = await updateAgent(workspacePath, message.originalName, agentInput);
    window.postMessage(
      {
        type: 'subagents:updated',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        agent,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update subagent';
    console.error('[Orbit] Update subagent error:', errorMessage);
    window.postMessage(
      {
        type: 'subagents:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleSubagentsDelete(
  message: Extract<WebviewMessage, { type: 'subagents:delete' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    await deleteAgent(workspacePath, message.name);
    window.postMessage(
      {
        type: 'subagents:deleted',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        name: message.name,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to delete subagent';
    console.error('[Orbit] Delete subagent error:', errorMessage);
    window.postMessage(
      {
        type: 'subagents:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleSubagentsGenerate(
  message: Extract<WebviewMessage, { type: 'subagents:generate' }>
): Promise<void> {
  try {
    const agent = await generateAgentDefinition(message.description);
    window.postMessage(
      {
        type: 'subagents:generated',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        agent,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate subagent';
    console.error('[Orbit] Generate subagent error:', errorMessage);
    window.postMessage(
      {
        type: 'subagents:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}
