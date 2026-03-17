import { createLogger } from '@orbit/common/lib';

import { getClient } from './client';
import { ocEventCoordinator } from './oc-event-coordinator';

const logger = createLogger('OcSseManager');

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

class OcSseManager {
  private controller: AbortController | null = null;
  private generation = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    this.disconnect();
    this.generation += 1;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    logger.info('SSE connecting', { generation });
    void this.run(generation, controller.signal, 1000);
  }

  disconnect(): void {
    const previousGeneration = this.generation;
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    logger.info('SSE disconnecting', { previousGeneration, newGeneration: this.generation });
  }

  private async run(
    generation: number,
    signal: AbortSignal,
    reconnectDelayMs: number
  ): Promise<void> {
    try {
      const stream = await getClient().global.event({
        signal,
        throwOnError: true,
      });

      logger.info('SSE stream opened', { generation });

      for await (const event of stream.stream) {
        if (signal.aborted || generation !== this.generation) {
          logger.debug('SSE event loop exiting: stale generation or aborted', {
            generation,
            currentGeneration: this.generation,
          });
          return;
        }
        logger.debug('SSE event received', {
          generation,
          eventType: event.payload.type,
          directory: event.directory,
        });
        ocEventCoordinator.handleGlobalEvent(event);
      }

      logger.info('SSE stream ended normally, scheduling reconnect', { generation });
      this.scheduleReconnect(generation, signal, reconnectDelayMs);
    } catch (error) {
      if (signal.aborted || generation !== this.generation || isAbortError(error)) {
        logger.debug('SSE error suppressed: stale generation or abort', { generation });
        return;
      }

      logger.warn('OpenCode event stream disconnected; scheduling reconnect', {
        generation,
        delayMs: reconnectDelayMs,
      });
      this.scheduleReconnect(generation, signal, reconnectDelayMs);
    }
  }

  private scheduleReconnect(
    generation: number,
    signal: AbortSignal,
    reconnectDelayMs: number
  ): void {
    if (signal.aborted || generation !== this.generation) {
      logger.debug('SSE reconnect cancelled: stale generation', {
        generation,
        currentGeneration: this.generation,
      });
      return;
    }

    const nextDelay = Math.min(reconnectDelayMs * 2, 30_000);
    logger.info('SSE reconnecting', {
      generation,
      delayMs: reconnectDelayMs,
      nextDelayMs: nextDelay,
    });
    this.reconnectTimer = setTimeout(() => {
      if (signal.aborted || generation !== this.generation) {
        logger.debug('SSE reconnect timer fired but generation stale', {
          generation,
          currentGeneration: this.generation,
        });
        return;
      }
      void this.run(generation, signal, nextDelay);
    }, reconnectDelayMs);
  }
}

export const ocSseManager = new OcSseManager();
