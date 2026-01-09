import type { WebviewMessage } from '@/types/protocol';

import {
  getWorkspacePath,
  listCommands,
  createCommand,
  updateCommand,
  deleteCommand,
  generateCommandDefinition,
} from '@/lib/api/backend';

export async function handleCommandsList(
  message: Extract<WebviewMessage, { type: 'commands:list' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    const commands = await listCommands(workspacePath);
    window.postMessage(
      {
        type: 'commands:list:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        commands,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to list commands';
    console.error('[Orbit] List commands error:', errorMessage);
    window.postMessage(
      {
        type: 'commands:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleCommandsCreate(
  message: Extract<WebviewMessage, { type: 'commands:create' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    // Filter undefined values to match exactOptionalPropertyTypes
    const commandInput = {
      name: message.command.name,
      content: message.command.content,
      scope: message.command.scope,
      ...(message.command.description && { description: message.command.description }),
      ...(message.command.allowedTools && { allowedTools: message.command.allowedTools }),
      ...(message.command.argumentHint && { argumentHint: message.command.argumentHint }),
      ...(message.command.model && { model: message.command.model }),
      ...(message.command.readonly !== undefined && { readonly: message.command.readonly }),
    };
    const command = await createCommand(workspacePath, commandInput);
    window.postMessage(
      {
        type: 'commands:created',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        command,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to create command';
    console.error('[Orbit] Create command error:', errorMessage);
    window.postMessage(
      {
        type: 'commands:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleCommandsUpdate(
  message: Extract<WebviewMessage, { type: 'commands:update' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    // Filter undefined values to match exactOptionalPropertyTypes
    const commandInput = {
      name: message.command.name,
      content: message.command.content,
      scope: message.command.scope,
      ...(message.command.description && { description: message.command.description }),
      ...(message.command.allowedTools && { allowedTools: message.command.allowedTools }),
      ...(message.command.argumentHint && { argumentHint: message.command.argumentHint }),
      ...(message.command.model && { model: message.command.model }),
      ...(message.command.readonly !== undefined && { readonly: message.command.readonly }),
    };
    const command = await updateCommand(workspacePath, message.originalName, commandInput);
    window.postMessage(
      {
        type: 'commands:updated',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        command,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update command';
    console.error('[Orbit] Update command error:', errorMessage);
    window.postMessage(
      {
        type: 'commands:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleCommandsDelete(
  message: Extract<WebviewMessage, { type: 'commands:delete' }>
): Promise<void> {
  try {
    const workspacePath = (await getWorkspacePath()) ?? '/';
    await deleteCommand(workspacePath, message.name, message.scope);
    window.postMessage(
      {
        type: 'commands:deleted',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        name: message.name,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to delete command';
    console.error('[Orbit] Delete command error:', errorMessage);
    window.postMessage(
      {
        type: 'commands:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleCommandsGenerate(
  message: Extract<WebviewMessage, { type: 'commands:generate' }>
): Promise<void> {
  try {
    const command = await generateCommandDefinition(message.description);
    window.postMessage(
      {
        type: 'commands:generated',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        command,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate command';
    console.error('[Orbit] Generate command error:', errorMessage);
    window.postMessage(
      {
        type: 'commands:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}
