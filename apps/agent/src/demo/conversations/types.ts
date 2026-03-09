/**
 * Demo Scenario Types
 *
 * Shared types and constants used by all demo scenarios.
 * Extracted to avoid circular dependencies between index.ts and scenario files.
 */

// ============================================
// Types
// ============================================

export interface DemoEvent {
  /** Delay in ms from the previous event */
  delay: number;
  /** The message to post via window.postMessage */
  message: Record<string, unknown>;
}

export interface DemoScript {
  /** Conversation title shown in sidebar */
  title: string;
  /** The user's prompt message */
  userPrompt: string;
  /** Timed sequence of backend messages to play */
  events: DemoEvent[];
}

// ============================================
// Constants
// ============================================

export const DEMO_SESSION_ID = 'demo-session-001';
