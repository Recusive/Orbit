import { createLogger } from '@orbit/common/lib';

import {
  clickEffect,
  createCursor,
  getCursorPosition,
  hideCursor,
  highlight,
  moveTo,
  resolveTarget,
  showCursor,
} from './cursor';
import { clearInput, computeCharDelay, typeIntoProseMirror, typeText } from './typing-engine';
import {
  resolveSessionIdForWait,
  sleep,
  waitForAgentComplete,
  waitForAgentStarted,
  waitForStreamingStarted,
} from './wait-utils';

import type {
  DemoDeps,
  DemoStep,
  ExecuteStepContext,
  ExecuteStepResult,
  PanelAction,
} from './types';

import { SIDEBAR } from '@/lib/utils/constants';
import { useChatStore } from '@/stores/chat/chat-store';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('DemoActions');

const DEFAULT_MOVE_DURATION_MS = 600;
const DEFAULT_WAIT_FOR_AGENT_TIMEOUT_MS = 120_000;
const DEFAULT_WAIT_FOR_STREAMING_TIMEOUT_MS = 30_000;

let lastSentSessionId: string | null = null;

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function scaleMs(ms: number, speedMultiplier: number): number {
  return Math.max(0, Math.round(ms * speedMultiplier));
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path);
}

function resolveWorkspacePath(path: string): string {
  if (isAbsolutePath(path)) {
    return path;
  }

  const workspacePath = useUIStore.getState().workspacePath;
  if (!workspacePath) {
    return path;
  }

  const workspacePrefix = workspacePath.replace(/[/\\]+$/, '');
  const relativePath = path.replace(/^[/\\]+/, '');
  return `${workspacePrefix}/${relativePath}`;
}

function ensurePanelOpen(panel: PanelAction): void {
  const ui = useUIStore.getState();

  switch (panel) {
    case 'sidebar': {
      if (ui.leftSidebarWidth <= SIDEBAR.collapsed) {
        ui.toggleLeftSidebar();
      }
      return;
    }
    case 'terminal': {
      if (!ui.bottomPanelOpen || ui.terminalCollapsed) {
        ui.toggleBottomPanel();
      }
      return;
    }
    case 'vault': {
      if (!ui.vaultOpen) {
        ui.toggleVault();
      }
      return;
    }
    case 'activity': {
      if (!ui.reviewPanelOpen) {
        ui.toggleReviewPanel();
      }
      return;
    }
    case 'sourceControl': {
      ui.openSourceControl();
      return;
    }
    case 'browser': {
      ui.openBrowserTab();
      return;
    }
    case 'files': {
      ui.openFileTab();
      return;
    }
    default: {
      const _never: never = panel;
      return _never;
    }
  }
}

function ensurePanelClosed(panel: PanelAction): void {
  const ui = useUIStore.getState();

  switch (panel) {
    case 'sidebar': {
      if (ui.leftSidebarWidth > SIDEBAR.collapsed) {
        ui.toggleLeftSidebar();
      }
      return;
    }
    case 'terminal': {
      if (ui.bottomPanelOpen) {
        useUIStore.setState({ bottomPanelOpen: false });
      }
      return;
    }
    case 'vault': {
      if (ui.vaultOpen) {
        ui.setVaultOpen(false);
      }
      return;
    }
    case 'activity':
    case 'sourceControl':
    case 'browser':
    case 'files': {
      if (ui.reviewPanelOpen) {
        ui.toggleReviewPanel();
      }
      return;
    }
    default: {
      const _never: never = panel;
      return _never;
    }
  }
}

