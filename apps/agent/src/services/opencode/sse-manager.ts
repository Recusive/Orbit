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
    void this.run(generation, controller.signal, 1000);
  }

  disconnect(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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

      for await (const event of stream.stream) {
        if (signal.aborted || generation !== this.generation) {
          return;
        }
        ocEventCoordinator.handleGlobalEvent(event);
      }

      this.scheduleReconnect(generation, signal, reconnectDelayMs);
    } catch (error) {
      if (signal.aborted || generation !== this.generation || isAbortError(error)) {
        return;
      }

      logger.warn('OpenCode event stream disconnected; scheduling reconnect', {
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
      return;
    }

    const nextDelay = Math.min(reconnectDelayMs * 2, 30_000);
    this.reconnectTimer = setTimeout(() => {
      if (signal.aborted || generation !== this.generation) {
        return;
      }
      void this.run(generation, signal, nextDelay);
    }, reconnectDelayMs);
  }
}

export const ocSseManager = new OcSseManager();
