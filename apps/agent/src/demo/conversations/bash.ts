/**
 * CI/CD Pipeline Demo Scenario
 *
 * Simulates setting up a GitHub Actions CI pipeline with lint, test, build,
 * and deploy stages for a TypeScript monorepo.
 * Demonstrates: Read → Write → Bash (validation) → Bash (tests).
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-bash-001';

const USER_PROMPT =
  'Set up a GitHub Actions CI pipeline with lint, test, build, and deploy stages for our TypeScript monorepo.';

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events for the CI/CD pipeline demo.
 * Demonstrates reading project config, writing workflow YAML, and validating with Bash.
 */
export function buildBashScript(): DemoScript {
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
        "I'll set up a comprehensive CI/CD pipeline for your monorepo. Let me first check your project configuration to understand the setup.\n\n",
    },
  });

  // --- Phase 2: Read package.json ---
  const readToolId = `tool-read-bash-${crypto.randomUUID().slice(0, 8)}`;

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
        file_path: '/workspace/app/package.json',
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
      tool_output: JSON.stringify(
        {
          name: '@acme/monorepo',
          private: true,
          workspaces: ['apps/*', 'packages/*'],
          scripts: {
            dev: 'turbo dev',
            build: 'turbo build',
            lint: 'turbo lint',
            test: 'vitest run',
            typecheck: 'turbo typecheck',
          },
          devDependencies: {
            turbo: '^2.3.0',
            typescript: '^5.7.0',
            vitest: '^3.0.0',
            eslint: '^9.0.0',
          },
        },
        null,
        2
      ),
      success: true,
    },
  });

  // --- Phase 3: Post-read analysis ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "I see your project uses Bun with Turborepo for monorepo management. I'll create a CI workflow optimized for this setup with caching.\n\n",
    },
  });

  // --- Phase 4: Write CI workflow ---
  const writeToolId = `tool-write-bash-${crypto.randomUUID().slice(0, 8)}`;

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
        file_path: '/workspace/app/.github/workflows/ci.yml',
        content: [
          'name: CI',
          '',
          'on:',
          '  push:',
          '    branches: [main]',
          '  pull_request:',
          '    branches: [main]',
          '',
          'concurrency:',
          '  group: ${{ github.workflow }}-${{ github.ref }}',
          '  cancel-in-progress: true',
          '',
          'jobs:',
          '  lint:',
          '    name: Lint & Type Check',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: oven-sh/setup-bun@v2',
          '        with:',
          '          bun-version: latest',
          '      - run: bun install --frozen-lockfile',
          '      - uses: actions/cache@v4',
          '        with:',
          '          path: node_modules/.cache/turbo',
          '          key: turbo-lint-${{ runner.os }}-${{ hashFiles("bun.lockb") }}',
          '      - run: bun run lint',
          '      - run: bun run typecheck',
          '',
          '  test:',
          '    name: Test',
          '    runs-on: ubuntu-latest',
          '    needs: lint',
          '    strategy:',
          '      matrix:',
          '        shard: [1, 2, 3]',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: oven-sh/setup-bun@v2',
          '        with:',
          '          bun-version: latest',
          '      - run: bun install --frozen-lockfile',
          '      - run: bun run test -- --shard=${{ matrix.shard }}/3',
          '      - uses: actions/upload-artifact@v4',
          '        if: failure()',
          '        with:',
          '          name: test-results-${{ matrix.shard }}',
          '          path: test-results/',
          '',
          '  build:',
          '    name: Build',
          '    runs-on: ubuntu-latest',
          '    needs: [lint, test]',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: oven-sh/setup-bun@v2',
          '        with:',
          '          bun-version: latest',
          '      - run: bun install --frozen-lockfile',
          '      - uses: actions/cache@v4',
          '        with:',
          '          path: node_modules/.cache/turbo',
          '          key: turbo-build-${{ runner.os }}-${{ hashFiles("bun.lockb") }}',
          '      - run: bun run build',
          '      - uses: actions/upload-artifact@v4',
          '        with:',
          '          name: build-output',
          '          path: apps/*/dist/',
          '',
          '  deploy:',
          '    name: Deploy',
          '    runs-on: ubuntu-latest',
          '    needs: build',
          "    if: github.ref == 'refs/heads/main' && github.event_name == 'push'",
          '    environment: production',
          '    steps:',
          '      - uses: actions/download-artifact@v4',
          '        with:',
          '          name: build-output',
          '      - run: echo "Deploying to production..."',
          '        # Replace with actual deploy command',
        ].join('\n'),
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
      tool_id: writeToolId,
      tool_name: 'Write',
      tool_output: 'File written successfully',
      success: true,
    },
  });

  // --- Phase 5: Validation text ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'Let me validate the workflow syntax and run your existing checks to make sure everything is compatible.\n\n',
    },
  });

  // --- Phase 6: Bash validate workflow ---
  const bashValidateId = `tool-bash-validate-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashValidateId,
      tool_name: 'Bash',
      tool_input: {
        command: 'cd /workspace/app && gh workflow lint .github/workflows/ci.yml',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 2000,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashValidateId,
      tool_name: 'Bash',
      tool_output: [
        'Linting .github/workflows/ci.yml',
        '',
        '\u2713 No issues found',
        '',
        'Workflow is valid.',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 7: Bash lint + test ---
  const bashTestId = `tool-bash-test-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: bashTestId,
      tool_name: 'Bash',
      tool_input: {
        command: 'cd /workspace/app && bun run lint && bun test',
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
      tool_id: bashTestId,
      tool_name: 'Bash',
      tool_output: [
        '$ bun run lint',
        '> turbo lint',
        '',
        '\u2022 Packages in scope: @acme/web, @acme/api, @acme/shared',
        '\u2022 Running lint in 3 packages',
        '\u2022 Remote caching disabled',
        '',
        ' @acme/web:lint: \u2713 No ESLint warnings or errors',
        ' @acme/api:lint: \u2713 No ESLint warnings or errors',
        ' @acme/shared:lint: \u2713 No ESLint warnings or errors',
        '',
        ' Tasks:    3 successful, 3 total',
        ' Duration: 4.2s',
        '',
        '$ bun test',
        'bun test v1.2.0',
        '',
        ' \u2713 apps/web (12 tests) [1.4s]',
        ' \u2713 apps/api (8 tests) [0.9s]',
        ' \u2713 packages/shared (5 tests) [0.3s]',
        '',
        '25 pass | 0 fail (2.6s)',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 8: Summary ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "The CI pipeline is set up and validated. Here's the pipeline structure:\n\n" +
        '1. **Lint & Type Check** \u2014 ESLint + TypeScript with Turbo caching\n' +
        '2. **Test** \u2014 Vitest with 3x parallel sharding for faster execution\n' +
        '3. **Build** \u2014 Production builds with artifact upload\n' +
        '4. **Deploy** \u2014 Only on `main` push, with environment protection rules\n\n' +
        'The pipeline uses `concurrency` groups to cancel redundant runs on force-pushes, and Turbo remote caching to speed up repeated builds.\n',
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
      duration_ms: 16000,
    },
  });

  return {
    title: 'CI/CD Pipeline',
    userPrompt: USER_PROMPT,
    events,
  };
}
