/**
 * Agent State Configuration
 *
 * Single source of truth for all agent state visual and behavioral properties.
 * Components import from here to derive all state-dependent rendering.
 *
 * Design tokens reference:
 * - Colors: Use CSS variables from agent's globals.css
 * - Icons: lucide-react components stored as references
 */

import {
  CheckCircle,
  Circle,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  XCircle,
} from 'lucide-react';

import type { AgentStatus } from '../types';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/**
 * Action types available for agent cards
 */
export type AgentAction =
  | 'configure'
  | 'run'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'rerun'
  | 'stop'
  | 'view-diff'
  | 'view-error';

/**
 * Complete configuration for an agent state
 * Defines all visual and behavioral properties
 */
export interface AgentStateConfig {
  // Display
  readonly label: string;
  readonly description: string;

  // Colors (CSS variable references)
  readonly iconBackground: string; // Icon background color (light mode)
  readonly iconBackgroundDark: string; // Icon background color (dark mode)
  readonly iconColor: string; // Icon foreground color
  readonly textColor: string; // Status text color

  // Icons
  readonly icon: LucideIcon; // Status indicator icon
  readonly actionIcon: LucideIcon; // Primary action button icon

  // Behavior
  readonly actionLabel: string; // Primary action button text
  readonly actionType: AgentAction; // What the primary action does
  readonly showCurrentStep: boolean; // Whether to show current step text
  readonly stepPrefix: string; // Prefix before current step (e.g., ">")
  readonly stepPlaceholder: string; // Placeholder text when no current step
  readonly isAnimated: boolean; // Whether the step text pulses
  readonly availableActions: readonly AgentAction[]; // Context menu actions
}

// ============================================================================
// State Configurations
// ============================================================================

/**
 * Complete state configuration mapping
 * All state-dependent properties defined here, nowhere else
 */
export const AGENT_STATE_CONFIG: Record<AgentStatus, AgentStateConfig> = {
  idle: {
    label: 'Idle',
    description: 'Ready to run',
    iconBackground: '#E8E8EA', // Light gray
    iconBackgroundDark: '#52525B', // Zinc 600
    iconColor: '#71717A', // Zinc 500
    textColor: 'var(--muted-foreground)',
    icon: Circle,
    actionIcon: Settings,
    actionLabel: 'Configure',
    actionType: 'configure',
    showCurrentStep: false,
    stepPrefix: '~',
    stepPlaceholder: 'Waiting to start...',
    isAnimated: false,
    availableActions: ['configure', 'run'],
  },

  pending: {
    label: 'Pending',
    description: 'Waiting for dependencies',
    iconBackground: '#FEF3C7', // Amber 100
    iconBackgroundDark: '#D97706', // Amber 600
    iconColor: '#B45309', // Amber 700
    textColor: 'var(--warning)',
    icon: Loader2,
    actionIcon: Play,
    actionLabel: 'Run',
    actionType: 'run',
    showCurrentStep: true,
    stepPrefix: '...',
    stepPlaceholder: 'Waiting for dependencies...',
    isAnimated: false,
    availableActions: ['configure', 'run'],
  },

  running: {
    label: 'Running',
    description: 'Executing task',
    iconBackground: '#E7EFFF', // Blue tint (matches reference)
    iconBackgroundDark: '#76A1FB', // Blue (matches reference)
    iconColor: '#3B82F6', // Blue 500
    textColor: 'var(--info)',
    icon: Circle,
    actionIcon: Pause,
    actionLabel: 'Pause',
    actionType: 'pause',
    showCurrentStep: true,
    stepPrefix: '>',
    stepPlaceholder: 'Processing...',
    isAnimated: true,
    availableActions: ['pause', 'stop'],
  },

  streaming: {
    label: 'Streaming',
    description: 'Receiving response',
    iconBackground: '#E7EFFF', // Blue tint
    iconBackgroundDark: '#76A1FB', // Blue
    iconColor: '#3B82F6', // Blue 500
    textColor: 'var(--info)',
    icon: Circle,
    actionIcon: Pause,
    actionLabel: 'Stop',
    actionType: 'stop',
    showCurrentStep: true,
    stepPrefix: '>',
    stepPlaceholder: 'Receiving response...',
    isAnimated: true,
    availableActions: ['stop'],
  },

  complete: {
    label: 'Complete',
    description: 'Finished successfully',
    iconBackground: '#DCFCE7', // Green 100
    iconBackgroundDark: '#22C55E', // Green 500
    iconColor: '#16A34A', // Green 600
    textColor: 'var(--success)',
    icon: CheckCircle,
    actionIcon: RotateCcw,
    actionLabel: 'Rerun',
    actionType: 'rerun',
    showCurrentStep: false,
    stepPrefix: '✓',
    stepPlaceholder: 'Task completed',
    isAnimated: false,
    availableActions: ['rerun', 'view-diff', 'configure'],
  },

  error: {
    label: 'Error',
    description: 'Failed with error',
    iconBackground: '#FEE2E2', // Red 100
    iconBackgroundDark: '#EF4444', // Red 500
    iconColor: '#DC2626', // Red 600
    textColor: 'var(--destructive)',
    icon: XCircle,
    actionIcon: RotateCcw,
    actionLabel: 'Retry',
    actionType: 'retry',
    showCurrentStep: false,
    stepPrefix: '✗',
    stepPlaceholder: 'Task failed',
    isAnimated: false,
    availableActions: ['retry', 'view-error', 'configure'],
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the complete state configuration for a given status
 */
export function getStateConfig(status: AgentStatus): AgentStateConfig {
  return AGENT_STATE_CONFIG[status];
}

/**
 * Format a progress value as a visual bar using block characters
 * @param progress - Progress percentage (0-100)
 * @param width - Total character width of the bar (default 10)
 * @returns Formatted progress bar string
 * @example formatProgressBar(60) → "██████░░░░"
 */
export function formatProgressBar(progress: number, width = 10): string {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const filledBlocks = Math.round((clampedProgress / 100) * width);
  const emptyBlocks = width - filledBlocks;
  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

/**
 * Get the list of actions available in the context menu for a given status
 */
export function getAvailableActions(status: AgentStatus): readonly AgentAction[] {
  return AGENT_STATE_CONFIG[status].availableActions;
}

/**
 * Check if the agent is in an active (running/streaming) state
 */
export function isActiveState(status: AgentStatus): boolean {
  return status === 'running' || status === 'streaming';
}

/**
 * Check if the agent can be started (run/resume)
 */
export function canStart(status: AgentStatus): boolean {
  return status === 'idle' || status === 'pending' || status === 'complete' || status === 'error';
}

/**
 * Check if the agent can be stopped
 */
export function canStop(status: AgentStatus): boolean {
  return status === 'running' || status === 'streaming';
}

/**
 * Get the appropriate handler callback name for the primary action
 */
export function getActionHandler(
  status: AgentStatus
): 'onConfigure' | 'onRun' | 'onPause' | 'onStop' | 'onRetry' | 'onViewDiff' | 'onViewError' {
  const action = AGENT_STATE_CONFIG[status].actionType;
  switch (action) {
    case 'configure':
      return 'onConfigure';
    case 'run':
    case 'rerun':
      return 'onRun';
    case 'pause':
      return 'onPause';
    case 'stop':
      return 'onStop';
    case 'retry':
    case 'resume':
      return 'onRetry';
    case 'view-diff':
      return 'onViewDiff';
    case 'view-error':
      return 'onViewError';
  }
}
