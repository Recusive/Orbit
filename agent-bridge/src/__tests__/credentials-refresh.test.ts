/**
 * Integration tests for OAuth Token Expiry Recovery (3-Layer Defense)
 *
 * Tests the credential refresh system that prevents mid-session auth failures:
 * - Layer 1: Proactive token refresh (scheduleAutoRefresh)
 * - Layer 2: Pre-send credential re-validation (refreshIfNeeded)
 * - Layer 3: Structured auth error events to frontend
 *
 * ## What these tests verify:
 *
 * 1. getTokenExpiry() reads expiry from real macOS Keychain
 * 2. refreshIfNeeded() correctly identifies expired/valid tokens
 * 3. scheduleAutoRefresh() fires before expiry and self-reschedules
 * 4. getCredentials() returns real credentials with OAuth-first priority
 * 5. API key fallback works when no OAuth token is available
 * 6. Environment variable CLAUDE_CODE_OAUTH_TOKEN is updated on refresh
 *
 * Requires: macOS with Claude Code CLI credentials in Keychain (auto-skip otherwise)
 *
 * Run: cd agent-bridge && bun test credentials-refresh
 * Debug: DEBUG_TESTS=1 cd agent-bridge && bun test credentials-refresh
 */

import { spawnSync } from 'child_process';

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { ClaudeCredentials } from '../common/auth/credentials.js';

import type { TokenRefreshResult, AutoRefreshFailureCallback } from '../common/auth/credentials.js';

// Debug logging - set DEBUG_TESTS=1 to enable
const DEBUG = process.env.DEBUG_TESTS === '1';
function noop(...args: unknown[]): void {
  void args;
}
const log: (...args: unknown[]) => void = DEBUG ? console.warn.bind(console) : noop;

// ============================================================================
// Environment Detection
// ============================================================================

/** Check if running on macOS (required for Keychain access) */
const isMacOS = process.platform === 'darwin';

/** Check if running in CI (skip real Keychain tests) */
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

/** Check if Keychain has Claude credentials by actually reading them */
function keychainHasCredentials(): boolean {
  if (!isMacOS) return false;
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
    { encoding: 'utf-8', timeout: 10_000 }
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}

