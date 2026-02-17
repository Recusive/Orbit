import type { WebviewMessage } from '@/types/protocol';

import { DEMO_SESSION_ID, isDemoConversationActive } from '@/hooks/agent/demo-conversation';

// ═══════════════════════════════════════════════════════════════
// Mock handler for browser development
// ═══════════════════════════════════════════════════════════════

export const MOCK_ROOT = '/demo';

/** Mock file content keyed by relative path suffix */
const MOCK_FILE_CONTENT: Record<string, string> = {
  'src/app.tsx': `import { useState } from 'react';

import { Button } from './components/ui/button';
import { fetchUserData } from './utils';

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatar: string;
}

export default function App(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const handleLoadUsers = async (): Promise<void> => {
    setLoading(true);
    const data = await fetchUserData();
    setUsers(data);
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
        <Button onClick={handleLoadUsers} disabled={loading}>
          {loading ? 'Loading...' : 'Load Users'}
        </Button>
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id} className="rounded-lg border p-4">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
`,

  'src/utils.ts': `/**
 * Utility helpers for the application.
 *
 * All async helpers return typed Promises and handle
 * errors gracefully with structured logging.
 */

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatar: string;
}

const API_BASE = 'https://api.example.com/v1';

export async function fetchUserData(): Promise<User[]> {
  const response = await fetch(\`\${API_BASE}/users\`);

  if (!response.ok) {
    throw new Error(\`Failed to fetch users: \${String(response.status)}\`);
  }

  const data: unknown = await response.json();
  return data as User[];
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
`,

  'src/styles.css': `@import 'tailwindcss';

/* ─── Base tokens ────────────────────────── */
:root {
  --background: oklch(0.98 0.005 75);
  --foreground: oklch(0.15 0.01 60);
  --primary: oklch(0.55 0.18 260);
  --primary-foreground: oklch(0.98 0.005 260);
  --muted: oklch(0.93 0.005 75);
  --muted-foreground: oklch(0.5 0.01 60);
  --border: oklch(0.88 0.005 75);
  --radius: 0.5rem;
}

html.dark {
  --background: oklch(0.14 0.01 260);
  --foreground: oklch(0.93 0.005 75);
  --primary: oklch(0.65 0.2 260);
  --muted: oklch(0.22 0.01 260);
  --border: oklch(0.3 0.01 260);
}

/* ─── Global resets ──────────────────────── */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--background);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
}
`,

  'tests/app.test.ts': `import { describe, expect, it } from 'vitest';

import { clamp, formatDate, slugify } from '../src/utils';

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });
});

describe('formatDate', () => {
  it('formats a date in en-US short style', () => {
    const date = new Date('2025-06-15');
    expect(formatDate(date)).toBe('Jun 15, 2025');
  });
});

describe('clamp', () => {
  it('clamps value below min', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('clamps value above max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});
`,

  'package.json': `{
  "name": "orbit-demo-project",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"]
}
`,

  'README.md': `# Orbit Demo Project

A sample TypeScript + React project scaffolded with Orbit.

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

## Project Structure

\`\`\`
src/
  app.tsx       — Main application component
  utils.ts      — Shared utility functions
  styles.css    — Global styles and design tokens
tests/
  app.test.ts   — Unit tests (Vitest)
\`\`\`

## Scripts

| Command          | Description              |
| ---------------- | ------------------------ |
| \`bun run dev\`    | Start dev server         |
| \`bun run build\`  | Production build         |
| \`bun run test\`   | Run unit tests           |
| \`bun run lint\`   | Lint with ESLint         |
`,
};

/** Return mock children for a given directory path */
function getMockChildren(
  dirPath: string
): readonly { name: string; path: string; isDirectory: boolean; isFile: boolean }[] {
  // Normalize trailing slash
  const normalized = dirPath.replace(/\/+$/, '');

  if (normalized === MOCK_ROOT) {
    return [
      { name: 'src', path: `${normalized}/src`, isDirectory: true, isFile: false },
      { name: 'tests', path: `${normalized}/tests`, isDirectory: true, isFile: false },
      {
        name: 'package.json',
        path: `${normalized}/package.json`,
        isDirectory: false,
        isFile: true,
      },
      {
        name: 'tsconfig.json',
        path: `${normalized}/tsconfig.json`,
        isDirectory: false,
        isFile: true,
      },
      { name: 'README.md', path: `${normalized}/README.md`, isDirectory: false, isFile: true },
    ];
  }

  if (normalized.endsWith('/src')) {
    return [
      { name: 'app.tsx', path: `${normalized}/app.tsx`, isDirectory: false, isFile: true },
      { name: 'utils.ts', path: `${normalized}/utils.ts`, isDirectory: false, isFile: true },
      { name: 'styles.css', path: `${normalized}/styles.css`, isDirectory: false, isFile: true },
    ];
  }

  if (normalized.endsWith('/tests')) {
    return [
      { name: 'app.test.ts', path: `${normalized}/app.test.ts`, isDirectory: false, isFile: true },
    ];
  }

  // Unknown directory — return empty
  return [];
}

