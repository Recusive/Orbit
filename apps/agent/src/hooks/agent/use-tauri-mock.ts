import type { WebviewMessage } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Mock handler for browser development
// ═══════════════════════════════════════════════════════════════

export function handleMockMessage(message: WebviewMessage): void {
  const delay = 100;

  switch (message.type) {
    case 'message:send': {
      const messageId = crypto.randomUUID();

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'I received your message: ',
          },
          '*'
        );
      }, 1000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: `"${message.content}". `,
          },
          '*'
        );
      }, 2000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'Let me help you with that. ',
          },
          '*'
        );
      }, 3000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:complete',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            duration_ms: 3000,
          },
          '*'
        );
      }, 4000);
      break;
    }

    case 'conversation:create': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:created',
            uuid: crypto.randomUUID(),
            session_id: crypto.randomUUID(),
            title: message.title ?? 'New Conversation',
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'terminal:create': {
      const terminalId = `pty_${String(Date.now())}_${crypto.randomUUID().slice(0, 8)}`;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'terminal:created',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            terminal_id: terminalId,
            name: 'zsh', // Use shell name, not session name
            pid: 12345,
            cwd: '/mock/workspace',
            shell_type: 'zsh',
            capabilities: {
              cwd_detection: true,
              command_detection: true,
              shell_integration: true,
            },
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:list': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:list',
            uuid: crypto.randomUUID(),
            conversations: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:load': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:loaded',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            title: 'Mock Conversation',
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:rewind': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: message.session_id,
            rewind_to_message_id: message.message_id,
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:tree:request': {
      const mockPath = message.path ?? '/mock/workspace';
      setTimeout(() => {
        window.postMessage(
          {
            type: 'file:tree:response',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            path: mockPath,
            children: [
              { name: 'src', path: `${mockPath}/src`, isDirectory: true, isFile: false },
              { name: 'tests', path: `${mockPath}/tests`, isDirectory: true, isFile: false },
              {
                name: 'package.json',
                path: `${mockPath}/package.json`,
                isDirectory: false,
                isFile: true,
              },
              {
                name: 'README.md',
                path: `${mockPath}/README.md`,
                isDirectory: false,
                isFile: true,
              },
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    // All other message types don't need mock responses
    case 'webview:ready':
    case 'message:edit':
    case 'message:delete':
    case 'conversation:delete':
    case 'conversation:updateTitle':
    case 'agent:start':
    case 'agent:stop':
    case 'agent:pause':
    case 'agent:resume':
    case 'terminal:close':
    case 'terminal:command':
    case 'terminal:clear':
    case 'terminal:write':
    case 'terminal:resize':
    case 'terminal:signal':
    case 'terminal:ack':
    case 'file:open':
    case 'file:read':
    case 'file:write':
    case 'file:accept':
    case 'file:reject':
    case 'file:accept_all':
    case 'file:reject_all':
    case 'diff:open':
    case 'url:open':
    case 'permission:response':
    case 'inputMode:set':
    case 'thinking:set':
    case 'effort:set':
    case 'model:set':
    case 'browser:create': {
      // Mock browser creation - send success response
      const createMsg = message as Extract<typeof message, { type: 'browser:create' }>;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'browser:created',
            uuid: crypto.randomUUID(),
            request_uuid: createMsg.uuid,
            label: 'mock-browser',
            url: createMsg.bounds.url,
          },
          '*'
        );
      }, 100);
      break;
    }
    case 'browser:clear':
      // Mock browser close - send cleared response
      setTimeout(() => {
        window.postMessage(
          {
            type: 'browser:cleared',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
          },
          '*'
        );
      }, 50);
      break;
    case 'browser:detect':
    case 'browser:navigate':
    case 'browser:back':
    case 'browser:forward':
    case 'browser:reload':
    case 'browser:stop':
    case 'browser:select-element:start':
    case 'browser:select-element:cancel':
    case 'browser:bounds':
    case 'browser:devtools':
    case 'browser:show':
    case 'browser:hide':
    case 'browser:tool_response':
    case 'subagents:list':
    case 'subagents:create':
    case 'subagents:update':
    case 'subagents:delete':
    case 'commands:list':
    case 'commands:create':
    case 'commands:update':
    case 'commands:delete':
    case 'subagents:generate':
    case 'commands:generate':
      break;
  }
}
