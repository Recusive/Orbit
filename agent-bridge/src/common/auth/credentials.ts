import { spawnSync } from 'child_process';

import { formatZodError } from '@orbit/shared-schemas';
import { z } from 'zod';

import { KeychainCredentialsSchema } from '../../protocol/schemas.js';
import { createLogger } from '../logging/logger.js';

/**
 * Persist updated credentials back to macOS Keychain.
 * Uses `security add-generic-password -U` to update the existing entry.
 * (Code review: Opus cycle 3, issues #7 and #10 — 3rd cycle fix)
 */
function writeKeychainCredentials(credentials: z.infer<typeof KeychainCredentialsSchema>): boolean {
  try {
    const jsonStr = JSON.stringify(credentials);
    const spawnResult = spawnSync(
      'security',
      [
        'add-generic-password',
        '-s',
        'Claude Code-credentials',
        '-a',
        'credentials',
        '-w',
        jsonStr,
        '-U',
      ],
      { encoding: 'utf-8', timeout: 10000 }
    );
    if (spawnResult.error || spawnResult.status !== 0) {
      logger.warn({ error: spawnResult.stderr }, 'Failed to write credentials to Keychain');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Keychain write error'
    );
    return false;
  }
}

/** OAuth token refresh response from Anthropic's token endpoint */
const OAuthRefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const logger = createLogger('ClaudeCredentials');

/** 5-minute buffer before token expiry to allow for clock skew and in-flight requests */
const EXPIRY_BUFFER_MS = 300_000;

/** Anthropic OAuth token endpoint */
const OAUTH_TOKEN_ENDPOINT = 'https://api.anthropic.com/v1/oauth/token';

/** OAuth client ID used by Claude Code CLI */
const OAUTH_CLIENT_ID = 'claude-desktop';

export interface CredentialResult {
  type: 'oauth' | 'apikey';
  hasCredentials: boolean;
  /** The actual token value (access token or API key) */
  token?: string;
}

export interface TokenRefreshResult {
  refreshed: boolean;
  token?: string;
  /** Present when a refresh was attempted but failed (Code review: Opus cycle 4, #6) */
  error?: string;
}

/** Callback invoked when a scheduled auto-refresh fails */
export type AutoRefreshFailureCallback = (error: string) => void;

function parseExpiryMs(expiresAt: number | string): number | null {
  if (typeof expiresAt === 'number') {
    return Number.isFinite(expiresAt) ? expiresAt : null;
  }

  const trimmed = expiresAt.trim();
  if (trimmed === '') return null;

  // If it's all digits, treat as a millisecond timestamp string.
  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number.parseInt(trimmed, 10);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  // Otherwise, attempt to parse as ISO or RFC date.
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Attempt to refresh an expired OAuth token using the refresh token.
 *
 * Calls Anthropic's OAuth token endpoint with the refresh token to obtain
 * a new access token. Returns null if refresh fails (caller should fall
 * back to CLI-based auth trigger).
 */
async function refreshOAuthToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const body = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000), // 15-second timeout
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        'OAuth token refresh failed'
      );
      return null;
    }

    const json: unknown = await response.json();
    const parseResult = OAuthRefreshResponseSchema.safeParse(json);
    if (!parseResult.success) {
      logger.warn({ error: formatZodError(parseResult.error) }, 'Invalid OAuth refresh response');
      return null;
    }

    logger.info({ expiresIn: parseResult.data.expires_in }, 'OAuth token refreshed successfully');

    // Persist rotated refresh token to Keychain so it survives process restarts.
    // Without this, the old (now-revoked) token in Keychain causes permanent auth failure.
    // (Code review: Opus cycle 3, issue #7 — 3rd cycle fix)
    if (
      parseResult.data.refresh_token !== undefined &&
      parseResult.data.refresh_token !== refreshToken
    ) {
      logger.info('OAuth response contains a rotated refresh_token, persisting to Keychain');
      const credentials = readKeychainCredentials();
      if (credentials?.claudeAiOauth) {
        credentials.claudeAiOauth.refreshToken = parseResult.data.refresh_token;
        const written = writeKeychainCredentials(credentials);
        if (!written) {
          logger.warn(
            'Failed to persist rotated refresh_token to Keychain — future refreshes may fail'
          );
        }
      }
    }

    return {
      accessToken: parseResult.data.access_token,
      expiresIn: parseResult.data.expires_in,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'OAuth token refresh error');
    return null;
  }
}

/**
 * Read and parse credentials from macOS Keychain.
 * Shared helper used by both `getOAuthTokenFromKeychain` and `getTokenExpiry`
 * to avoid duplicating the spawnSync + Zod parse logic.
 */
