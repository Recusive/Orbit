import { spawnSync } from 'child_process';

import { formatZodError } from '@orbit/shared-schemas';

import { KeychainCredentialsSchema, OAuthRefreshResponseSchema } from '../../protocol/schemas.js';
import { createLogger } from '../logging/logger.js';

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
 * Reads OAuth token from macOS Keychain where Claude Code CLI stores credentials.
 *
 * When the token is expired but a refresh token is available, attempts an
 * automatic refresh before returning null.
 *
 * @returns OAuth access token if valid and not expired, null otherwise
 */
async function getOAuthTokenFromKeychain(): Promise<string | null> {
  try {
    // Use spawnSync for better error capture than execSync
    const spawnResult = spawnSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      {
        encoding: 'utf-8',
        timeout: 10000, // 10 second timeout
      }
    );

    if (spawnResult.error) {
      logger.error({ error: spawnResult.error.message }, 'Failed to spawn security command');
      return null;
    }

    if (spawnResult.status !== 0) {
      logger.warn(
        { status: spawnResult.status, stderr: spawnResult.stderr.trim() },
        'Security command failed'
      );
      return null;
    }

    const output = spawnResult.stdout.trim();

    // Parse and validate the JSON credentials structure with Zod
    const json: unknown = JSON.parse(output);
    const parseResult = KeychainCredentialsSchema.safeParse(json);
    if (!parseResult.success) {
      logger.debug(
        { error: formatZodError(parseResult.error) },
        'Invalid credentials structure in Keychain'
      );
      return null;
    }

    const claudeAuth = parseResult.data.claudeAiOauth;
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
} as const;
