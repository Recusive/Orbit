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
import { useOcMessageStore, useOcPermissionStore } from '@/stores/opencode';
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
  useOcPermissionStore.getState().clearAll();
  useOcMessageStore.getState().clearAll();
}

export function useOpencodeLifecycle(): void {
  const activeBackend = useActiveBackend();
  const workspacePath = useWorkspacePath();
  const previousBackendRef = useRef(activeBackend);
  const restartAttemptsRef = useRef(0);
  const startupGenerationRef = useRef(0);

  const runStartup = useCallback(
    async (reason: 'activate' | 'workspace' | 'restart'): Promise<void> => {
      if (activeBackend !== 'opencode' || !workspacePath) {
        return;
      }

      const generation = startupGenerationRef.current + 1;
      startupGenerationRef.current = generation;
      const isStale = (): boolean => startupGenerationRef.current !== generation;

      useBackendStore.getState().setSwitchingBackend(true);

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

        const port = status.running && status.port !== null ? status.port : await opencodeStart();
        if (isStale()) {
          return;
        }

        useBackendStore.getState().setOpencodePort(port);
        initClient(port, workspacePath);
        if (isStale()) {
          destroyClient();
          return;
        }

        ocSseManager.connect();
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          return;
        }

        await Promise.all([ocSessionService.listSessions(), ocSessionService.loadProviders()]);
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          return;
        }

        await getConversationUiBridge('opencode').restoreSelection();
        if (isStale()) {
          ocSseManager.disconnect();
          destroyClient();
          return;
        }

        useBackendStore.getState().setOpencodeHealthy(true);
        if (reason !== 'restart') {
          restartAttemptsRef.current = 0;
        }
      } catch (error) {
        if (isStale()) {
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
        cleanupClaudeState();
      } else if (previousBackendRef.current === 'opencode') {
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
