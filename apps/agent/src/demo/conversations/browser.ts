/**
 * Competitor Pricing Research Demo Scenario
 *
 * Simulates researching competitor pricing pages and summarizing findings.
 * Demonstrates: WebSearch → WebFetch (multiple) → markdown table summary.
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-browser-001';

const USER_PROMPT =
  "Research the top 3 competitors' pricing pages and summarize their tier structure in a comparison table.";

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events for the competitor pricing research demo.
 * Demonstrates browser tools: WebSearch for discovery, WebFetch for page scraping.
 */
export function buildBrowserScript(): DemoScript {
  const events: DemoEvent[] = [];

  // --- Phase 1: Initial text ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "I'll research competitor pricing pages and compile a comparison. Let me start with a web search to identify the top players.\n\n",
    },
  });

  // --- Phase 2: WebSearch ---
  const searchToolId = `tool-search-browser-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 400,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: searchToolId,
      tool_name: 'WebSearch',
      tool_input: {
        query: 'AI code editor pricing plans 2026 comparison',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 2500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: searchToolId,
      tool_name: 'WebSearch',
      tool_output: JSON.stringify([
        {
          title: 'Cursor Pricing — AI Code Editor Plans',
          url: 'https://cursor.com/pricing',
          snippet:
            'Cursor offers Hobby (free), Pro ($20/mo), and Business ($40/mo) plans with varying AI request limits...',
        },
        {
          title: 'Windsurf Pricing — Next-Gen AI IDE',
          url: 'https://windsurf.ai/pricing',
          snippet:
            'Windsurf pricing: Free tier, Pro at $15/mo, and Team at $30/mo with unlimited AI flows...',
        },
        {
          title: 'AI Code Editors Compared: 2026 Pricing Breakdown',
          url: 'https://devtools.review/pricing-comparison-2026',
          snippet:
            'Comprehensive comparison of Cursor, Windsurf, and other AI coding assistants...',
        },
      ]),
      success: true,
    },
  });

  // --- Phase 3: Post-search text ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'Found the top competitors. Let me fetch their pricing pages directly for detailed tier breakdowns.\n\n',
    },
  });

  // --- Phase 4: WebFetch cursor.com/pricing ---
  const fetchCursorId = `tool-fetch-cursor-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: fetchCursorId,
      tool_name: 'WebFetch',
      tool_input: {
        url: 'https://cursor.com/pricing',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 3200,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: fetchCursorId,
      tool_name: 'WebFetch',
      tool_output: [
        'Cursor Pricing',
        '',
        'Hobby (Free)',
        '- 2,000 completions/month',
        '- 50 slow premium requests/month',
        '- Community support',
        '',
        'Pro ($20/mo)',
        '- Unlimited completions',
        '- 500 fast premium requests/month',
        '- Unlimited slow premium requests',
        '- Priority support',
        '',
        'Business ($40/user/mo)',
        '- Everything in Pro',
        '- Admin dashboard & usage analytics',
        '- SAML SSO',
        '- Centralized billing',
        '- Enforced privacy mode',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 5: WebFetch windsurf.ai/pricing ---
  const fetchWindsurfId = `tool-fetch-windsurf-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: fetchWindsurfId,
      tool_name: 'WebFetch',
      tool_input: {
        url: 'https://windsurf.ai/pricing',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 2800,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: fetchWindsurfId,
      tool_name: 'WebFetch',
      tool_output: [
        'Windsurf Pricing',
        '',
        'Free',
        '- 5 AI flows/day',
        '- Basic autocomplete',
        '- Community support',
        '',
        'Pro ($15/mo)',
        '- Unlimited AI flows',
        '- Advanced autocomplete with context',
        '- Priority support',
        '- Custom model selection',
        '',
        'Team ($30/user/mo)',
        '- Everything in Pro',
        '- Team knowledge sharing',
        '- Admin controls',
        '- Usage analytics',
        '- SSO integration',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 6: Summary with comparison table ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "Here's the competitive pricing analysis:\n\n" +
        '## Competitor Pricing Comparison\n\n' +
        '| Feature | Cursor | Windsurf |\n' +
        '|---------|--------|----------|\n' +
        '| **Free Tier** | Hobby (2K completions, 50 slow requests) | Free (5 AI flows/day) |\n' +
        '| **Pro Price** | $20/mo | $15/mo |\n' +
        '| **Pro AI Limits** | 500 fast + unlimited slow | Unlimited flows |\n' +
        '| **Team/Biz Price** | $40/user/mo | $30/user/mo |\n' +
        '| **SSO** | Business only | Team tier |\n' +
        '| **Usage Analytics** | Business only | Team tier |\n\n',
    },
  });

  events.push({
    delay: 400,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        '### Key Takeaways\n\n' +
        '1. **Windsurf undercuts on price** \u2014 $5/mo cheaper at both Pro and Team tiers\n' +
        '2. **Cursor gates features more aggressively** \u2014 Fast premium requests limited even on Pro\n' +
        '3. **Both require Business/Team tier for SSO** \u2014 Table stakes for enterprise sales\n' +
        '4. **Free tiers differ significantly** \u2014 Cursor limits by request count, Windsurf by daily flows\n',
    },
  });

  // --- Phase 7: Complete ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:complete',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      duration_ms: 14000,
    },
  });

  return {
    title: 'Competitor Pricing Research',
    userPrompt: USER_PROMPT,
    events,
  };
}
