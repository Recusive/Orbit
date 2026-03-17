import { createLogger } from '@orbit/common/lib';

import { executeDemoStep, resetDemoActionState } from './actions';
import { destroyCursor } from './cursor';
import { isAbortError } from './wait-utils';

import type {
  DemoConfig,
  DemoDeps,
  DemoRunnerControls,
  DemoScript,
  ExecuteStepContext,
  StepResult,
} from './types';

const logger = createLogger('DemoScriptRunner');

let activeRunnerAbort: AbortController | null = null;

function normalizeSpeedMultiplier(config?: DemoConfig): number {
  const speedMultiplier = config?.speedMultiplier;
  if (speedMultiplier === undefined) {
    return 1;
  }

  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    return 1;
  }

  return speedMultiplier;
}

function createPauseGate(signal: AbortSignal): {
  pause: () => void;
  resume: () => void;
  waitIfPaused: () => Promise<void>;
} {
  let isPaused = false;
  let resumeResolver: (() => void) | null = null;
  let removeAbortListener: (() => void) | null = null;

  const waitIfPaused = async (): Promise<void> => {
    if (!isPaused) {
      return;
    }

    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        removeAbortListener = null;
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const wrappedResolve = (): void => {
        signal.removeEventListener('abort', onAbort);
        removeAbortListener = null;
        resolve();
      };

      resumeResolver = wrappedResolve;
      removeAbortListener = (): void => {
        signal.removeEventListener('abort', onAbort);
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  const pause = (): void => {
    isPaused = true;
  };

  const resume = (): void => {
    if (!isPaused) {
      return;
    }

    isPaused = false;

    if (removeAbortListener) {
      removeAbortListener();
      removeAbortListener = null;
    }

    if (resumeResolver) {
      const resolve = resumeResolver;
      resumeResolver = null;
      resolve();
    }
  };

  return {
    pause,
    resume,
    waitIfPaused,
  };
}

export function runDemoScript(
  script: DemoScript,
  deps: DemoDeps,
  config?: DemoConfig
): DemoRunnerControls {
  activeRunnerAbort?.abort();
  destroyCursor();
  resetDemoActionState();

  const controller = new AbortController();
  activeRunnerAbort = controller;

  const pauseGate = createPauseGate(controller.signal);
  const speedMultiplier = normalizeSpeedMultiplier(config);

  const done = (async (): Promise<StepResult[]> => {
    const results: StepResult[] = [];

    try {
      logger.warn(`[Demo] Starting script "${script.name}" (${String(script.steps.length)} steps)`);

      for (let index = 0; index < script.steps.length; index += 1) {
        if (controller.signal.aborted) {
          break;
        }

        await pauseGate.waitIfPaused();

        const step = script.steps[index];
        if (!step) {
          continue;
        }

        const startedAt = performance.now();

        try {
          const context: ExecuteStepContext = {
            signal: controller.signal,
            speedMultiplier,
          };

          const outcome = await executeDemoStep(step, deps, context);
          results.push({
            index: index + 1,
            action: step.action,
            durationMs: Math.round(performance.now() - startedAt),
            success: true,
            ...(outcome.skipped ? { skipped: true } : {}),
          });
        } catch (error) {
          if (isAbortError(error)) {
            break;
          }

          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`[Demo] Step ${String(index + 1)} failed`, error);
          results.push({
            index: index + 1,
            action: step.action,
            durationMs: Math.round(performance.now() - startedAt),
            success: false,
            error: message,
          });
        }
      }
    } finally {
      destroyCursor();
      resetDemoActionState();

      if (activeRunnerAbort === controller) {
        activeRunnerAbort = null;
      }
    }

    return results;
  })();

  return {
    pause: (): void => {
      pauseGate.pause();
    },
    resume: (): void => {
      pauseGate.resume();
    },
    cancel: (): void => {
      controller.abort();
      pauseGate.resume();
      destroyCursor();
    },
    done,
  };
}