function readKeychainCredentials(): z.infer<typeof KeychainCredentialsSchema> | null {
  try {
    const spawnResult = spawnSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf-8', timeout: 10000 }
    );
    if (spawnResult.error || spawnResult.status !== 0) return null;
    const json: unknown = JSON.parse(spawnResult.stdout.trim());
    const parseResult = KeychainCredentialsSchema.safeParse(json);
    return parseResult.success ? parseResult.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads OAuth token from macOS Keychain where Claude Code CLI stores credentials.
 *
 * When the token is expired but a refresh token is available, attempts an
 * automatic refresh before returning null.
 *
 * @returns OAuth access token if valid and not expired, null otherwise
 */
async function getOAuthTokenFromKeychain(): Promise<string | null> {
  try {
    const credentials = readKeychainCredentials();
    if (credentials === null) {
      logger.debug('Failed to read or parse credentials from Keychain');
      return null;
    }

    const claudeAuth = credentials.claudeAiOauth;
    if (claudeAuth === undefined) {
      logger.debug('No Claude OAuth credentials found in Keychain');
      return null;
    }

    const accessToken = claudeAuth.accessToken;
    const expiresAt = claudeAuth.expiresAt;

    if (accessToken === undefined || accessToken === '') {
      logger.debug('OAuth token missing in Keychain credentials');
      return null;
    }

    // Validate token expiration (expiresAt can be number or string)
    if (expiresAt !== undefined && expiresAt !== '') {
      const expiryMs = parseExpiryMs(expiresAt);
      if (expiryMs === null) {
        logger.warn({ expiresAt }, 'Invalid OAuth token expiry value');
        return null;
      }

      // P3: 5-minute expiry buffer — treat token as expired if within 5 minutes of expiry
      if (Date.now() + EXPIRY_BUFFER_MS >= expiryMs) {
        logger.warn(
          { expiryDate: new Date(expiryMs).toISOString() },
          'Claude Code OAuth token expired or expiring soon'
        );

        // Attempt automatic refresh if refresh token is available
        const refreshToken = claudeAuth.refreshToken;
        if (refreshToken !== undefined && refreshToken !== '') {
          logger.info('Attempting automatic OAuth token refresh');
          const refreshed = await refreshOAuthToken(refreshToken);
          if (refreshed !== null) {
            // Persist refreshed access token + expiry to Keychain to avoid re-refresh
            // on cold start (~15s latency). (Code review: Opus cycle 3, issue #10)
            const freshCredentials = readKeychainCredentials();
            if (freshCredentials?.claudeAiOauth) {
              freshCredentials.claudeAiOauth.accessToken = refreshed.accessToken;
              freshCredentials.claudeAiOauth.expiresAt = String(
                Date.now() + refreshed.expiresIn * 1000
              );
              writeKeychainCredentials(freshCredentials);
            }
            return refreshed.accessToken;
          }
          logger.warn('OAuth token refresh failed, returning null');
        }

        return null;
      }

      logger.debug({ expiryDate: new Date(expiryMs).toISOString() }, 'OAuth token valid');
    }

    return accessToken;
  } catch (error) {
    // JSON parsing or other unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Unexpected error reading OAuth token from Keychain'
    );
    return null;
  }
}

/**
 * Reads API key from environment variable (loaded from .env file)
 * @returns API key if present, null otherwise
 */
function getApiKeyFromEnv(): string | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey === '') {
    logger.debug('ANTHROPIC_API_KEY not found in environment');
    return null;
  }

  return apiKey;
}

/**
 * Read the OAuth token expiry from macOS Keychain without performing a full
 * credential validation. Returns the expiry timestamp in milliseconds, or
 * null if the token is not OAuth or the expiry cannot be determined.
 *
 * This is a lightweight check suitable for scheduling background refresh timers.
 */
function getTokenExpiry(): number | null {
  const credentials = readKeychainCredentials();
  if (credentials === null) return null;

  const claudeAuth = credentials.claudeAiOauth;
  if (claudeAuth === undefined) return null;

  const expiresAt = claudeAuth.expiresAt;
  if (expiresAt === undefined || expiresAt === '') return null;

  return parseExpiryMs(expiresAt);
}

/**
 * Check if the current OAuth token is expired or expiring soon and attempt
 * a refresh if needed. Updates `process.env.CLAUDE_CODE_OAUTH_TOKEN` on
 * success so the CLI subprocess picks up the new token.
 *
 * @returns Whether a refresh was performed and the new token if so
 */
async function refreshIfNeeded(): Promise<TokenRefreshResult> {
  // API key users don't need refresh
  const apiKey = getApiKeyFromEnv();
  if (apiKey !== null) {
    return { refreshed: false };
  }

  const expiryMs = getTokenExpiry();
  // No expiry info means we can't tell — try a full credential load instead
  if (expiryMs === null) {
    const creds = await getOAuthTokenFromKeychain();
    if (creds !== null) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = creds;
      return { refreshed: true, token: creds };
    }
    return { refreshed: false, error: 'No valid credentials found in keychain' };
  }

  // Token still valid with buffer — no refresh needed
  if (Date.now() + EXPIRY_BUFFER_MS < expiryMs) {
    return { refreshed: false };
  }

  // Token expired or expiring soon — attempt refresh via full Keychain read
  // (getOAuthTokenFromKeychain already handles refresh internally)
  logger.info('Token expired or expiring soon, attempting refresh');
  const refreshedToken = await getOAuthTokenFromKeychain();
  if (refreshedToken !== null) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = refreshedToken;
    logger.info('OAuth token refreshed and env var updated');
    return { refreshed: true, token: refreshedToken };
  }

  logger.warn('OAuth token refresh failed');
  return { refreshed: false, error: 'OAuth token refresh failed' };
}

