import { createLogger } from '@orbit/common/lib';
import { formatZodError } from '@orbit/shared-schemas';

// Import types to ensure global Window declarations are applied
import type { ExtensionMessage } from './types/tauri-types';
import './types/tauri-types';

import { chatMessageService } from '@/services/chat';
import { ExtensionMessageSchema } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Window Message Listener Singleton
// ═══════════════════════════════════════════════════════════════

const logger = createLogger('TauriMessageListener');

// ────────────────────────────────────────────────────────────────────────────
// Chat Event Routing
// ────────────────────────────────────────────────────────────────────────────
//
// Chat events are routed directly to ChatMessageService (module-level singleton).
// The service writes to ChatStore (also a module-level singleton), so messages are
// processed immediately regardless of whether React components are mounted.
//
// Non-chat events (terminal, file, browser, subagent, commands) are still dispatched
// to the messageHandlers Set for the existing handler modules.
// ────────────────────────────────────────────────────────────────────────────

/** Event types handled by ChatMessageService. All others go to handler Set. */
const CHAT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'system:init',
  'agent:chunk',
  'agent:thinking',
  'agent:complete',
  'agent:error',
  'agent:checkpoint',
  'agent:compact_complete',
  'conversation:created',
  'conversation:list',
  'conversation:loading',
  'conversation:loaded',
  'conversation:rewound',
  'conversation:deleted',
  'tool:start',
  'tool:end',
  'permission:request',
  'inputMode:changed',
  'model:changed',
  'file:content',
]);

// Initialize global handler registry if not present
window.__ORBIT_MESSAGE_HANDLERS__ ??= new Set<(message: ExtensionMessage) => void>();

// Clean up window listener on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__ORBIT_REMOVE_WINDOW_LISTENER__) {
      window.__ORBIT_REMOVE_WINDOW_LISTENER__();
      window.__ORBIT_REMOVE_WINDOW_LISTENER__ = null;
      window.__ORBIT_WINDOW_LISTENER_INITIALIZED__ = false;
      logger.debug('Window message listener cleaned up for HMR');
    }
  });
}

// Registry of message handlers for NON-CHAT events (terminal, file, browser, etc.)
// Chat events bypass this and go directly to ChatMessageService.
export const messageHandlers: Set<(message: ExtensionMessage) => void> =
  window.__ORBIT_MESSAGE_HANDLERS__;

// Singleton window message listener
export function initWindowMessageListener(): void {
  if (window.__ORBIT_WINDOW_LISTENER_INITIALIZED__) return;
  window.__ORBIT_WINDOW_LISTENER_INITIALIZED__ = true;

  // Single global UUID deduplication set
  const processedUuids = new Set<string>();

  const handleWindowMessage = (event: MessageEvent<unknown>): void => {
    const sameWindow = event.source === window;
    const sameOrigin = event.origin === window.location.origin || event.origin === 'null';
    if (!sameWindow || !sameOrigin) return;

    const result = ExtensionMessageSchema.safeParse(event.data);

    if (!result.success) {
      // Log validation failures to help debug schema mismatches
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        'type' in event.data &&
        typeof event.data.type === 'string'
      ) {
        if (event.data.type.startsWith('conversation:')) {
          logger.error('Conversation message validation failed', {
            type: event.data.type,
            error: formatZodError(result.error),
          });
        } else if (event.data.type.startsWith('agent:')) {
          logger.warn('Invalid agent message dropped', {
            type: event.data.type,
            error: formatZodError(result.error),
          });
        }
      }
      return;
    }

    // Deduplicate messages by UUID (globally, once)
    const uuid = 'uuid' in result.data ? result.data.uuid : undefined;
    if (uuid) {
      if (processedUuids.has(uuid)) {
        return;
      }
      processedUuids.add(uuid);
      // Limit set size to prevent memory leak
      if (processedUuids.size > 1000) {
        const iterator = processedUuids.values();
        for (let i = 0; i < 500; i++) {
          const value = iterator.next().value;
          if (value) processedUuids.delete(value);
        }
      }
    }

    // ─── Route: chat events → ChatMessageService ───────────────
    // Service writes directly to ChatStore (always available).
    // No buffering needed — store accepts writes even before React mounts.
    // Checkpoint batching, persistence, and buffer clearing are handled by the service.
    if (CHAT_EVENT_TYPES.has(result.data.type)) {
      chatMessageService.handleMessage(result.data);
      return;
    }

    // ─── Route: non-chat events → handler Set ──────────────────
    // Terminal, file, browser, subagent, commands — handled by existing hook modules.
    for (const handler of messageHandlers) {
      handler(result.data);
    }
  };

  window.addEventListener('message', handleWindowMessage);

  // Store removal function for HMR cleanup
  window.__ORBIT_REMOVE_WINDOW_LISTENER__ = (): void => {
    window.removeEventListener('message', handleWindowMessage);
  };

  logger.info('Singleton window message listener initialized');
}
