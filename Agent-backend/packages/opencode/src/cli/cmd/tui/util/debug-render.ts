/**
 * Debug render logger — writes to /tmp/tui-render-debug.log
 * Enable with TUI_RENDER_DEBUG=1 environment variable.
 * After running, inspect: cat /tmp/tui-render-debug.log
 */
import { appendFileSync, writeFileSync } from "fs"

const LOG_PATH = "/tmp/tui-render-debug.log"
const ENABLED = process.env.TUI_RENDER_DEBUG === "1"

// Clear on startup
if (ENABLED) {
  writeFileSync(LOG_PATH, `=== TUI Render Debug started at ${new Date().toISOString()} ===\n`)
}

export function debugLog(tag: string, ...args: unknown[]): void {
  if (!ENABLED) return
  const now = performance.now().toFixed(2)
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 0) : String(a))).join(" ")
  appendFileSync(LOG_PATH, `[${now}ms] [${tag}] ${msg}\n`)
}