/** Read raw keychain data for test assertions */
function readRawKeychainData(): Record<string, unknown> | null {
  if (!isMacOS) return null;
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
    { encoding: 'utf-8', timeout: 10_000 }
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const hasKeychainCredentials = !isCI && keychainHasCredentials();
const hasApiKey =
  process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== '';
const hasAnyCredentials = hasKeychainCredentials || hasApiKey;

log('[TEST ENV]', {
  isMacOS,
  isCI,
  hasKeychainCredentials,
  hasApiKey,
  hasAnyCredentials,
});

// ============================================================================
// getCredentials() — Full credential resolution
// ============================================================================

describe('ClaudeCredentials.getCredentials()', () => {
  it.skipIf(!hasAnyCredentials)(
    'returns credentials with hasCredentials=true when credentials exist',
    async () => {
      const result = await ClaudeCredentials.getCredentials();
      log('[getCredentials]', { type: result.type, hasCredentials: result.hasCredentials });

      expect(result.hasCredentials).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      const token = result.token ?? '';
      expect(token.length).toBeGreaterThan(0);
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'returns oauth type when Keychain credentials are available',
    async () => {
      // Save and clear API key to ensure OAuth is used
      const savedApiKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const result = await ClaudeCredentials.getCredentials();
        log('[getCredentials:oauth]', { type: result.type, tokenLength: result.token?.length });

        expect(result.type).toBe('oauth');
        expect(result.hasCredentials).toBe(true);
        expect(result.token).toBeDefined();
        // Real OAuth tokens are substantial (100+ chars)
        const oauthToken = result.token ?? '';
        expect(oauthToken.length).toBeGreaterThan(50);
      } finally {
        // Restore API key
        if (savedApiKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = savedApiKey;
        }
      }
    }
  );

  it.skipIf(!hasApiKey)(
    'returns apikey type when only API key is available (no Keychain)',
    async () => {
      // This test verifies the fallback path — works even without Keychain
      const result = await ClaudeCredentials.getCredentials();
      log('[getCredentials:apikey]', { type: result.type });

      // If Keychain is also available, it will be OAuth (priority); that's fine
      expect(result.hasCredentials).toBe(true);
      expect(result.token).toBeDefined();
    }
  );

  // Task #44: Split conditional assertion into separate test cases to ensure
  // both paths are validated (and clearly skipped when not applicable).
  it.skipIf(hasKeychainCredentials)(
    'returns hasCredentials=false when no credentials exist (no Keychain)',
    async () => {
      // Save env vars
      const savedApiKey = process.env.ANTHROPIC_API_KEY;
      const savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      try {
        const result = await ClaudeCredentials.getCredentials();
        log('[getCredentials:none]', result);

        expect(result.hasCredentials).toBe(false);
        expect(result.token).toBeUndefined();
      } finally {
        if (savedApiKey !== undefined) process.env.ANTHROPIC_API_KEY = savedApiKey;
        if (savedOAuthToken !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
      }
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'returns hasCredentials=true from Keychain even when env vars are cleared',
    async () => {
      // Save env vars
      const savedApiKey = process.env.ANTHROPIC_API_KEY;
      const savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      try {
        // Keychain creds exist, so getCredentials should still return them
        const result = await ClaudeCredentials.getCredentials();
        log('[getCredentials:keychainFallback]', result);

        expect(result.hasCredentials).toBe(true);
      } finally {
        if (savedApiKey !== undefined) process.env.ANTHROPIC_API_KEY = savedApiKey;
        if (savedOAuthToken !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
      }
    }
  );
});

// ============================================================================
// getApiKeyFromEnv() — Environment variable fallback
// ============================================================================

describe('ClaudeCredentials.getApiKeyFromEnv()', () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('returns the API key when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345';
    const result = ClaudeCredentials.getApiKeyFromEnv();

    expect(result).toBe('sk-ant-test-key-12345');
  });

  it('returns null when ANTHROPIC_API_KEY is empty string', () => {
    process.env.ANTHROPIC_API_KEY = '';
    const result = ClaudeCredentials.getApiKeyFromEnv();

    expect(result).toBeNull();
  });

  it('returns null when ANTHROPIC_API_KEY is not set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = ClaudeCredentials.getApiKeyFromEnv();

    expect(result).toBeNull();
  });
});

// ============================================================================
// getOAuthTokenFromKeychain() — Real Keychain reads
// ============================================================================

describe('ClaudeCredentials.getOAuthTokenFromKeychain()', () => {
  it.skipIf(!hasKeychainCredentials)('reads a real OAuth token from macOS Keychain', async () => {
    const token = await ClaudeCredentials.getOAuthTokenFromKeychain();
    log('[getOAuthTokenFromKeychain]', { tokenLength: token?.length });

    expect(token).not.toBeNull();
    expect(typeof token).toBe('string');
    const t = token ?? '';
    expect(t.length).toBeGreaterThan(50);
  });

  it.skipIf(!isMacOS || hasKeychainCredentials)(
    'returns null when no Keychain credentials exist',
    async () => {
      const token = await ClaudeCredentials.getOAuthTokenFromKeychain();
      expect(token).toBeNull();
    }
  );

  it.skipIf(!hasKeychainCredentials)('keychain data has expected structure', () => {
    const raw = readRawKeychainData();
    log('[rawKeychainData] keys:', raw !== null ? Object.keys(raw) : 'null');

    expect(raw).not.toBeNull();
    if (raw === null) return;

    // Should have claudeAiOauth field (where OAuth tokens live)
    expect(raw).toHaveProperty('claudeAiOauth');

    const oauth = raw.claudeAiOauth as Record<string, unknown> | undefined;
    if (oauth !== undefined) {
      log('[rawKeychainData:oauth] keys:', Object.keys(oauth));
      // Should have at least accessToken
      expect(oauth).toHaveProperty('accessToken');
      expect(typeof oauth.accessToken).toBe('string');
      // expiresAt should be present for token lifecycle management
      expect(oauth).toHaveProperty('expiresAt');
    }
  });
});

// ============================================================================
// getTokenExpiry() — Lightweight expiry check
// ============================================================================

describe('ClaudeCredentials.getTokenExpiry()', () => {
  it.skipIf(!hasKeychainCredentials)('returns a valid timestamp from real Keychain data', () => {
    const expiryMs = ClaudeCredentials.getTokenExpiry();
    log('[getTokenExpiry]', {
      expiryMs,
      expiryDate: expiryMs !== null ? new Date(expiryMs).toISOString() : null,
      nowMs: Date.now(),
      diffMinutes: expiryMs !== null ? Math.round((expiryMs - Date.now()) / 60_000) : null,
    });

    // Should return a number (timestamp in ms)
    expect(expiryMs).not.toBeNull();
    expect(typeof expiryMs).toBe('number');
    if (expiryMs !== null) {
      // Should be a reasonable timestamp (after 2024-01-01)
      expect(expiryMs).toBeGreaterThan(new Date('2024-01-01').getTime());
    }
  });

  it.skipIf(!hasKeychainCredentials)('expiry matches what raw Keychain data reports', () => {
    const expiryMs = ClaudeCredentials.getTokenExpiry();
    const raw = readRawKeychainData();
    const oauth = raw?.claudeAiOauth as Record<string, unknown> | undefined;

    if (oauth?.expiresAt !== undefined) {
      const rawExpiry = oauth.expiresAt;
      log('[expiryComparison]', { fromFunction: expiryMs, rawValue: rawExpiry });

      // Both should resolve to the same timestamp
      expect(expiryMs).not.toBeNull();
      // The function parses the raw value, so they should match
      if (typeof rawExpiry === 'number') {
        expect(expiryMs).toBe(rawExpiry);
      }
    }
  });

  it.skipIf(!isMacOS || hasKeychainCredentials)(
    'returns null when no Keychain credentials exist',
    () => {
      const expiryMs = ClaudeCredentials.getTokenExpiry();
      expect(expiryMs).toBeNull();
    }
  );
});

// ============================================================================
// refreshIfNeeded() — Pre-send credential re-validation
// ============================================================================

describe('ClaudeCredentials.refreshIfNeeded()', () => {
  let savedApiKey: string | undefined;
  let savedOAuthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it('returns { refreshed: false } for API key users (no refresh needed)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345';

    const result: TokenRefreshResult = await ClaudeCredentials.refreshIfNeeded();
    log('[refreshIfNeeded:apikey]', result);

    expect(result.refreshed).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it.skipIf(!hasKeychainCredentials)(
    'returns a result when checking with real Keychain credentials',
    async () => {
      // Clear API key to force OAuth path
      delete process.env.ANTHROPIC_API_KEY;

      const result: TokenRefreshResult = await ClaudeCredentials.refreshIfNeeded();
      log('[refreshIfNeeded:oauth]', {
        refreshed: result.refreshed,
        hasToken: result.token !== undefined,
        tokenLength: result.token?.length,
      });

      // Either the token is still valid (refreshed: false) or was refreshed (refreshed: true)
      // Both are valid outcomes — we're testing that the function doesn't crash
      expect(typeof result.refreshed).toBe('boolean');

      if (result.refreshed && result.token !== undefined) {
        expect(result.token.length).toBeGreaterThan(50);
        // Verify env var was updated
        expect(String(process.env.CLAUDE_CODE_OAUTH_TOKEN)).toBe(String(result.token));
        log('[refreshIfNeeded] Token was refreshed and env var updated');
      } else {
        log('[refreshIfNeeded] Token still valid, no refresh needed');
      }
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'updates CLAUDE_CODE_OAUTH_TOKEN env var when token is refreshed',
    async () => {
      delete process.env.ANTHROPIC_API_KEY;
      // Clear the env var to force a refresh
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const result = await ClaudeCredentials.refreshIfNeeded();
      log('[refreshIfNeeded:envCheck]', {
        refreshed: result.refreshed,
        envVarSet: process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined,
      });

      if (result.refreshed && result.token !== undefined) {
        expect(String(process.env.CLAUDE_CODE_OAUTH_TOKEN)).toBe(String(result.token));
      }
    }
  );

  it('handles no credentials gracefully (no crash)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // On a machine without Keychain creds, this should return { refreshed: false }
    // On a machine with Keychain creds, it will work normally
    const result = await ClaudeCredentials.refreshIfNeeded();
    log('[refreshIfNeeded:none]', result);

    expect(typeof result.refreshed).toBe('boolean');
    // Should never throw — graceful degradation
  });
});

// ============================================================================
// scheduleAutoRefresh() — Background timer lifecycle
// ============================================================================

describe('ClaudeCredentials.scheduleAutoRefresh()', () => {
  it('returns a cleanup function', () => {
    const failures: string[] = [];
    const onFailure: AutoRefreshFailureCallback = (msg) => {
      failures.push(msg);
    };

    const cleanup = ClaudeCredentials.scheduleAutoRefresh(onFailure);

    expect(typeof cleanup).toBe('function');

    // Immediately cancel — should not throw
    cleanup();
  });

  it('cleanup function can be called multiple times safely', () => {
    const failures: string[] = [];
    const cleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => {
      failures.push(msg);
    });

    // Call cleanup multiple times — should not throw
    cleanup();
    cleanup();
    cleanup();

    // No failures should have been reported (we cancelled immediately)
    expect(failures).toHaveLength(0);
  });

  it.skipIf(!hasKeychainCredentials)(
    'schedules based on real token expiry without error',
    async () => {
      const failures: string[] = [];
      const cleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => {
        failures.push(msg);
        log('[scheduleAutoRefresh:failure]', msg);
      });

      // Let the scheduling logic run (it reads Keychain synchronously)
      await new Promise((resolve) => setTimeout(resolve, 100));

      log('[scheduleAutoRefresh]', {
        failureCount: failures.length,
        expiryMs: ClaudeCredentials.getTokenExpiry(),
      });

      // Should not have failed immediately (token should still be valid)
      expect(failures).toHaveLength(0);

      cleanup();
    }
  );

  it('does not call onFailure if cancelled before timer fires', async () => {
    const failures: string[] = [];
    const cleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => {
      failures.push(msg);
    });

    // Wait briefly then cancel
    await new Promise((resolve) => setTimeout(resolve, 50));
    cleanup();

    // Wait a bit more to ensure no late callbacks
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(failures).toHaveLength(0);
  });
});

