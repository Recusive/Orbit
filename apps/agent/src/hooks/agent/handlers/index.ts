import {
  handleMessageSend,
  handleAgentStop,
  handlePermissionResponse,
  handleThinkingSet,
  handleModelSet,
  handleInputModeSet,
} from './agent-sdk-handlers';
import {
  handleBrowserBack,
  handleBrowserBounds,
  handleBrowserClear,
  handleBrowserCreate,
  handleBrowserDevTools,
  handleBrowserForward,
  handleBrowserHide,
  handleBrowserNavigate,
  handleBrowserReload,
  handleBrowserShow,
  handleBrowserStop,
} from './browser-handlers';
import { handleBrowserToolResponse } from './browser-tool-handler';
import {
  handleCommandsList,
  handleCommandsCreate,
  handleCommandsUpdate,
  handleCommandsDelete,
  handleCommandsGenerate,
} from './command-handlers';
import {
  handleConversationCreate,
  handleConversationList,
  handleConversationLoad,
  handleConversationDelete,
  handleConversationUpdateTitle,
  handleConversationRewind,
} from './conversation-handlers';
import { handleFileTreeRequest, handleFileRead } from './file-handlers';
import {
  handleSubagentsList,
  handleSubagentsCreate,
  handleSubagentsUpdate,
  handleSubagentsDelete,
  handleSubagentsGenerate,
} from './subagent-handlers';
import {
  handleTerminalCreate,
  handleTerminalWrite,
  handleTerminalResize,
  handleTerminalClose,
} from './terminal-handlers';

import type { WebviewMessage } from '@/types/protocol';

import { useBrowserStore } from '@/stores/browser/browser-store';

// ═══════════════════════════════════════════════════════════════
// Tauri Message Handler
// ═══════════════════════════════════════════════════════════════

export async function handleTauriMessage(message: WebviewMessage): Promise<void> {
  // Handle file tree requests
  if (message.type === 'file:tree:request') {
    await handleFileTreeRequest(message);
    return;
  }

  // Handle file read requests
  if (message.type === 'file:read') {
    await handleFileRead(message);
    return;
  }

  // Handle terminal creation
  if (message.type === 'terminal:create') {
    await handleTerminalCreate(message);
    return;
  }

  // Handle terminal write
  if (message.type === 'terminal:write') {
    await handleTerminalWrite(message);
    return;
  }

  // Handle terminal resize
  if (message.type === 'terminal:resize') {
    await handleTerminalResize(message);
    return;
  }

  // Handle terminal close
  if (message.type === 'terminal:close') {
    await handleTerminalClose(message);
    return;
  }

  // Handle conversation creation
  if (message.type === 'conversation:create') {
    await handleConversationCreate(message);
    return;
  }

  // Handle conversation list request
  if (message.type === 'conversation:list') {
    await handleConversationList(message);
    return;
  }

  // Handle conversation load request
  if (message.type === 'conversation:load') {
    await handleConversationLoad(message);
    return;
  }

  // Handle conversation delete request
  if (message.type === 'conversation:delete') {
    await handleConversationDelete(message);
    return;
  }

  // Handle conversation title update
  if (message.type === 'conversation:updateTitle') {
    await handleConversationUpdateTitle(message);
    return;
  }

  // Handle conversation rewind request (fork)
  // TESTED: This rewind flow is covered by integration tests.
  //     If you modify this, run: cd agent-bridge && bun test
  //     Test file: src/__tests__/combined-rewind.test.ts
  if (message.type === 'conversation:rewind') {
    await handleConversationRewind(message);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Agent SDK Message Handlers
  // ═══════════════════════════════════════════════════════════════

  // Handle sending a message to the agent
  if (message.type === 'message:send') {
    await handleMessageSend(message);
    return;
  }

  // Handle stopping the agent
  if (message.type === 'agent:stop') {
    await handleAgentStop(message);
    return;
  }

  // Handle permission response
  if (message.type === 'permission:response') {
    await handlePermissionResponse(message);
    return;
  }

  // Handle thinking mode change
  if (message.type === 'thinking:set') {
    await handleThinkingSet(message);
    return;
  }

  // Handle model change
  if (message.type === 'model:set') {
    await handleModelSet(message);
    return;
  }

  // Handle input mode change
  if (message.type === 'inputMode:set') {
    await handleInputModeSet(message);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Subagent Management Handlers
  // ═══════════════════════════════════════════════════════════════

  if (message.type === 'subagents:list') {
    await handleSubagentsList(message);
    return;
  }

  if (message.type === 'subagents:create') {
    await handleSubagentsCreate(message);
    return;
  }

  if (message.type === 'subagents:update') {
    await handleSubagentsUpdate(message);
    return;
  }

  if (message.type === 'subagents:delete') {
    await handleSubagentsDelete(message);
    return;
  }

  if (message.type === 'subagents:generate') {
    await handleSubagentsGenerate(message);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Command Management Handlers
  // ═══════════════════════════════════════════════════════════════

  if (message.type === 'commands:list') {
    await handleCommandsList(message);
    return;
  }

  if (message.type === 'commands:create') {
    await handleCommandsCreate(message);
    return;
  }

  if (message.type === 'commands:update') {
    await handleCommandsUpdate(message);
    return;
  }

  if (message.type === 'commands:delete') {
    await handleCommandsDelete(message);
    return;
  }

  if (message.type === 'commands:generate') {
    await handleCommandsGenerate(message);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Browser Handlers (Embedded WebKit Webview)
  // ═══════════════════════════════════════════════════════════════

  if (message.type === 'browser:create') {
    await handleBrowserCreate(message);
    return;
  }

  if (message.type === 'browser:navigate') {
    await handleBrowserNavigate(message);
    return;
  }

  if (message.type === 'browser:bounds') {
    await handleBrowserBounds(message);
    return;
  }

  if (message.type === 'browser:clear') {
    await handleBrowserClear(message);
    return;
  }

  if (message.type === 'browser:devtools') {
    await handleBrowserDevTools(message);
    return;
  }

  // Navigation handlers
  if (message.type === 'browser:back') {
    await handleBrowserBack(message);
    return;
  }

  if (message.type === 'browser:forward') {
    await handleBrowserForward(message);
    return;
  }

  if (message.type === 'browser:reload') {
    await handleBrowserReload(message);
    return;
  }

  if (message.type === 'browser:stop') {
    await handleBrowserStop(message);
    return;
  }

  // Visibility handlers
  if (message.type === 'browser:show') {
    await handleBrowserShow(message);
    return;
  }

  if (message.type === 'browser:hide') {
    await handleBrowserHide(message);
    return;
  }

  if (message.type === 'browser:tool_response') {
    await handleBrowserToolResponse(message);
    return;
  }

  // Legacy: browser:detect (deprecated - use browser:create instead)
  // Inline the deprecated handler logic to avoid calling deprecated function
  if (message.type === 'browser:detect') {
    const browserStore = useBrowserStore.getState();
    browserStore.setCreating(false);
    browserStore.setError(
      'External browser detection is no longer supported. The browser is now embedded within Orbit.'
    );

    window.postMessage(
      {
        type: 'browser:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: 'Use browser:create to create an embedded browser',
      },
      '*'
    );
    return;
  }

  // Other message types are handled elsewhere or not applicable
}
