/**
 * ClawdBot Demo Scenario
 *
 * Simulates building a ClawdBot system with Linear, Slack, and Playwright integrations.
 * Demonstrates: WebSearch → Write → Bash tool chain with streaming text.
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-001';

const USER_PROMPT =
  'Build me a ClawdBot system — an AI assistant that integrates with Linear for issue tracking, Slack for team notifications, and a headless browser for web research. Set up the project structure and core integrations.';

/**
 * Streaming text chunks for the AI response.
 * These are broken into natural fragments that simulate real streaming cadence.
 */
const TEXT_CHUNKS: readonly { text: string; delay: number }[] = [
  { text: "I'll help you build a ClawdBot system with those integrations. Let me ", delay: 800 },
  { text: 'start by researching the APIs and setting up the project.\n\n', delay: 600 },
  // After WebSearch tool
  {
    text: "I've found the documentation for all three integrations. Now let me set up the project structure ",
    delay: 800,
  },
  { text: 'and implement the core modules.\n\n', delay: 400 },
  // After Write tool
  {
    text: 'The main entry point is ready. Now let me install the dependencies and verify everything works.\n\n',
    delay: 800,
  },
  // After Bash tool
  {
    text: "All dependencies installed successfully. Here's what I've set up:\n\n",
    delay: 600,
  },
  {
    text: '- **Linear SDK** — Issue creation, status updates, and project management\n',
    delay: 300,
  },
  {
    text: '- **Slack Bolt** — Real-time messaging, slash commands, and notifications\n',
    delay: 300,
  },
  {
    text: '- **Playwright** — Headless browser for web research and screenshots\n',
    delay: 300,
  },
  {
    text: '\nThe ClawdBot is ready to run. ',
    delay: 400,
  },
  {
    text: 'You can start it with `bun run start` and it will connect to all three services.',
    delay: 500,
  },
];

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events that make up the ClawdBot demo conversation.
 * Returns a DemoScript with title, user prompt, and timed event sequence.
 */
export function buildClawdbotScript(): DemoScript {
  const events: DemoEvent[] = [];
  let chunkIndex = 0;

  // Helper to add a text chunk event
  const addChunk = (): void => {
    const chunk = TEXT_CHUNKS[chunkIndex];
    if (!chunk) return;
    events.push({
      delay: chunk.delay,
      message: {
        type: 'agent:chunk',
        uuid: crypto.randomUUID(),
        session_id: DEMO_SESSION_ID,
        message_id: DEMO_MESSAGE_ID,
        content: chunk.text,
      },
    });
    chunkIndex++;
  };

  // --- Phase 1: Initial streaming text ---
  addChunk(); // "I'll help you build..."
  addChunk(); // "start by researching..."

  // --- Phase 2: WebSearch tool ---
  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-websearch-001',
      tool_name: 'WebSearch',
      tool_input: {
        query: 'Linear API SDK Slack Bolt Playwright integration guide 2026',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 2200,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-websearch-001',
      tool_name: 'WebSearch',
      tool_output: JSON.stringify([
        {
          title: 'Linear API Reference — TypeScript SDK',
          url: 'https://linear.app/docs/api',
          snippet:
            'The Linear TypeScript SDK provides a type-safe way to interact with the Linear API...',
        },
        {
          title: 'Getting Started with Slack Bolt for JavaScript',
          url: 'https://slack.dev/bolt-js/tutorial',
          snippet: 'Bolt for JavaScript is the fastest way to build Slack apps...',
        },
        {
          title: 'Playwright Documentation — Headless Browser',
          url: 'https://playwright.dev/docs/intro',
          snippet: 'Playwright enables reliable end-to-end testing and browser automation...',
        },
      ]),
      success: true,
    },
  });

  // --- Phase 3: Post-search text ---
  addChunk(); // "I've found the documentation..."
  addChunk(); // "and implement the core modules."

  // --- Phase 4: Write tool (create main file) ---
  events.push({
    delay: 400,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-write-001',
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspace/clawdbot/src/index.ts',
        content: `import { LinearClient } from '@linear/sdk';
import { App as SlackApp } from '@slack/bolt';
import { chromium } from 'playwright';

// ─── Configuration ─────────────────────────
const config = {
  linear: { apiKey: process.env.LINEAR_API_KEY! },
  slack: {
    token: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
  },
  browser: { headless: true },
};

// ─── Linear Integration ────────────────────
const linear = new LinearClient({ apiKey: config.linear.apiKey });

export async function createIssue(title: string, description: string) {
  const team = await linear.teams().then(t => t.nodes[0]);
  return linear.createIssue({
    teamId: team.id,
    title,
    description,
  });
}

// ─── Slack Integration ─────────────────────
const slack = new SlackApp({
  token: config.slack.token,
  signingSecret: config.slack.signingSecret,
});

slack.command('/clawdbot', async ({ command, ack, respond }) => {
  await ack();
  const issue = await createIssue(
    command.text,
    \`Created via Slack by <@\${command.user_id}>\`
  );
  await respond(\`Created issue: \${issue.title}\`);
});

// ─── Browser Research ──────────────────────
export async function research(url: string) {
  const browser = await chromium.launch(config.browser);
  const page = await browser.newPage();
  await page.goto(url);
  const content = await page.textContent('body');
  await browser.close();
  return content;
}

// ─── Start ─────────────────────────────────
(async () => {
  await slack.start(3000);
  console.log('ClawdBot is running on port 3000');
})();
`,
      },
    },
  });

  events.push({
    delay: 2500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-write-001',
      tool_name: 'Write',
      tool_output: 'File written successfully',
      success: true,
    },
  });

  // --- Phase 5: Post-write text ---
  addChunk(); // "The main entry point is ready..."

  // --- Phase 6: Bash tool (install deps) ---
  events.push({
    delay: 400,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-bash-001',
      tool_name: 'Bash',
      tool_input: {
        command: 'cd /workspace/clawdbot && bun add @linear/sdk @slack/bolt playwright',
      },
    },
  });

  events.push({
    delay: 3000,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: 'tool-bash-001',
      tool_name: 'Bash',
      tool_output:
        'bun add v1.2.0\n\ninstalled @linear/sdk@15.0.1\ninstalled @slack/bolt@4.1.0\ninstalled playwright@1.50.0\n\n3 packages installed [2.41s]',
      success: true,
    },
  });

  // --- Phase 7: Final summary text chunks ---
  addChunk(); // "All dependencies installed..."
  addChunk(); // "- **Linear SDK**..."
  addChunk(); // "- **Slack Bolt**..."
  addChunk(); // "- **Playwright**..."
  addChunk(); // "The ClawdBot is ready..."
  addChunk(); // "You can start it..."

  // --- Phase 8: Complete ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:complete',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      duration_ms: 12000,
    },
  });

  return {
    title: 'ClawdBot Setup',
    userPrompt: USER_PROMPT,
    events,
  };
}