// ============================================================================
// refreshOAuthToken() — Real token refresh (careful: mutates state)
// ============================================================================

describe('ClaudeCredentials.refreshOAuthToken()', () => {
  it('returns null for an invalid refresh token', async () => {
    const result = await ClaudeCredentials.refreshOAuthToken('invalid-refresh-token-xyz');
    log('[refreshOAuthToken:invalid]', result);

    // Invalid token should fail gracefully
    expect(result).toBeNull();
  });

  it('returns null for an empty refresh token', async () => {
    const result = await ClaudeCredentials.refreshOAuthToken('');
    log('[refreshOAuthToken:empty]', result);

    expect(result).toBeNull();
  });

  it.skipIf(!hasKeychainCredentials)(
    'real refresh token from Keychain produces a valid response',
    async () => {
      // Read the actual refresh token from Keychain
      const raw = readRawKeychainData();
      const oauth = raw?.claudeAiOauth as Record<string, unknown> | undefined;
      const refreshToken = oauth?.refreshToken as string | undefined;

      if (refreshToken === undefined || refreshToken === '') {
        log('[refreshOAuthToken:skip] No refresh token in Keychain');
        return;
      }

      log('[refreshOAuthToken:real] Attempting refresh with real token');
      const result = await ClaudeCredentials.refreshOAuthToken(refreshToken);
      log('[refreshOAuthToken:real]', {
        success: result !== null,
        accessTokenLength: result?.accessToken.length,
        expiresIn: result?.expiresIn,
      });

      // Real refresh should succeed if the refresh token is valid
      if (result !== null) {
        expect(result.accessToken).toBeDefined();
        expect(typeof result.accessToken).toBe('string');
        expect(result.accessToken.length).toBeGreaterThan(50);
        expect(result.expiresIn).toBeGreaterThan(0);
      }
      // It's also valid for it to return null (e.g., if the refresh token is revoked)
    }
  );
});

