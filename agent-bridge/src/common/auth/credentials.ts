import { spawnSync } from 'child_process';

import { formatZodError } from '@orbit/shared-schemas';

import { KeychainCredentialsSchema } from '../../protocol/schemas.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ClaudeCredentials');

/**
 * Reads OAuth token from macOS Keychain where Claude Code CLI stores credentials
 * @returns OAuth access token if valid and not expired, null otherwise
 */
function getOAuthTokenFromKeychain(): string | null {
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
      // Handle both number (timestamp) and string (may need parsing)
      const expiryMs = typeof expiresAt === 'number' ? expiresAt : parseInt(expiresAt, 10);
      const expiryDate = new Date(expiryMs);
      const now = new Date();

      if (now >= expiryDate) {
        logger.warn({ expiryDate: expiryDate.toISOString() }, 'Claude Code OAuth token expired');
        return null;
      }

      logger.debug({ expiryDate: expiryDate.toISOString() }, 'OAuth token valid');
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
 * Gets credentials with OAuth-first priority
 *
 * Important: When OAuth token is available, environment variables should be cleared
 * to allow the Claude Agent SDK to spawn CLI subprocess that reads from Keychain.
 *
 * @returns Object with credential info: { type: 'oauth' | 'apikey', hasCredentials: boolean }
 */
function getCredentials(): { type: 'oauth' | 'apikey'; hasCredentials: boolean } {
  // Try OAuth token first
  const oauthToken = getOAuthTokenFromKeychain();

  if (oauthToken !== null) {
    logger.info('OAuth token available from Claude Code Keychain');
    return { type: 'oauth', hasCredentials: true };
  }

  // Fall back to API key
  const apiKey = getApiKeyFromEnv();

  if (apiKey !== null) {
    logger.info('API key available from environment');
    return { type: 'apikey', hasCredentials: true };
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
} as const;
