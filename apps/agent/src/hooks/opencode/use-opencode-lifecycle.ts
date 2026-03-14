import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { onOpencodeCrashed, opencodeStart, opencodeStatus, opencodeStop } from '@/lib/api/opencode';
import { getConversationUiBridge } from '@/services/conversations';
import { destroyClient, initClient, ocSessionService, ocSseManager } from '@/services/opencode';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useActiveBackend, useBackendStore } from '@/stores/backend';
import { useChatStore } from '@/stores/chat/chat-store';
import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore, useWorkspacePath } from '@/stores/ui/ui-store';

const logger = createLogger('OpenCodeLifecycle');

function cleanupClaudeState(): void {
  useQueuedMessageStore.getState().clearQueue();
  useToolStore.getState().clearPermissions();
  const activeSession = useChatStore.getState().activeSessionId;
  if (activeSession) {
    useCheckpointStore.getState().clearSessionCheckpoints(activeSession);
  }
}

function cleanupOpenCodeState(): void {
  ocSseManager.disconnect();
  destroyClient();
  const sessionState = useOcSessionStore.getState();
  const sessionIds = new Set<string>([
    ...Object.keys(sessionState.sessions),
    ...Object.keys(sessionState.pendingSendSessions),
    ...(sessionState.activeSessionId ? [sessionState.activeSessionId] : []),
  ]);
  for (const sessionId of sessionIds) {
    useUIStore.getState().setTitleLoading(sessionId, false);
  }
  useOcSessionStore.setState({ pendingSendSessions: {} });
  useOcPermissionStore.getState().clearAll();
  useOcMessageStore.getState().clearAll();
}

