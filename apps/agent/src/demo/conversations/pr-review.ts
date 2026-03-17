/**
 * Security Code Review Demo Scenario
 *
 * Simulates reviewing PR #42 for security issues in a payment processing endpoint.
 * Demonstrates: Bash (git diff) → Read (multiple) → Grep → Thinking → security findings.
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-pr-001';

const USER_PROMPT =
  'Review PR #42 \u2014 it adds a new payment processing endpoint. Check for security issues.';

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events for the PR security review demo.
 * Demonstrates code review with git diff, file reading, grep, and security analysis.
 */
export function buildPrReviewScript(): DemoScript {
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
        "I'll review PR #42 for security vulnerabilities. Let me start by examining the diff to understand the scope of changes.\n\n",
    },
  });

  // --- Phase 2: Git diff ---
  const bashDiffId = `tool-bash-diff-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashDiffId,
      tool_name: 'Bash',
      tool_input: {
        command: 'git diff main...feature/payments -- src/',
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
      tool_id: bashDiffId,
      tool_name: 'Bash',
      tool_output: [
        'diff --git a/src/controllers/payments.ts b/src/controllers/payments.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/controllers/payments.ts',
        '@@ -0,0 +1,67 @@',
        "+import { Router } from 'express';",
        "+import { db } from '../db';",
        "+import Stripe from 'stripe';",
        '+',
        '+const stripe = new Stripe(process.env.STRIPE_KEY);',
        '+const router = Router();',
        '+',
        "+router.post('/charge', async (req, res) => {",
        '+  const { amount, currency, cardToken, userId } = req.body;',
        '+',
        '+  const payment = await stripe.paymentIntents.create({',
        '+    amount,',
        '+    currency,',
        '+    payment_method: cardToken,',
        '+    confirm: true,',
        '+  });',
        '+',
        "+  await db.query(`INSERT INTO transactions (user_id, amount, stripe_id) VALUES ('${userId}', ${amount}, '${payment.id}')`);",
        '+',
        '+  res.json({ success: true, paymentId: payment.id });',
        '+});',
        '+',
        "+router.get('/history/:userId', async (req, res) => {",
        "+  const transactions = await db.query(`SELECT * FROM transactions WHERE user_id = '${req.params.userId}'`);",
        '+  res.json(transactions);',
        '+});',
        '+',
        'diff --git a/src/models/transaction.ts b/src/models/transaction.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/models/transaction.ts',
        '@@ -0,0 +1,12 @@',
        '+export interface Transaction {',
        '+  id: string;',
        '+  user_id: string;',
        '+  amount: number;',
        '+  stripe_id: string;',
        '+  created_at: Date;',
        '+}',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 3: Closer examination text ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'I can already see several issues in the diff. Let me examine the controller and model files more closely.\n\n',
    },
  });

  // --- Phase 4: Read payment controller ---
  const readControllerId = `tool-read-controller-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readControllerId,
      tool_name: 'Read',
      tool_input: {
        file_path: '/workspace/api/src/controllers/payments.ts',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 1500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readControllerId,
      tool_name: 'Read',
      tool_output: [
        "import { Router } from 'express';",
        "import { db } from '../db';",
        "import Stripe from 'stripe';",
        '',
        'const stripe = new Stripe(process.env.STRIPE_KEY);',
        'const router = Router();',
        '',
        "router.post('/charge', async (req, res) => {",
        '  const { amount, currency, cardToken, userId } = req.body;',
        '',
        '  const payment = await stripe.paymentIntents.create({',
        '    amount,',
        '    currency,',
        '    payment_method: cardToken,',
        '    confirm: true,',
        '  });',
        '',
        "  await db.query(`INSERT INTO transactions (user_id, amount, stripe_id) VALUES ('${userId}', ${amount}, '${payment.id}')`);",
        '',
        '  res.json({ success: true, paymentId: payment.id });',
        '});',
        '',
        "router.get('/history/:userId', async (req, res) => {",
        "  const transactions = await db.query(`SELECT * FROM transactions WHERE user_id = '${req.params.userId}'`);",
        '  res.json(transactions);',
        '});',
        '',
        'export { router as paymentsRouter };',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 5: Read transaction model ---
  const readModelId = `tool-read-model-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 200,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readModelId,
      tool_name: 'Read',
      tool_input: {
        file_path: '/workspace/api/src/models/transaction.ts',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 1200,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readModelId,
      tool_name: 'Read',
      tool_output: [
        'export interface Transaction {',
        '  id: string;',
        '  user_id: string;',
        '  amount: number;',
        '  stripe_id: string;',
        '  created_at: Date;',
        '}',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 6: Grep for SQL patterns ---
  const grepToolId = `tool-grep-sql-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: grepToolId,
      tool_name: 'Grep',
      tool_input: {
        pattern: '(query|exec|raw)\\(',
        path: '/workspace/api/src/',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 1800,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: grepToolId,
      tool_name: 'Grep',
      tool_output: [
        "src/controllers/payments.ts:17:  await db.query(`INSERT INTO transactions (user_id, amount, stripe_id) VALUES ('${userId}', ${amount}, '${payment.id}')`);",
        "src/controllers/payments.ts:23:  const transactions = await db.query(`SELECT * FROM transactions WHERE user_id = '${req.params.userId}'`);",
        'src/controllers/users.ts:12:  const user = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
        'src/controllers/projects.ts:8:  const projects = await db.query("SELECT * FROM projects WHERE owner_id = $1", [ownerId]);',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 7: Thinking (security analysis) ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:thinking',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'Critical findings from the code review:\n\n' +
        '1. SQL Injection (CRITICAL): Both queries in payments.ts use string interpolation instead of parameterized queries. The existing codebase (users.ts, projects.ts) correctly uses $1 placeholders. This is a clear regression.\n\n' +
        '2. No input validation (HIGH): The /charge endpoint accepts amount, currency, and userId directly from req.body without any validation. An attacker could set amount to 0 or negative values.\n\n' +
        "3. No authentication middleware (HIGH): Neither endpoint checks for authentication. The /history/:userId endpoint exposes any user's transaction history via IDOR.\n\n" +
        '4. No rate limiting (MEDIUM): The /charge endpoint has no rate limiting, allowing potential abuse.\n\n' +
        'Per OWASP Top 10 2025: A03:2021-Injection, A01:2021-Broken Access Control, A04:2021-Insecure Design.',
      duration_ms: 5200,
    },
  });

  // --- Phase 8: Security findings summary ---
  events.push({
    delay: 5200,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        '## Security Review: PR #42 \u2014 Payment Processing\n\n' +
        '### Critical\n\n' +
        '**SQL Injection in both endpoints** (lines 17, 23)\n' +
        'Both database queries use template literal string interpolation instead of parameterized queries. ' +
        'This is especially dangerous because `userId` and `amount` come directly from user input.\n\n' +
        '```\n' +
        '// Vulnerable\n' +
        "db.query(`SELECT * FROM transactions WHERE user_id = '${req.params.userId}'`)\n\n" +
        '// Fix: Use parameterized queries (matches existing codebase pattern)\n' +
        'db.query("SELECT * FROM transactions WHERE user_id = $1", [req.params.userId])\n' +
        '```\n\n',
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
        '### High\n\n' +
        "**No authentication middleware** \u2014 Neither route uses `authMiddleware`. The `/history/:userId` endpoint is an IDOR vulnerability \u2014 any user can view any other user's transactions.\n\n" +
        '**No input validation** \u2014 The `/charge` endpoint accepts `amount`, `currency`, and `userId` without validation. An attacker could:\n' +
        '- Set `amount` to 0 or negative values\n' +
        '- Use an invalid `currency` code\n' +
        "- Charge to another user's account\n\n",
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
        '### Medium\n\n' +
        '**No rate limiting** \u2014 The `/charge` endpoint should have rate limiting to prevent payment abuse and card testing attacks.\n\n' +
        '**No error handling** \u2014 Stripe errors are not caught, potentially leaking internal error details to the client.\n\n' +
        '---\n\n' +
        "**Recommendation:** This PR should **not be merged** in its current state. The SQL injection vulnerability alone is a blocker. I can prepare a fixed version if you'd like.\n",
    },
  });

  // --- Phase 9: Complete ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:complete',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      duration_ms: 20000,
    },
  });

  return {
    title: 'PR #42 Security Review',
    userPrompt: USER_PROMPT,
    events,
  };
}
