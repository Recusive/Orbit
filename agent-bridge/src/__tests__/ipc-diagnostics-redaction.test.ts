import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

const BRIDGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHUTDOWN_REQUEST = JSON.stringify({ type: 'shutdown' });

function runBridgeWithLines(lines: readonly string[]): {
  readonly stderr: string;
  readonly stdout: string;
} {
  const result = spawnSync(process.execPath, ['src/index.ts'], {
    cwd: BRIDGE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEBUG: '',
      NODE_ENV: 'test',
    },
    input: `${lines.join('\n')}\n`,
    timeout: 10_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);

  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe('agent-bridge IPC diagnostics', () => {
  it('does not write invalid request payload values to diagnostics', () => {
    const secretMessage = 'proprietary-repo-snippet-from-user-prompt';
    const invalidRequest = JSON.stringify({
      type: 'send_message',
      message: secretMessage,
    });

    const output = runBridgeWithLines([invalidRequest, SHUTDOWN_REQUEST]);
    const diagnostics = `${output.stderr}\n${output.stdout}`;

    expect(diagnostics).toContain('Invalid request schema');
    expect(diagnostics).toContain('lineLength');
    expect(diagnostics).toContain('topLevelKeys');
    expect(diagnostics).not.toContain(secretMessage);
    expect(diagnostics).not.toContain(invalidRequest);
  });

  it('does not write malformed request payload values to diagnostics', () => {
    const secretMessage = 'malformed-proprietary-repo-snippet';
    const malformedRequest = `{"type":"send_message","message":"${secretMessage}",`;

    const output = runBridgeWithLines([malformedRequest, SHUTDOWN_REQUEST]);
    const diagnostics = `${output.stderr}\n${output.stdout}`;

    expect(diagnostics).toContain('Failed to parse request JSON');
    expect(diagnostics).toContain('lineLength');
    expect(diagnostics).not.toContain(secretMessage);
    expect(diagnostics).not.toContain(malformedRequest);
  });

  it('does not write unusual top-level key names to diagnostics', () => {
    const secretKey = 'proprietary-repo-snippet-as-json-key';
    const invalidRequest = JSON.stringify({
      type: 'send_message',
      [secretKey]: 'placeholder',
    });

    const output = runBridgeWithLines([invalidRequest, SHUTDOWN_REQUEST]);
    const diagnostics = `${output.stderr}\n${output.stdout}`;

    expect(diagnostics).toContain('Invalid request schema');
    expect(diagnostics).toContain('[unrecognized-key]');
    expect(diagnostics).not.toContain(secretKey);
    expect(diagnostics).not.toContain(invalidRequest);
  });
});
