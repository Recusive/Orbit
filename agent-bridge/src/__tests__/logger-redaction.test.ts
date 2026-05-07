import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'bun:test';

function runLoggerSnippet(): string {
  const script = `
    import { createLogger } from './src/common/logging/logger.ts';

    const logger = createLogger('SecurityRegression');
    logger.error(
      {
        apiKey: 'sk-ant-structured-secret',
        line: '{"type":"update_credentials","apiKey":"sk-ant-line-secret"}',
        nested: {
          refreshToken: 'refresh-token-secret',
          authorization: 'Bearer bearer-token-secret',
        },
      },
      'failed with sk-ant-message-secret and Bearer message-token-secret'
    );
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  return result.stderr;
}

describe('agent-bridge logger redaction', () => {
  it('redacts credentials from structured context and messages', () => {
    const stderr = runLoggerSnippet();

    expect(stderr).toContain('[REDACTED');
    expect(stderr).not.toContain('sk-ant-structured-secret');
    expect(stderr).not.toContain('sk-ant-line-secret');
    expect(stderr).not.toContain('refresh-token-secret');
    expect(stderr).not.toContain('bearer-token-secret');
    expect(stderr).not.toContain('sk-ant-message-secret');
    expect(stderr).not.toContain('message-token-secret');
  });
});
