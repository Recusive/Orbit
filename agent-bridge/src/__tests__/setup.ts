/**
 * Bun test preload — runs before any test file.
 *
 * Clears the CLAUDECODE env var so the SDK can spawn CLI subprocesses
 * without hitting the "cannot be launched inside another Claude Code session" guard.
 * This only matters when running `bun test` from inside a Claude Code session.
 */
delete process.env.CLAUDECODE;