/**
 * Start a background timer that refreshes the OAuth token before it expires.
 *
 * The timer fires 5 minutes before the token's `expiresAt` timestamp.
 * On success it reschedules for the new token's expiry. On failure it
 * invokes `onFailure` so the caller can surface an auth error to the user.
 *
 * @param onFailure - Called when auto-refresh fails (token cannot be renewed)
 * @returns A cleanup function to cancel the timer
 */
function scheduleAutoRefresh(onFailure: AutoRefreshFailureCallback): () => void {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let periodicId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  /** Periodic fallback interval (5 minutes) to catch cases where setTimeout
   *  fires during system sleep with no network, or the scheduled time is missed
   *  entirely due to timer coalescing after wake. (Code review: Opus cycle 2, issue #6) */
  const PERIODIC_CHECK_MS = 5 * 60_000;

  /** Stop all timers. Called on permanent failure to prevent infinite retry spam. */
  function stopAll(): void {
    stopped = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (periodicId !== null) {
      clearInterval(periodicId);
      periodicId = null;
    }
  }

  function doRefresh(): void {
    if (stopped) return;

    void refreshIfNeeded()
      .then((result) => {
        if (stopped) return;

        if (result.refreshed) {
          logger.info('Auto-refresh succeeded, rescheduling');
          schedule(); // Reschedule for the new token's expiry
        } else if (result.error !== undefined) {
          // Permanent failure (e.g. 400 = revoked/expired refresh token).
          // Stop all timers to prevent infinite retry spam — user must
          // re-authenticate via `claude login` to get a fresh token.
          logger.warn(
            { error: result.error },
            'Auto-refresh permanently failed, stopping retry loop'
          );
          stopAll();
          onFailure(result.error);
        } else {
          // Token still valid — periodic check found nothing to refresh
          logger.debug('Periodic check: token still valid, no refresh needed');
        }
      })
      .catch((err: unknown) => {
        if (stopped) return;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'Auto-refresh threw unexpectedly');
        stopAll();
        onFailure('OAuth auto-refresh error. Please re-authenticate.');
      });
  }

  function schedule(): void {
    if (stopped) return;

    const expiryMs = getTokenExpiry();
    if (expiryMs === null) {
      // No expiry info available — check again in 5 minutes
      logger.debug('No token expiry available, checking again in 5 minutes');
      timerId = setTimeout(schedule, EXPIRY_BUFFER_MS);
      return;
    }

    // Fire 5 minutes before expiry (EXPIRY_BUFFER_MS)
    const delayMs = Math.max(expiryMs - Date.now() - EXPIRY_BUFFER_MS, 0);
    logger.debug(
      { expiryDate: new Date(expiryMs).toISOString(), delayMs },
      'Scheduling auto-refresh'
    );

    timerId = setTimeout(doRefresh, delayMs);
  }

  schedule();

  // Periodic fallback: after system sleep, setTimeout may have already fired
  // with no network. This interval re-checks token expiry every 5 minutes as
  // a safety net. (Code review: Opus cycle 2, issue #6)
  periodicId = setInterval(() => {
    if (stopped) return;

    const expiryMs = getTokenExpiry();
    if (expiryMs !== null && Date.now() + EXPIRY_BUFFER_MS >= expiryMs) {
      logger.info('Periodic check detected expired/expiring token, triggering refresh');
      doRefresh();
    }
  }, PERIODIC_CHECK_MS);

  return stopAll;
}

/**
 * Gets credentials with OAuth-first priority.
 *
 * Returns the actual token value so the caller can pass it explicitly via
 * `CLAUDE_CODE_OAUTH_TOKEN` environment variable rather than relying on
 * the CLI subprocess to read from Keychain.
 *
 * @returns Object with credential info including the token value
 */
async function getCredentials(): Promise<CredentialResult> {
  // Try OAuth token first
  const oauthToken = await getOAuthTokenFromKeychain();

  if (oauthToken !== null) {
    logger.info('OAuth token available from Claude Code Keychain');
    return { type: 'oauth', hasCredentials: true, token: oauthToken };
  }

  // Fall back to API key
  const apiKey = getApiKeyFromEnv();

  if (apiKey !== null) {
    logger.info('API key available from environment');
    return { type: 'apikey', hasCredentials: true, token: apiKey };
  }

  // No credentials found
  logger.error('No credentials found (checked Keychain and .env)');
  return { type: 'apikey', hasCredentials: false };
}

/**
 * ClaudeCredentials - Manages authentication credentials for Claude Agent SDK
 *
 * Priority:
 * 1. OAuth token from macOS Keychain (same as Claude Code CLI)
 * 2. API key from .env file (fallback)
 */
export const ClaudeCredentials = {
  getOAuthTokenFromKeychain,
  getApiKeyFromEnv,
  getCredentials,
  refreshOAuthToken,
  getTokenExpiry,
  refreshIfNeeded,
  scheduleAutoRefresh,
} as const;
