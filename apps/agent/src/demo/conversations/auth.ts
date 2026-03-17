/**
 * JWT Authentication Demo Scenario
 *
 * Simulates adding JWT authentication with refresh tokens and route middleware
 * to an Express API. Demonstrates: AskUserQuestion permission → Read → Write → Edit → Bash.
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-auth-001';

const USER_PROMPT =
  'Add JWT authentication with refresh tokens and route middleware to our Express API. Include login, register, and token refresh endpoints.';

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events for the JWT authentication demo.
 * Demonstrates the AskUserQuestion permission flow with multiple auth strategy options.
 */
export function buildAuthScript(): DemoScript {
  const events: DemoEvent[] = [];

  // --- Phase 1: Thinking ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:thinking',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'The user wants JWT authentication with refresh tokens. Let me analyze the project structure first to understand the existing Express setup, middleware patterns, and database layer. I need to check for existing auth modules, the router setup, and any ORM/query builder being used for user storage.',
      duration_ms: 4200,
    },
  });

  // --- Phase 2: Initial analysis text ---
  events.push({
    delay: 4200,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "I've analyzed your project structure and found an Express API with TypeScript. Before I proceed, I'd like to confirm which authentication strategy you prefer.\n\n",
    },
  });

  // --- Phase 3: AskUserQuestion permission request ---
  events.push({
    delay: 800,
    message: {
      type: 'permission:request',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      request_id: `perm-auth-${crypto.randomUUID().slice(0, 8)}`,
      tool_name: 'AskUserQuestion',
      tool_input: {
        questions: [
          {
            question: 'Which authentication strategy should I implement?',
            header: 'Authentication Strategy',
            options: [
              {
                label: 'JWT with refresh tokens',
                description:
                  'Stateless auth with short-lived access tokens and long-lived refresh tokens. Best for APIs and SPAs.',
              },
              {
                label: 'Session-based with Redis',
                description:
                  'Server-side sessions stored in Redis. Simpler but requires a session store.',
              },
              {
                label: 'OAuth 2.0 with providers',
                description:
                  'Delegated auth via Google, GitHub, etc. Best when you want social login.',
              },
            ],
            multiSelect: false,
          },
        ],
      },
    },
  });

  // --- Phase 4: AskUserQuestion tool start/end (simulating user selection) ---
  const askToolId = `tool-ask-auth-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 3000,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: askToolId,
      tool_name: 'AskUserQuestion',
      tool_input: {
        question: 'Which authentication strategy should I implement?',
        options: [
          'JWT with refresh tokens',
          'Session-based with Redis',
          'OAuth 2.0 with providers',
        ],
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
      tool_id: askToolId,
      tool_name: 'AskUserQuestion',
      tool_output: 'JWT with refresh tokens',
      success: true,
    },
  });

  // --- Phase 5: Post-selection text ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'Great choice! JWT with refresh tokens is ideal for your API. Let me check your existing route structure first.\n\n',
    },
  });

  // --- Phase 6: Read existing routes ---
  const readToolId = `tool-read-auth-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readToolId,
      tool_name: 'Read',
      tool_input: {
        file_path: '/workspace/api/src/routes/index.ts',
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
      tool_id: readToolId,
      tool_name: 'Read',
      tool_output: [
        "import { Router } from 'express';",
        "import { usersRouter } from './users';",
        "import { projectsRouter } from './projects';",
        '',
        'const router = Router();',
        '',
        "router.use('/users', usersRouter);",
        "router.use('/projects', projectsRouter);",
        '',
        'export { router };',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 7: Creating auth module ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "Now I'll create the authentication module with token generation, verification, and middleware.\n\n",
    },
  });

  // --- Phase 8: Write JWT module ---
  const writeToolId = `tool-write-auth-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 400,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeToolId,
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspace/api/src/auth/jwt.ts',
        content: [
          "import jwt from 'jsonwebtoken';",
          "import type { Request, Response, NextFunction } from 'express';",
          "import { db } from '../db';",
          '',
          'const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;',
          'const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;',
          'const ACCESS_EXPIRY = "15m";',
          'const REFRESH_EXPIRY = "7d";',
          '',
          'interface TokenPayload {',
          '  userId: string;',
          '  email: string;',
          '  role: "admin" | "user";',
          '}',
          '',
          'export function generateAccessToken(payload: TokenPayload): string {',
          '  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });',
          '}',
          '',
          'export function generateRefreshToken(payload: TokenPayload): string {',
          '  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });',
          '}',
          '',
          'export function verifyAccessToken(token: string): TokenPayload {',
          '  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;',
          '}',
          '',
          'export async function authMiddleware(',
          '  req: Request,',
          '  res: Response,',
          '  next: NextFunction',
          '): Promise<void> {',
          '  const header = req.headers.authorization;',
          '  if (!header?.startsWith("Bearer ")) {',
          '    res.status(401).json({ error: "Missing authorization header" });',
          '    return;',
          '  }',
          '',
          '  const token = header.slice(7);',
          '  try {',
          '    const payload = verifyAccessToken(token);',
          '    req.user = payload;',
          '    next();',
          '  } catch {',
          '    res.status(401).json({ error: "Invalid or expired token" });',
          '  }',
          '}',
          '',
          'export async function refreshTokens(refreshToken: string) {',
          '  const payload = jwt.verify(refreshToken, REFRESH_SECRET) as TokenPayload;',
          '  const stored = await db.refreshTokens.findOne({ token: refreshToken });',
          '',
          '  if (!stored || stored.revoked) {',
          '    throw new Error("Invalid refresh token");',
          '  }',
          '',
          '  await db.refreshTokens.revoke(refreshToken);',
          '',
          '  const newAccess = generateAccessToken({',
          '    userId: payload.userId,',
          '    email: payload.email,',
          '    role: payload.role,',
          '  });',
          '  const newRefresh = generateRefreshToken({',
          '    userId: payload.userId,',
          '    email: payload.email,',
          '    role: payload.role,',
          '  });',
          '',
          '  await db.refreshTokens.store({ token: newRefresh, userId: payload.userId });',
          '',
          '  return { accessToken: newAccess, refreshToken: newRefresh };',
          '}',
        ].join('\n'),
      },
    },
  });

  events.push({
    delay: 2800,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeToolId,
      tool_name: 'Write',
      tool_output: 'File written successfully',
      success: true,
    },
  });

  // --- Phase 9: Wiring auth routes ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content: "Now I'll wire the auth routes into your existing router.\n\n",
    },
  });

  // --- Phase 10: Edit route index ---
  const editToolId = `tool-edit-auth-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: editToolId,
      tool_name: 'Edit',
      tool_input: {
        file_path: '/workspace/api/src/routes/index.ts',
        old_string: "import { Router } from 'express';",
        new_string: [
          "import { Router } from 'express';",
          "import { authRouter } from './auth';",
          "import { authMiddleware } from '../auth/jwt';",
        ].join('\n'),
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
      tool_id: editToolId,
      tool_name: 'Edit',
      tool_output: 'File edited successfully (3 lines added)',
      success: true,
    },
  });

  // --- Phase 11: Verification text ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content: 'Let me verify everything compiles and the tests pass.\n\n',
    },
  });

  // --- Phase 12: Bash typecheck + test ---
  const bashToolId = `tool-bash-auth-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashToolId,
      tool_name: 'Bash',
      tool_input: {
        command: 'cd /workspace/api && bun run typecheck && bun test',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 3500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashToolId,
      tool_name: 'Bash',
      tool_output: [
        '$ bun run typecheck',
        '$ tsc --noEmit',
        'No errors found.',
        '',
        '$ bun test',
        'bun test v1.2.0',
        '',
        'auth/jwt.test.ts:',
        '  \u2713 generates valid access token (2ms)',
        '  \u2713 generates valid refresh token (1ms)',
        '  \u2713 rejects expired access token (3ms)',
        '  \u2713 refresh token rotation works (5ms)',
        '  \u2713 authMiddleware blocks unauthorized requests (2ms)',
        '  \u2713 authMiddleware passes valid tokens (1ms)',
        '',
        '6 pass | 0 fail (14ms)',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 13: Summary ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "All checks pass. Here's what I've implemented:\n\n" +
        '- **JWT Module** (`src/auth/jwt.ts`) \u2014 Token generation, verification, and refresh rotation\n' +
        '- **Auth Routes** (`src/routes/auth.ts`) \u2014 `/login`, `/register`, and `/refresh` endpoints\n' +
        '- **Middleware** \u2014 `authMiddleware` for protected route authorization with Bearer token parsing\n' +
        '- **Refresh Token Rotation** \u2014 Old tokens are revoked on each refresh to prevent replay attacks\n',
    },
  });

  // --- Phase 14: Complete ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:complete',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      duration_ms: 18000,
    },
  });

  return {
    title: 'JWT Authentication',
    userPrompt: USER_PROMPT,
    events,
  };
}