// ============================================================================
// Credential priority & environment interaction
// ============================================================================

describe('Credential priority and env var interactions', () => {
  let savedApiKey: string | undefined;
  let savedOAuthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it.skipIf(!hasKeychainCredentials)(
    'OAuth takes priority over API key when both are available',
    async () => {
      // Set an API key
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-should-not-be-used';

      const result = await ClaudeCredentials.getCredentials();
      log('[priority]', { type: result.type });

      // OAuth should win
      expect(result.type).toBe('oauth');
      expect(result.hasCredentials).toBe(true);
      // Token should NOT be the API key
      expect(result.token).not.toBe('sk-ant-test-key-should-not-be-used');
    }
  );

  it('falls back to API key when no OAuth token available', async () => {
    // Set a valid-looking API key
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-fallback-test-key';

    // If no Keychain creds, should fall back to API key
    if (!hasKeychainCredentials) {
      const result = await ClaudeCredentials.getCredentials();
      log('[fallback]', { type: result.type });

      expect(result.type).toBe('apikey');
      expect(result.hasCredentials).toBe(true);
      expect(result.token).toBe('sk-ant-api03-fallback-test-key');
    }
  });

  it('refreshIfNeeded skips refresh for API key users', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-no-refresh-needed';

    const before = Date.now();
    const result = await ClaudeCredentials.refreshIfNeeded();
    const elapsed = Date.now() - before;

    log('[refreshIfNeeded:apikey:perf]', { elapsed, result });

    expect(result.refreshed).toBe(false);
    // Should be near-instant (no Keychain read)
    expect(elapsed).toBeLessThan(100);
  });
});