async function waitForAnimationFrame(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw createAbortError();
  }

  await new Promise<void>((resolve, reject) => {
    let rafId = 0;

    const onAbort = (): void => {
      cancelAnimationFrame(rafId);
      reject(createAbortError());
    };

    rafId = requestAnimationFrame(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function handleWaitForAgent(timeout: number, signal: AbortSignal): Promise<void> {
  const activeSessionId = useChatStore.getState().activeSessionId ?? '';
  const sessionId = lastSentSessionId ?? activeSessionId;

  if (!sessionId) {
    throw new Error('No session to wait on — call sendMessage first or ensure an active session');
  }

  const session = useChatStore.getState().sessions[sessionId];

  try {
    if (session?.isAgentRunning) {
      await waitForAgentComplete(sessionId, timeout, signal);
      return;
    }

    if (lastSentSessionId === sessionId) {
      await waitForAgentStarted(sessionId, 30_000, signal);
      await waitForAgentComplete(sessionId, timeout, signal);
      return;
    }

    logger.warn('[Demo] waitForAgent: agent not running and no recent send — skipping');
  } finally {
    lastSentSessionId = null;
  }
}

async function handleSendMessage(
  step: Extract<DemoStep, { action: 'sendMessage' }>,
  deps: DemoDeps,
  context: ExecuteStepContext
): Promise<ExecuteStepResult> {
  const inputTarget = resolveTarget('[data-demo-input]');
  if (inputTarget.skipped || !inputTarget.el) {
    return { skipped: true };
  }

  await moveTo(inputTarget.point, {
    durationMs: scaleMs(DEFAULT_MOVE_DURATION_MS, context.speedMultiplier),
    signal: context.signal,
    ...(inputTarget.rect ? { targetRect: inputTarget.rect } : {}),
  });
  await clickEffect(inputTarget.point, context.signal);

  const typedInputElement = await typeText(step.text, {
    inputElement: inputTarget.el,
    signal: context.signal,
    speedMultiplier: context.speedMultiplier,
    ...(step.charDelay !== undefined ? { charDelay: step.charDelay } : {}),
  });

  await waitForAnimationFrame(context.signal);

  const sendTarget = resolveTarget('[data-demo-send]');
  if (sendTarget.skipped) {
    return { skipped: true };
  }

  await moveTo(sendTarget.point, {
    durationMs: scaleMs(360, context.speedMultiplier),
    signal: context.signal,
    ...(sendTarget.rect ? { targetRect: sendTarget.rect } : {}),
  });
  await clickEffect(sendTarget.point, context.signal);

  const activeSessionId = useChatStore.getState().activeSessionId ?? '';
  if (activeSessionId) {
    const session = useChatStore.getState().sessions[activeSessionId];
    if (session?.isAgentRunning) {
      logger.warn(
        '[Demo] sendMessage while agent is running — message will be queued by handleSend. ' +
          'The next waitForAgent resolves for the CURRENT turn, not the queued message. ' +
          'Add { action: "waitForAgent" } between sends to ensure sequential execution.'
      );
    }
  }

  deps.handleSend(step.text);
  clearInput(typedInputElement);
  lastSentSessionId = await resolveSessionIdForWait(15_000, context.signal);

  return {};
}

export function resetDemoActionState(): void {
  lastSentSessionId = null;
}

export async function executeDemoStep(
  step: DemoStep,
  deps: DemoDeps,
  context: ExecuteStepContext
): Promise<ExecuteStepResult> {
  switch (step.action) {
    case 'moveTo': {
      const resolved = resolveTarget(step.target);
      if (resolved.skipped) {
        return { skipped: true };
      }

      await moveTo(resolved.point, {
        durationMs: scaleMs(step.duration ?? DEFAULT_MOVE_DURATION_MS, context.speedMultiplier),
        signal: context.signal,
        ...(resolved.rect ? { targetRect: resolved.rect } : {}),
      });
      return {};
    }

    case 'click': {
      if (step.target !== undefined) {
        const resolved = resolveTarget(step.target);
        if (resolved.skipped) {
          return { skipped: true };
        }

        await moveTo(resolved.point, {
          durationMs: scaleMs(260, context.speedMultiplier),
          signal: context.signal,
          ...(resolved.rect ? { targetRect: resolved.rect } : {}),
        });

        await clickEffect(resolved.point, context.signal);

        if (step.dispatch && resolved.el) {
          resolved.el.click();
        }

        return {};
      }

      await clickEffect(getCursorPosition(), context.signal);
      return {};
    }

    case 'type': {
      await typeText(step.text, {
        signal: context.signal,
        speedMultiplier: context.speedMultiplier,
        ...(step.charDelay !== undefined ? { charDelay: step.charDelay } : {}),
      });
      return {};
    }

    case 'sendMessage': {
      return handleSendMessage(step, deps, context);
    }

    case 'waitForAgent': {
      const timeout = step.timeout ?? DEFAULT_WAIT_FOR_AGENT_TIMEOUT_MS;
      await handleWaitForAgent(timeout, context.signal);
      return {};
    }

    case 'waitForStreaming': {
      const timeout = step.timeout ?? DEFAULT_WAIT_FOR_STREAMING_TIMEOUT_MS;
      const activeSessionId = useChatStore.getState().activeSessionId ?? '';
      const sessionId = lastSentSessionId ?? activeSessionId;

      if (!sessionId) {
        throw new Error(
          'No session to wait on — call sendMessage first or ensure an active session'
        );
      }

      const session = useChatStore.getState().sessions[sessionId];
      if (!session?.isAgentRunning && lastSentSessionId === sessionId) {
        await waitForAgentStarted(sessionId, 30_000, context.signal);
      }

      await waitForStreamingStarted(sessionId, timeout, context.signal);
      return {};
    }

    case 'wait': {
      await sleep(scaleMs(step.ms, context.speedMultiplier), context.signal);
      return {};
    }

    case 'togglePanel': {
      if (step.state === 'closed') {
        ensurePanelClosed(step.panel);
      } else {
        ensurePanelOpen(step.panel);
      }
      return {};
    }

    case 'openFile': {
      deps.handleOpenFile(resolveWorkspacePath(step.path));
      return {};
    }

    case 'switchTab': {
      useUIStore.getState().setActiveTab(step.tab);
      return {};
    }

    case 'scroll': {
      const resolved = resolveTarget(step.target);
      if (resolved.skipped || !resolved.el) {
        return { skipped: true };
      }

      await moveTo(resolved.point, {
        durationMs: scaleMs(250, context.speedMultiplier),
        signal: context.signal,
        ...(resolved.rect ? { targetRect: resolved.rect } : {}),
      });

      const directionMultiplier = step.direction === 'down' ? 1 : -1;
      resolved.el.scrollBy({ top: step.amount * directionMultiplier, behavior: 'smooth' });
      await sleep(scaleMs(320, context.speedMultiplier), context.signal);
      return {};
    }

    case 'highlight': {
      const resolved = resolveTarget(step.target);
      if (resolved.skipped || !resolved.el) {
        return { skipped: true };
      }

      await highlight(
        resolved.el,
        scaleMs(step.duration ?? 1_000, context.speedMultiplier),
        context.signal
      );
      return {};
    }

    case 'showCursor': {
      createCursor();
      showCursor();
      return {};
    }

    case 'hideCursor': {
      hideCursor();
      return {};
    }

    case 'terminalType': {
      const { writeTerminal } = await import('@/lib/api/terminal');

      // Poll for terminal PTY connection — the panel opens async:
      // React mount → useEffect → xterm → ResizeObserver → Tauri invoke → response
      const maxWaitMs = 10_000;
      const pollIntervalMs = 200;
      let waitedMs = 0;
      let session = useTerminalStore.getState().getActiveSession();

      while (!session?.terminalId && waitedMs < maxWaitMs) {
        await sleep(pollIntervalMs, context.signal);
        waitedMs += pollIntervalMs;
        session = useTerminalStore.getState().getActiveSession();
      }

      if (!session?.terminalId) {
        logger.warn('[Demo] No active terminal session after waiting — skipping terminalType');
        return { skipped: true };
      }

      logger.debug(`[Demo] Terminal ready after ${String(waitedMs)}ms`);

      const text = step.text.endsWith('\n') ? step.text : `${step.text}\n`;
      const baseDelay = step.charDelay ?? 60;

      for (const char of text) {
        if (context.signal.aborted) {
          throw createAbortError();
        }

        await writeTerminal(session.terminalId, char);
        await sleep(
          scaleMs(baseDelay + computeCharDelay(char, 0, 1), context.speedMultiplier),
          context.signal
        );
      }

      return {};
    }

    case 'typeInto': {
      const resolved = resolveTarget(step.target);
      if (resolved.skipped || !resolved.el) {
        return { skipped: true };
      }

      await moveTo(resolved.point, {
        durationMs: scaleMs(DEFAULT_MOVE_DURATION_MS, context.speedMultiplier),
        signal: context.signal,
        ...(resolved.rect ? { targetRect: resolved.rect } : {}),
      });
      await clickEffect(resolved.point, context.signal);

      if (resolved.el.classList.contains('ProseMirror')) {
        await typeIntoProseMirror(resolved.el, step.text, {
          signal: context.signal,
          speedMultiplier: context.speedMultiplier,
          ...(step.charDelay !== undefined ? { charDelay: step.charDelay } : {}),
        });
      } else {
        await typeText(step.text, {
          inputElement: resolved.el,
          signal: context.signal,
          speedMultiplier: context.speedMultiplier,
          ...(step.charDelay !== undefined ? { charDelay: step.charDelay } : {}),
        });
      }

      return {};
    }

    case 'keyCombo': {
      const modifierNames = ['meta', 'cmd', 'ctrl', 'shift', 'alt'];
      const parts = step.keys.toLowerCase().split('+');
      const keyName = parts.find((p) => !modifierNames.includes(p)) ?? '';
      const metaKey = parts.includes('meta') || parts.includes('cmd');
      const ctrlKey = parts.includes('ctrl');
      const shiftKey = parts.includes('shift');
      const altKey = parts.includes('alt');

      const targetEl = step.target
        ? resolveTarget(step.target).el
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (!targetEl) {
        logger.warn('[Demo] No focused element for keyCombo — skipping');
        return { skipped: true };
      }

      const eventInit: KeyboardEventInit = {
        key: keyName,
        bubbles: true,
        cancelable: true,
        metaKey,
        ctrlKey,
        shiftKey,
        altKey,
      };

      targetEl.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      await sleep(50, context.signal);
      targetEl.dispatchEvent(new KeyboardEvent('keyup', eventInit));

      return {};
    }

    case 'label': {
      logger.warn(`[Demo] ▸ ${step.text}`);
      return {};
    }

    default: {
      const _never: never = step;
      return _never;
    }
  }
}
