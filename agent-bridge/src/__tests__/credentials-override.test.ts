import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ClaudeCredentials } from '../common/auth/credentials.js';

describe('ClaudeCredentials settings override', () => {
  let savedApiKey: string | undefined;
  let savedSettingsFlag: string | undefined;
  let savedOAuthToken: string | undefined;
  let savedAnthropicAuthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    savedSettingsFlag = process.env.ORBIT_SETTINGS_API_KEY;
    savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    savedAnthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
    ClaudeCredentials.setCredentialOverride(undefined);
    ClaudeCredentials.restoreEnvApiKeyFallback();
  });

  afterEach(() => {
    ClaudeCredentials.setCredentialOverride(undefined);
    ClaudeCredentials.restoreEnvApiKeyFallback();

    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }

    if (savedSettingsFlag !== undefined) {
      process.env.ORBIT_SETTINGS_API_KEY = savedSettingsFlag;
    } else {
      delete process.env.ORBIT_SETTINGS_API_KEY;
    }

    if (savedOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    if (savedAnthropicAuthToken !== undefined) {
      process.env.ANTHROPIC_AUTH_TOKEN = savedAnthropicAuthToken;
    } else {
      delete process.env.ANTHROPIC_AUTH_TOKEN;
    }
  });

  it('initializes the override from the startup env flag', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-settings-startup-override';
    process.env.ORBIT_SETTINGS_API_KEY = '1';

    ClaudeCredentials.initOverrideFromEnv();

    const result = await ClaudeCredentials.getCredentials();
    expect(result.type).toBe('apikey');
    expect(result.hasCredentials).toBe(true);
    expect(result.token).toBe('sk-ant-settings-startup-override');
  });

  it('replaces and clears the override without leaving stale state behind', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-fallback';
    delete process.env.ORBIT_SETTINGS_API_KEY;

    ClaudeCredentials.setCredentialOverride('sk-ant-manual-override');
    let result = await ClaudeCredentials.getCredentials();
    expect(result.type).toBe('apikey');
    expect(result.token).toBe('sk-ant-manual-override');

    ClaudeCredentials.setCredentialOverride(undefined);
    result = await ClaudeCredentials.getCredentials();

    expect(result.token).not.toBe('sk-ant-manual-override');
    if (result.type === 'apikey') {
      expect(result.token).toBe('sk-ant-env-fallback');
    } else {
      expect(result.type).toBe('oauth');
    }
  });

  it('restores the saved shell API key fallback exactly once', () => {
    const shellFallback = 'sk-ant-shell-fallback';
    process.env.ANTHROPIC_API_KEY = shellFallback;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-token';
    process.env.ANTHROPIC_AUTH_TOKEN = 'legacy-token';

    ClaudeCredentials.saveEnvApiKeyFallback(shellFallback);

    delete process.env.ANTHROPIC_API_KEY;

    expect(ClaudeCredentials.restoreEnvApiKeyFallback()).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe(shellFallback);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(ClaudeCredentials.restoreEnvApiKeyFallback()).toBe(false);
  });

  it('returns false when no saved shell API key fallback exists', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(ClaudeCredentials.restoreEnvApiKeyFallback()).toBe(false);
  });
});