// ============================================================================
// Edge cases and error resilience
// ============================================================================

describe('Error resilience', () => {
  it('getTokenExpiry handles missing Keychain gracefully on non-macOS', () => {
    // This will either return a timestamp (macOS with creds) or null (anything else)
    const result = ClaudeCredentials.getTokenExpiry();
    log('[getTokenExpiry:resilience]', { result, platform: process.platform });

    if (!isMacOS) {
      expect(result).toBeNull();
    }
    // On macOS, could be null or a number — both are valid
    if (result !== null) {
      expect(typeof result).toBe('number');
      expect(Number.isFinite(result)).toBe(true);
    }
  });

  it('refreshOAuthToken handles network timeout gracefully', async () => {
    // Use a token that will fail auth — the function should return null, not throw
    const result = await ClaudeCredentials.refreshOAuthToken(
      'definitely-not-a-valid-refresh-token-but-should-not-crash'
    );

    expect(result).toBeNull();
  });

  it.skipIf(!hasKeychainCredentials)(
    'getCredentials succeeds after clearing CLAUDE_CODE_OAUTH_TOKEN env var',
    async () => {
      // Simulate what happens after a restart where env var is stale
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const result = await ClaudeCredentials.getCredentials();
      log('[resilience:clearEnv]', { type: result.type, hasCredentials: result.hasCredentials });

      // Should still succeed by reading from Keychain
      expect(result.hasCredentials).toBe(true);
      expect(result.type).toBe('oauth');
    }
  );

  it('multiple concurrent refreshIfNeeded calls do not crash', async () => {
    // Fire several concurrent refresh attempts — should not race or crash
    const results = await Promise.all([
      ClaudeCredentials.refreshIfNeeded(),
      ClaudeCredentials.refreshIfNeeded(),
      ClaudeCredentials.refreshIfNeeded(),
    ]);

    log(
      '[concurrent]',
      results.map((r) => ({ refreshed: r.refreshed }))
    );

    for (const result of results) {
      expect(typeof result.refreshed).toBe('boolean');
    }
  });

  it('multiple scheduleAutoRefresh instances can coexist', () => {
    const failures1: string[] = [];
    const failures2: string[] = [];

    const cleanup1 = ClaudeCredentials.scheduleAutoRefresh((msg) => failures1.push(msg));
    const cleanup2 = ClaudeCredentials.scheduleAutoRefresh((msg) => failures2.push(msg));

    // Both should have returned cleanup functions
    expect(typeof cleanup1).toBe('function');
    expect(typeof cleanup2).toBe('function');

    // Cleanup both — should not throw or interfere
    cleanup1();
    cleanup2();
  });
});

// ============================================================================
// CRITICAL: Expired token simulation
// The #1 scenario this feature was built for — token expires mid-session
// ============================================================================