export function useOpencodeLifecycle(): void {
  const activeBackend = useActiveBackend();
  const workspacePath = useWorkspacePath();
  const previousBackendRef = useRef(activeBackend);
  const restartAttemptsRef = useRef(0);
  const startupGenerationRef = useRef(0);
  const preWarmRef = useRef<Promise<void> | null>(null);
  const preWarmGenerationRef = useRef(0);

  useEffect(() => {
    if (activeBackend !== 'opencode') {
      preWarmRef.current = null;
      preWarmGenerationRef.current += 1;
      return;
    }

    if (workspacePath) {
      return;
    }

    if (useOcSessionStore.getState().activeSessionId === null) {
      return;
    }

    const generation = preWarmGenerationRef.current + 1;
    preWarmGenerationRef.current = generation;
    const isStale = (): boolean => preWarmGenerationRef.current !== generation;

    const promise = (async () => {
      try {
        const status = await opencodeStatus().catch(() => ({
          running: false,
          port: null,
          healthy: false,
          binaryPath: null,
          error: null,
        }));
        if (isStale()) {
          return;
        }

        if (status.running && status.port !== null) {
          useBackendStore.getState().setOpencodePort(status.port);
          return;
        }

        const port = await opencodeStart();
        if (isStale()) {
          return;
        }

        useBackendStore.getState().setOpencodePort(port);
        logger.info('Pre-warmed OpenCode process', { port });
      } catch (error) {
        if (isStale()) {
          return;
        }

        logger.error('Pre-warm failed, will retry on workspace init', error);
      }
    })();

    preWarmRef.current = promise;
  }, [activeBackend, workspacePath]);

  const runStartup = useCallback(
    async (reason: 'activate' | 'workspace' | 'restart'): Promise<void> => {
      if (activeBackend !== 'opencode' || !workspacePath) {
        return;
      }

      const generation = startupGenerationRef.current + 1;
      startupGenerationRef.current = generation;
      const isStale = (): boolean => startupGenerationRef.current !== generation;

      logger.info('Starting OpenCode', { reason, workspacePath, generation });
      useBackendStore.getState().setSwitchingBackend(true);

      try {
        if (preWarmRef.current) {
          await preWarmRef.current.catch(() => undefined);
          preWarmRef.current = null;
          if (isStale()) {
            logger.info('Startup cancelled: stale generation (after pre-warm wait)', {
              generation,
            });
            return;
          }
        }

        const status = await opencodeStatus().catch(() => ({
          running: false,
          port: null,
          healthy: false,
          binaryPath: null,
          error: null,
        }));
        if (isStale()) {
          logger.info('Startup cancelled: stale generation (after status check)', { generation });
          return;
        }

        logger.info('Status check result', {
          running: status.running,
          port: status.port,
          healthy: status.healthy,
        });

        const port = status.running && status.port !== null ? status.port : await opencodeStart();
        if (isStale()) {
          logger.info('Startup cancelled: stale generation (after start)', { generation });
          return;
        }

        logger.info('Port assigned', { port, source: status.running ? 'existing' : 'started' });

        useBackendStore.getState().setOpencodePort(port);
        initClient(port, workspacePath);
        if (isStale()) {
          destroyClient();
          logger.info('Startup cancelled: stale generation (after client init)', { generation });
          return;
        }

        logger.info('Client initialized, connecting SSE', { port, workspacePath });
        ocSseManager.connect();
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          logger.info('Startup cancelled: stale generation (after SSE connect)', { generation });
          return;
        }

        const [sessions] = await Promise.all([
          ocSessionService.listSessions(),
          ocSessionService.loadProviders().catch((error: unknown) => {
            logger.error('Failed to load providers (non-fatal)', error);
          }),
        ]);
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          logger.info('Startup cancelled: stale generation (after data load)', { generation });
          return;
        }

        useBackendStore.getState().setOpencodeHealthy(true);
        logger.info('Data loaded, restoring selection');
        await getConversationUiBridge('opencode').restoreSelection({
          listedSessionIds: new Set(sessions.map((session) => session.id)),
        });
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          logger.info('Startup cancelled: stale generation (after restore)', { generation });
          return;
        }

        if (reason !== 'restart') {
          restartAttemptsRef.current = 0;
        }
        logger.info('Startup complete', { port, workspacePath, reason });
      } catch (error) {
        if (isStale()) {
          logger.info('Startup error suppressed: stale generation', { generation });
          return;
        }

        useBackendStore.getState().setOpencodeHealthy(false);
        logger.error('Failed to start OpenCode', error);
        toast.error('Failed to start OpenCode backend');
      } finally {
        if (!isStale()) {
          useBackendStore.getState().setSwitchingBackend(false);
        }
      }
    },
    [activeBackend, workspacePath]
  );

  useEffect(() => {
    const backendJustChanged = previousBackendRef.current !== activeBackend;

    if (backendJustChanged) {
      startupGenerationRef.current += 1;

      if (activeBackend === 'opencode') {
        logger.info('Backend switched to opencode, cleaning up Claude state');
        cleanupClaudeState();
      } else if (previousBackendRef.current === 'opencode') {
        logger.info('Backend switched away from opencode, cleaning up');
        cleanupOpenCodeState();
        useBackendStore.getState().setOpencodeHealthy(false);
        useBackendStore.getState().setOpencodePort(null);
        void opencodeStop().catch((error: unknown) => {
          logger.error('Failed to stop OpenCode backend', error);
        });
      }

      previousBackendRef.current = activeBackend;
    }

    if (activeBackend !== 'opencode') {
      return;
    }

    if (!workspacePath) {
      logger.warn('No workspace path, cleaning up OpenCode state');
      startupGenerationRef.current += 1;
      cleanupOpenCodeState();
      useBackendStore.getState().setOpencodeHealthy(false);
      return;
    }

    const reason = backendJustChanged ? 'activate' : 'workspace';
    void runStartup(reason);
  }, [activeBackend, runStartup, workspacePath]);

  useEffect(() => {
    let unlistenCrashed: (() => void) | undefined;

    void onOpencodeCrashed((event) => {
      logger.error('OpenCode backend crashed', new Error(event.error));

      if (
        useBackendStore.getState().activeBackend !== 'opencode' ||
        !useUIStore.getState().workspacePath
      ) {
        return;
      }

      if (restartAttemptsRef.current >= 3) {
        return;
      }

      restartAttemptsRef.current += 1;
      void runStartup('restart').catch((error: unknown) => {
        logger.error('Failed to restart OpenCode backend after crash', error);
      });
    }).then((unlisten) => {
      unlistenCrashed = unlisten;
    });

    return () => {
      unlistenCrashed?.();
    };
  }, [runStartup]);
}
