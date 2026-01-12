import type { WebviewMessage } from '@/types/protocol';

import { createTerminal, writeTerminal, resizeTerminal, closeTerminal } from '@/lib/api';
import { useTerminalStore } from '@/stores/terminal/terminal-store';

export async function handleTerminalCreate(
  message: Extract<WebviewMessage, { type: 'terminal:create' }>
): Promise<void> {
  try {
    const info = await createTerminal(
      message.session_id,
      message.cwd, // Pass workspace cwd from frontend
      undefined, // shell - use default
      message.cols,
      message.rows
    );
    window.postMessage(
      {
        type: 'terminal:created',
        uuid: crypto.randomUUID(),
        session_id: message.session_id,
        terminal_id: info.id,
        name: info.shell, // Use actual shell name from backend (e.g., "zsh")
        pid: info.pid,
        cwd: info.cwd,
        shell_type: info.shell,
        capabilities: {
          cwd_detection: true,
          command_detection: true,
          shell_integration: true,
        },
      },
      '*'
    );

    // Check if session has an initial command to execute (e.g., SSH)
    const session = useTerminalStore.getState().sessions.find((s) => s.id === message.session_id);
    const initialCommand = session?.initialCommand;
    if (initialCommand !== undefined && initialCommand !== '') {
      // Small delay to ensure terminal is ready
      await new Promise((resolve) => setTimeout(resolve, 150));
      await writeTerminal(info.id, `${initialCommand}\n`);
      console.warn('[Orbit] Executed initial command:', initialCommand);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to create terminal';
    console.error('[Orbit] Terminal creation error:', errorMessage);
  }
}

export async function handleTerminalWrite(
  message: Extract<WebviewMessage, { type: 'terminal:write' }>
): Promise<void> {
  try {
    await writeTerminal(message.terminal_id, message.data);
  } catch (err: unknown) {
    console.error('[Orbit] Terminal write error:', err);
  }
}

export async function handleTerminalResize(
  message: Extract<WebviewMessage, { type: 'terminal:resize' }>
): Promise<void> {
  try {
    await resizeTerminal(message.terminal_id, message.cols, message.rows);
  } catch (err: unknown) {
    console.error('[Orbit] Terminal resize error:', err);
  }
}

export async function handleTerminalClose(
  message: Extract<WebviewMessage, { type: 'terminal:close' }>
): Promise<void> {
  try {
    await closeTerminal(message.terminal_id);
  } catch (err: unknown) {
    console.error('[Orbit] Terminal close error:', err);
  }
}
