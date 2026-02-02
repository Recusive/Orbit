import { spawnSync } from 'child_process';

import { createLogger } from '../logging/logger.js';

const logger = createLogger('ShellEnv');

/** Cached shell environment (populated on first call) */
let cachedEnv: Record<string, string> | null = null;

/**
 * Capture the user's interactive login shell environment.
 *
 * Spawns `$SHELL -ilc 'env'` to get the full set of environment variables
 * that the user would have in a terminal session. This is critical for
 * Tauri apps launched from Finder/Dock, which don't inherit the user's
 * shell PATH and therefore can't find tools like `bun`, `npm`, `node`, etc.
 *
 * Results are cached after the first successful call.
 *
 * @returns A record of environment variables from the login shell,
 *          or `process.env` as fallback if shell capture fails.
 */
export function getShellEnvironment(): Record<string, string> {
  if (cachedEnv !== null) {
    return cachedEnv;
  }

  const shell = process.env.SHELL ?? '/bin/zsh';
  logger.debug({ shell }, 'Capturing shell environment');

  try {
    const result = spawnSync(shell, ['-ilc', 'env'], {
      encoding: 'utf-8',
      timeout: 5_000, // 5-second timeout
      env: {
        // Pass minimal env to avoid inheriting stale values
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: shell,
        TERM: 'xterm-256color',
        // LC_ALL ensures consistent output parsing
        LC_ALL: 'en_US.UTF-8',
      },
    });

    if (result.error) {
      logger.warn({ error: result.error.message }, 'Failed to spawn shell for env capture');
      return buildFallbackEnv();
    }

    if (result.status !== 0) {
      logger.warn(
        { status: result.status, stderr: result.stderr.trim() },
        'Shell env capture exited with non-zero status'
      );
      // Still try to parse stdout — many shells exit non-zero on -i but still output env
    }

    const output = result.stdout;
    if (output === '') {
      logger.warn('Shell env capture returned empty output');
      return buildFallbackEnv();
    }

    const env: Record<string, string> = {};
    for (const line of output.split('\n')) {
      // env output is KEY=VALUE (value may contain = signs)
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        const value = line.substring(eqIndex + 1);
        // Skip shell internal variables (start with _ or contain special chars)
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          env[key] = value;
        }
      }
    }

    const envKeyCount = Object.keys(env).length;
    if (envKeyCount === 0) {
      logger.warn('Shell env capture parsed 0 variables');
      return buildFallbackEnv();
    }

    logger.info(
      { envKeyCount, pathLength: env.PATH?.length ?? 0 },
      'Shell environment captured successfully'
    );

    cachedEnv = env;
    return env;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Unexpected error capturing shell environment');
    return buildFallbackEnv();
  }
}

/**
 * Build a fallback environment from `process.env` with common PATH additions.
 * Used when shell environment capture fails.
 */
function buildFallbackEnv(): Record<string, string> {
  logger.info('Using fallback environment (process.env + common paths)');

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Augment PATH with common tool locations
  const homeDir = process.env.HOME ?? '';
  const currentPath = env.PATH ?? '';
  const additionalPaths = [
    `${homeDir}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    `${homeDir}/.bun/bin`,
  ].filter((p) => !currentPath.includes(p));

  if (additionalPaths.length > 0) {
    env.PATH = [...additionalPaths, currentPath].join(':');
  }

  cachedEnv = env;
  return env;
}

/**
 * Clear the cached shell environment.
 * Useful for testing or when the user's shell config changes.
 */
export function clearShellEnvironmentCache(): void {
  cachedEnv = null;
}