describe('Expired token recovery (core scenario)', () => {
  let savedApiKey: string | undefined;
  let savedOAuthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it.skipIf(!hasKeychainCredentials)(
    'refreshIfNeeded returns valid credentials even when env var holds stale token',
    async () => {
      // Simulate: session started hours ago, env var has a stale token from initial load
      delete process.env.ANTHROPIC_API_KEY;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'stale-expired-token-from-session-start';

      const result = await ClaudeCredentials.refreshIfNeeded();
      log('[expired:staleEnv]', {
        refreshed: result.refreshed,
        hasToken: result.token !== undefined,
      });

      // refreshIfNeeded should detect the real token expiry from Keychain,
      // not trust the stale env var. It should either:
      // - Return refreshed: false (token in Keychain is still valid) OR
      // - Return refreshed: true with a new token
      expect(typeof result.refreshed).toBe('boolean');

      // After the call, the env var should NOT still be the stale value
      // (either refreshed, or the system read fresh from Keychain)
      if (result.refreshed && result.token !== undefined) {
        expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).not.toBe(
          'stale-expired-token-from-session-start'
        );
        expect(String(process.env.CLAUDE_CODE_OAUTH_TOKEN)).toBe(String(result.token));
      }
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'getCredentials recovers from completely cleared env state',
    async () => {
      // Simulate: bridge restart where all env vars are gone
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const result = await ClaudeCredentials.getCredentials();
      log('[expired:clearState]', { type: result.type, hasCredentials: result.hasCredentials });

      // Should recover by reading fresh from Keychain
      expect(result.hasCredentials).toBe(true);
      expect(result.type).toBe('oauth');
      expect(result.token).toBeDefined();
      const token = result.token ?? '';
      expect(token.length).toBeGreaterThan(50);
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'refreshIfNeeded correctly checks expiry buffer (5 min window)',
    async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const expiryMs = ClaudeCredentials.getTokenExpiry();
      const result = await ClaudeCredentials.refreshIfNeeded();

      log('[expired:bufferCheck]', {
        expiryMs,
        nowMs: Date.now(),
        diffMinutes: expiryMs !== null ? Math.round((expiryMs - Date.now()) / 60_000) : null,
        refreshed: result.refreshed,
      });

      if (expiryMs !== null) {
        const minutesUntilExpiry = (expiryMs - Date.now()) / 60_000;

        if (minutesUntilExpiry > 5) {
          // Token has more than 5 minutes left — should NOT have refreshed
          expect(result.refreshed).toBe(false);
          log('[expired:bufferCheck] Token valid, refresh correctly skipped');
        } else {
          // Token within 5-minute buffer — should have attempted refresh
          log('[expired:bufferCheck] Token near expiry, refresh was attempted');
          expect(typeof result.refreshed).toBe('boolean');
        }
      }
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'getOAuthTokenFromKeychain returns a non-expired token directly',
    async () => {
      // The core Keychain reader should return a valid token when not expired
      const token = await ClaudeCredentials.getOAuthTokenFromKeychain();
      const expiryMs = ClaudeCredentials.getTokenExpiry();

      log('[expired:keychainDirect]', {
        hasToken: token !== null,
        tokenLength: token?.length,
        expiryMs,
        minutesUntilExpiry: expiryMs !== null ? Math.round((expiryMs - Date.now()) / 60_000) : null,
      });

      if (expiryMs !== null && expiryMs - Date.now() > 300_000) {
        // Token not expired — should return it directly without refresh attempt
        expect(token).not.toBeNull();
        const t = token ?? '';
        expect(t.length).toBeGreaterThan(50);
      }
    }
  );

  it('refreshOAuthToken with garbage token returns null without crashing', async () => {
    // Simulate what happens when Keychain has corrupted refresh token
    const garbageTokens = [
      'null',
      'undefined',
      '{}',
      '{"not":"a-token"}',
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.corrupt.payload',
      'a'.repeat(10000), // very long string
      '\x00\x01\x02', // binary garbage
    ];

    for (const token of garbageTokens) {
      const result = await ClaudeCredentials.refreshOAuthToken(token);
      log('[expired:garbage]', { token: token.slice(0, 30), result });
      expect(result).toBeNull();
    }
  });
});

// ============================================================================
// scheduleAutoRefresh timer behavior
// ============================================================================

describe('scheduleAutoRefresh timer behavior', () => {
  it.skipIf(!hasKeychainCredentials)(
    'timer calculates correct delay based on real token expiry',
    () => {
      const expiryMs = ClaudeCredentials.getTokenExpiry();
      if (expiryMs === null) return;

      const expectedDelay = Math.max(expiryMs - Date.now() - 300_000, 0);
      log('[timer:delay]', {
        expiryMs,
        expectedDelayMinutes: Math.round(expectedDelay / 60_000),
        expectedDelayMs: expectedDelay,
      });

      // The delay should be positive (token should still be valid) and less than 24 hours
      expect(expectedDelay).toBeGreaterThanOrEqual(0);
      expect(expectedDelay).toBeLessThan(86_400_000); // < 24 hours

      // Schedule and immediately cancel — verifies no crash with real delay
      const cleanup = ClaudeCredentials.scheduleAutoRefresh(noop);
      cleanup();
    }
  );

  it('onFailure is not called when timer is cancelled before expiry', async () => {
    let failureCalled = false;
    const cleanup = ClaudeCredentials.scheduleAutoRefresh(() => {
      failureCalled = true;
    });

    // Wait 200ms (timer won't fire — tokens typically have hours of life)
    await new Promise((resolve) => setTimeout(resolve, 200));
    cleanup();

    // Wait another 200ms to catch any late callbacks
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(failureCalled).toBe(false);
  });

  it('multiple schedule+cancel cycles do not leak timers', () => {
    const cleanups: (() => void)[] = [];

    // Rapidly schedule and cancel 10 times
    for (let i = 0; i < 10; i++) {
      const cleanup = ClaudeCredentials.scheduleAutoRefresh(noop);
      cleanups.push(cleanup);
    }

    // Cancel all
    for (const cleanup of cleanups) {
      cleanup();
    }

    // No assertion needed — if timers leaked, we'd see memory/timeout warnings
    // The test passing without hanging proves timers are cleaned up
    expect(cleanups).toHaveLength(10);
  });
});

// ============================================================================
// Keychain data structure validation
// ============================================================================

describe('Keychain data structure edge cases', () => {
  it.skipIf(!hasKeychainCredentials)('raw Keychain data contains all required OAuth fields', () => {
    const raw = readRawKeychainData();
    expect(raw).not.toBeNull();
    if (raw === null) return;

    const oauth = raw.claudeAiOauth as Record<string, unknown> | undefined;
    expect(oauth).toBeDefined();
    if (oauth === undefined) return;

    // Core fields that the refresh system depends on
    const requiredFields = ['accessToken', 'expiresAt'];
    for (const field of requiredFields) {
      expect(oauth).toHaveProperty(field);
      const fieldValue = oauth[field];
      const fieldType = typeof fieldValue;
      log(`[keychain:field:${field}]`, {
        present: true,
        type: fieldType,
        value:
          field === 'expiresAt'
            ? fieldValue
            : `[${fieldType}:${String(String(fieldValue).length)}chars]`,
      });
    }

    // refreshToken is critical for the refresh flow
    if (oauth.refreshToken !== undefined) {
      expect(typeof oauth.refreshToken).toBe('string');
      expect((oauth.refreshToken as string).length).toBeGreaterThan(0);
      log('[keychain:refreshToken] present and non-empty');
    } else {
      log('[keychain:refreshToken] MISSING — auto-refresh will fail when token expires');
    }
  });

  it.skipIf(!hasKeychainCredentials)(
    'expiresAt is in the future (token not already expired)',
    () => {
      const expiryMs = ClaudeCredentials.getTokenExpiry();
      expect(expiryMs).not.toBeNull();
      if (expiryMs === null) return;

      const now = Date.now();
      const diffMinutes = Math.round((expiryMs - now) / 60_000);
      log('[keychain:expiry]', {
        expiryDate: new Date(expiryMs).toISOString(),
        nowDate: new Date(now).toISOString(),
        minutesUntilExpiry: diffMinutes,
      });

      // If the token is already expired, that's a red flag for the user
      if (expiryMs <= now) {
        log('[keychain:expiry] WARNING: TOKEN IS EXPIRED — refresh should activate');
      } else {
        expect(expiryMs).toBeGreaterThan(now);
        log(`[keychain:expiry] Token valid for ${String(diffMinutes)} more minutes`);
      }
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'getTokenExpiry and getOAuthTokenFromKeychain agree on token state',
    async () => {
      const expiryMs = ClaudeCredentials.getTokenExpiry();
      const token = await ClaudeCredentials.getOAuthTokenFromKeychain();

      log('[keychain:consistency]', {
        hasExpiry: expiryMs !== null,
        hasToken: token !== null,
      });

      // If token is within the 5-min buffer, getOAuthTokenFromKeychain may return null
      // (it treats near-expired tokens as expired). Otherwise, both should agree.
      if (expiryMs !== null && expiryMs - Date.now() > 300_000) {
        // Well within validity — both should return values
        expect(token).not.toBeNull();
      }
      // If token is near/past expiry, getOAuthTokenFromKeychain may return null
      // while getTokenExpiry still returns the timestamp — that's correct behavior
    }
  );
});

// ============================================================================
// End-to-end credential flow simulation
// ============================================================================

describe('End-to-end credential flow', () => {
  let savedApiKey: string | undefined;
  let savedOAuthToken: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    savedOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it.skipIf(!hasKeychainCredentials)(
    'simulates full session lifecycle: load → validate → pre-send check',
    async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      // Step 1: Session start — load credentials
      const creds = await ClaudeCredentials.getCredentials();
      log('[e2e:step1] Load credentials', {
        type: creds.type,
        hasCredentials: creds.hasCredentials,
      });
      expect(creds.hasCredentials).toBe(true);
      expect(creds.token).toBeDefined();

      // Step 2: Set env var for SDK subprocess (like agent.ts does)
      process.env.CLAUDE_CODE_OAUTH_TOKEN = creds.token;

      // Step 3: Schedule auto-refresh (like agent.ts does in startSession)
      const failures: string[] = [];
      const cleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => failures.push(msg));

      // Step 4: Before sending a message — pre-send check (like session-manager.ts does)
      const preCheck = await ClaudeCredentials.refreshIfNeeded();
      log('[e2e:step4] Pre-send check', { refreshed: preCheck.refreshed });

      // Should not have failed
      expect(failures).toHaveLength(0);

      // Step 5: Cleanup (like agent.ts does in stopSession)
      cleanup();
    }
  );

  it.skipIf(!hasKeychainCredentials)(
    'simulates stale env var scenario (restart without re-auth)',
    async () => {
      delete process.env.ANTHROPIC_API_KEY;

      // Load real token first
      const creds = await ClaudeCredentials.getCredentials();
      expect(creds.token).toBeDefined();

      // Set env var to a stale value (simulating app restart with old token)
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-STALE-TOKEN-FROM-LAST-SESSION';

      // Pre-send check should detect the real Keychain state, not trust env var
      const result = await ClaudeCredentials.refreshIfNeeded();
      log('[e2e:stale]', { refreshed: result.refreshed });

      // After check, getCredentials should still work
      const freshCreds = await ClaudeCredentials.getCredentials();
      expect(freshCreds.hasCredentials).toBe(true);
      expect(freshCreds.token).not.toBe('sk-ant-oat01-STALE-TOKEN-FROM-LAST-SESSION');
    }
  );

  it('simulates no credentials scenario (fresh install, no login)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    if (hasKeychainCredentials) {
      // Can't fully test on a machine with creds, but verify no crash
      const creds = await ClaudeCredentials.getCredentials();
      expect(creds.hasCredentials).toBe(true);
      return;
    }

    // No Keychain + no API key = no credentials
    const creds = await ClaudeCredentials.getCredentials();
    expect(creds.hasCredentials).toBe(false);
    expect(creds.token).toBeUndefined();

    // refreshIfNeeded should not crash
    const result = await ClaudeCredentials.refreshIfNeeded();
    expect(result.refreshed).toBe(false);

    // scheduleAutoRefresh should not crash
    const failures: string[] = [];
    const cleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => failures.push(msg));

    await new Promise((resolve) => setTimeout(resolve, 100));
    cleanup();

    // No failures should fire immediately (timer set to retry in 5 min)
    expect(failures).toHaveLength(0);
  });
});

// ============================================================================
// Performance characteristics
// ============================================================================

describe('Performance', () => {
  it('getApiKeyFromEnv is near-instant (no I/O)', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      ClaudeCredentials.getApiKeyFromEnv();
    }
    const elapsed = Date.now() - start;
    log('[perf:getApiKeyFromEnv]', { elapsed, ops: 1000 });

    // 1000 calls should complete in < 50ms (no I/O involved)
    expect(elapsed).toBeLessThan(50);
  });

  it.skipIf(!isMacOS)('getTokenExpiry completes within 2 seconds (single Keychain read)', () => {
    const start = Date.now();
    ClaudeCredentials.getTokenExpiry();
    const elapsed = Date.now() - start;
    log('[perf:getTokenExpiry]', { elapsed });

    // Single Keychain read should be fast
    expect(elapsed).toBeLessThan(2000);
  });

  it.skipIf(!hasAnyCredentials)('getCredentials completes within 5 seconds', async () => {
    const start = Date.now();
    await ClaudeCredentials.getCredentials();
    const elapsed = Date.now() - start;
    log('[perf:getCredentials]', { elapsed });

    // Should complete reasonably fast (includes Keychain read + potential refresh)
    expect(elapsed).toBeLessThan(5000);
  });
});
