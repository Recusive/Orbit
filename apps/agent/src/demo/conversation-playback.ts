/**
 * Demo Conversation Playback Engine
 *
 * Generic playback engine that plays any DemoScript as a simulated conversation.
 * Scenarios are defined in ./conversations/ and looked up via the registry.
 *
 * Architecture: Posts ExtensionMessage events via window.postMessage to simulate
 * the backend message flow. ChatMessageService processes these identically to
 * real backend messages — streaming, tool widgets, and all.
 */

import { getScenario, DEMO_SESSION_ID } from './conversations';

import type { DemoScript } from './conversations';

// Re-export for backwards compatibility
export { DEMO_SESSION_ID };

// ============================================
// Constants
// ============================================

const DEMO_USER_MESSAGE_ID = 'demo-user-001';

// ============================================
// Playback State
// ============================================

/** Whether a demo conversation is currently playing */
let isDemoActive = false;

/** Check if a demo conversation is currently active (used by mock handler) */
export function isDemoConversationActive(): boolean {
  return isDemoActive;
}

/** Tracks active playback timeouts for cleanup */
let activeTimeoutIds: ReturnType<typeof setTimeout>[] = [];

// ============================================
// Playback Engine
// ============================================

/**
 * Play a DemoScript as a simulated conversation.
 *
 * 1. Posts `conversation:created` to initialize a session
 * 2. Posts `conversation:loaded` with the user prompt pre-populated (immediate)
 * 3. Plays the scripted AI response sequence with timed delays
 *
 * @returns cleanup function to cancel all pending timeouts
 */
function playScript(script: DemoScript): () => void {
  activeTimeoutIds = [];

  // Step 1: Create session (immediate)
  window.postMessage(
    {
      type: 'conversation:created',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      title: script.title,
    },
    '*'
  );

  // Step 2: Load conversation with user message (immediate — no artificial delay)
  window.postMessage(
    {
      type: 'conversation:loaded',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      title: script.title,
      messages: [
        {
          id: DEMO_USER_MESSAGE_ID,
          role: 'user',
          content: script.userPrompt,
          createdAt: Date.now(),
          parentUuid: null,
        },
      ],
    },
    '*'
  );

  // Step 3: Play scripted events with cumulative delays
  let cumulativeDelay = 200; // Brief pause for UI to show loaded state before streaming
  for (const event of script.events) {
    cumulativeDelay += event.delay;
    const timeout = setTimeout(() => {
      window.postMessage(event.message, '*');
    }, cumulativeDelay);
    activeTimeoutIds.push(timeout);
  }

  return cancelDemoConversation;
}

/**
 * Start the demo conversation playback for a given scenario.
 *
 * @param scenarioKey - Registry key for the scenario (defaults to 'clawdbot')
 * @returns cleanup function to cancel all pending timeouts
 */
export function startDemoConversation(scenarioKey?: string): () => void {
  // Clear any previous playback
  cancelDemoConversation();
  isDemoActive = true;

  const key = scenarioKey ?? 'clawdbot';
  const script = getScenario(key) ?? getScenario('clawdbot');
  if (!script) {
    return cancelDemoConversation;
  }
  return playScript(script);
}

/** Cancel all pending demo playback timeouts */
function cancelDemoConversation(): void {
  for (const id of activeTimeoutIds) {
    clearTimeout(id);
  }
  activeTimeoutIds = [];
  isDemoActive = false;
}

/** Whether the given view should play the demo conversation */
export function isDemoConversationView(view: string): boolean {
  return view === 'hero' || view === 'demo' || view === 'showcase' || view === 'feature';
}