/** Look up mock content for a file path */
export function getMockFileContent(filePath: string): string {
  // Try matching by stripping the mock root prefix
  const relative = filePath.replace(`${MOCK_ROOT}/`, '');
  const content = MOCK_FILE_CONTENT[relative];
  if (content !== undefined) return content;

  // Fallback: try matching just the filename
  const filename = filePath.split('/').pop() ?? '';
  for (const [key, value] of Object.entries(MOCK_FILE_CONTENT)) {
    if (key.endsWith(`/${filename}`) || key === filename) {
      return value;
    }
  }

  return `// File: ${filePath}\n// Content not available in demo mode.\n`;
}

export function handleMockMessage(message: WebviewMessage): void {
  const delay = 100;

  switch (message.type) {
    case 'message:send': {
      // Skip echo response when a demo conversation is playing —
      // the scripted sequence handles its own agent:chunk events
      if (isDemoConversationActive()) {
        break;
      }

      const messageId = crypto.randomUUID();

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'I received your message: ',
          },
          '*'
        );
      }, 1000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: `"${message.content}". `,
          },
          '*'
        );
      }, 2000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'Let me help you with that. ',
          },
          '*'
        );
      }, 3000);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:complete',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            duration_ms: 3000,
          },
          '*'
        );
      }, 4000);
      break;
    }

    case 'conversation:create': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:created',
            uuid: crypto.randomUUID(),
            session_id: crypto.randomUUID(),
            title: message.title ?? 'New Conversation',
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'terminal:create': {
      const terminalId = `pty_${String(Date.now())}_${crypto.randomUUID().slice(0, 8)}`;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'terminal:created',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            terminal_id: terminalId,
            name: 'zsh', // Use shell name, not session name
            pid: 12345,
            cwd: '/mock/workspace',
            shell_type: 'zsh',
            capabilities: {
              cwd_detection: true,
              command_detection: true,
              shell_integration: true,
            },
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:list': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:list',
            uuid: crypto.randomUUID(),
            conversations: [
              {
                session_id: DEMO_SESSION_ID,
                title: 'ClawdBot Setup',
                updated_at: Date.now(),
                message_count: 1,
              },
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:load': {
      // During demo playback, suppress the empty conversation:loaded response.
      // The demo-conversation module posts its own conversation:loaded with
      // the scripted user message — an empty response here would race with it.
      if (isDemoConversationActive()) {
        break;
      }
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:loaded',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            title: 'Mock Conversation',
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:rewind': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: message.session_id,
            rewind_to_message_id: message.message_id,
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:tree:request': {
      const mockPath = message.path ?? MOCK_ROOT;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'file:tree:response',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            path: mockPath,
            children: getMockChildren(mockPath),
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:read': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'file:content',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            path: message.path,
            content: getMockFileContent(message.path),
          },
          '*'
        );
      }, delay);
      break;
    }

    // All other message types don't need mock responses
    case 'webview:ready':
    case 'message:edit':
    case 'message:delete':
    case 'conversation:delete':
    case 'conversation:updateTitle':
    case 'agent:start':
    case 'agent:stop':
    case 'agent:pause':
    case 'agent:resume':
    case 'terminal:close':
    case 'terminal:command':
    case 'terminal:clear':
    case 'terminal:write':
    case 'terminal:resize':
    case 'terminal:signal':
    case 'terminal:ack':
    case 'file:open':
    case 'file:write':
    case 'file:accept':
    case 'file:reject':
    case 'file:accept_all':
    case 'file:reject_all':
    case 'diff:open':
    case 'url:open':
    case 'permission:response':
    case 'inputMode:set':
    case 'thinking:set':
    case 'effort:set':
    case 'model:set':
    case 'browser:create': {
      // Mock browser creation - send success response
      const createMsg = message as Extract<typeof message, { type: 'browser:create' }>;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'browser:created',
            uuid: crypto.randomUUID(),
            request_uuid: createMsg.uuid,
            label: 'mock-browser',
            url: createMsg.bounds.url,
          },
          '*'
        );
      }, 100);
      break;
    }
    case 'browser:clear':
      // Mock browser close - send cleared response
      setTimeout(() => {
        window.postMessage(
          {
            type: 'browser:cleared',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
          },
          '*'
        );
      }, 50);
      break;
    case 'browser:detect':
    case 'browser:navigate':
    case 'browser:back':
    case 'browser:forward':
    case 'browser:reload':
    case 'browser:stop':
    case 'browser:select-element:start':
    case 'browser:select-element:cancel':
    case 'browser:bounds':
    case 'browser:devtools':
    case 'browser:show':
    case 'browser:hide':
    case 'browser:tool_response':
    case 'subagents:list':
    case 'subagents:create':
    case 'subagents:update':
    case 'subagents:delete':
    case 'commands:list':
    case 'commands:create':
    case 'commands:update':
    case 'commands:delete':
    case 'subagents:generate':
    case 'commands:generate':
    case 'skills:list':
      break;
  }
}
