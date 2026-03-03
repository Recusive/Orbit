import type { WebviewMessage } from '@/types/protocol';

export interface DemoPoint {
  x: number;
  y: number;
}

export type DemoTarget = string | DemoPoint;

export type PanelAction =
  | 'sidebar'
  | 'activity'
  | 'terminal'
  | 'sourceControl'
  | 'browser'
  | 'vault'
  | 'files';

export type DemoStep =
  | { action: 'moveTo'; target: DemoTarget; duration?: number }
  | { action: 'click'; target?: DemoTarget; dispatch?: boolean }
  | { action: 'type'; text: string; charDelay?: number }
  | { action: 'sendMessage'; text: string; charDelay?: number }
  | { action: 'waitForAgent'; timeout?: number }
  | { action: 'waitForStreaming'; timeout?: number }
  | { action: 'wait'; ms: number }
  | { action: 'togglePanel'; panel: PanelAction; state?: 'open' | 'closed' }
  | { action: 'openFile'; path: string }
  | { action: 'switchTab'; tab: 'agent' | 'editor' | 'canvas' }
  | { action: 'scroll'; target: string; direction: 'up' | 'down'; amount: number }
  | { action: 'highlight'; target: string; duration?: number }
  | { action: 'terminalType'; text: string; charDelay?: number }
  | { action: 'typeInto'; target: string; text: string; charDelay?: number }
  | { action: 'keyCombo'; keys: string; target?: string }
  | { action: 'showCursor' }
  | { action: 'hideCursor' }
  | { action: 'label'; text: string };

export interface DemoScript {
  name: string;
  steps: DemoStep[];
}

/**
 * Deps injected from use-chat-messages.ts — only non-store deps.
 * Panel/tab actions use useUIStore.getState() directly.
 */
export interface DemoDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  handleOpenFile: (path: string) => void;
  postMessage: (message: WebviewMessage) => void;
}

export interface DemoConfig {
  /** Multiplier for all delays. 0.5 = double speed, 2 = half speed. Default: 1 */
  speedMultiplier?: number;
}

export interface CursorConfig {
  size?: number;
  humanize?: boolean;
  defaultDurationMs?: number;
}

export interface ResolvedTarget {
  el: HTMLElement | null;
  point: DemoPoint;
  rect?: DOMRect;
  skipped?: boolean;
}

export interface StepResult {
  index: number;
  action: DemoStep['action'];
  durationMs: number;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface DemoRunnerControls {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  done: Promise<StepResult[]>;
}

export interface ExecuteStepContext {
  signal: AbortSignal;
  speedMultiplier: number;
}

export interface ExecuteStepResult {
  skipped?: boolean;
}
