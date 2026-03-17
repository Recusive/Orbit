import { dlopen, ptr } from "bun:ffi"

type Kernel32 = ReturnType<typeof kernel>

const STD_INPUT_HANDLE = -10
const ENABLE_PROCESSED_INPUT = 0x0001

const kernel = (): ReturnType<typeof dlopen<{
  GetStdHandle: { args: ["i32"]; returns: "ptr" }
  GetConsoleMode: { args: ["ptr", "ptr"]; returns: "i32" }
  SetConsoleMode: { args: ["ptr", "u32"]; returns: "i32" }
  FlushConsoleInputBuffer: { args: ["ptr"]; returns: "i32" }
}>> =>
  dlopen("kernel32.dll", {
    GetStdHandle: { args: ["i32"], returns: "ptr" },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
  })

let k32: Kernel32 | undefined

function load(): boolean {
  if (process.platform !== "win32") return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

/**
 * Clear ENABLE_PROCESSED_INPUT on the console stdin handle.
 */
export function win32DisableProcessedInput(): void {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load() || !k32) return

  const handle = k32.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)
  if (k32.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return

  const mode = buf[0]
  if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
  k32.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
}

/**
 * Discard any queued console input (mouse events, key presses, etc.).
 */
export function win32FlushInputBuffer(): void {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load() || !k32) return

  const handle = k32.symbols.GetStdHandle(STD_INPUT_HANDLE)
  k32.symbols.FlushConsoleInputBuffer(handle)
}

let unhook: (() => void) | undefined

/**
 * Keep ENABLE_PROCESSED_INPUT disabled.
 *
 * On Windows, Ctrl+C becomes a CTRL_C_EVENT (instead of stdin input) when
 * ENABLE_PROCESSED_INPUT is set. Various runtimes can re-apply console modes
 * (sometimes on a later tick), and the flag is console-global, not per-process.
 *
 * We combine:
 * - A `setRawMode(...)` hook to re-clear after known raw-mode toggles.
 * - A low-frequency poll as a backstop for native/external mode changes.
 */
export function win32InstallCtrlCGuard(): (() => void) | undefined {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load() || !k32) return
  if (unhook) return unhook

  const k = k32

  // process.stdin in Node doesn't expose setRawMode on the type, but it exists at runtime on TTYs
  const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => unknown }
  const original = stdin.setRawMode

  const handle = k.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)

  if (k.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
  const initial = buf[0]

  const enforce = (): void => {
    if (k.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
    const mode = buf[0]
    if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
    k.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
  }

  // Some runtimes can re-apply console modes on the next tick; enforce twice.
  const later = (): void => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ((mode: boolean) => unknown) | undefined

  if (typeof original === "function") {
    wrapped = (mode: boolean): unknown => {
      const result = original.call(stdin, mode)
      later()
      return result
    }

    stdin.setRawMode = wrapped as typeof stdin.setRawMode
  }

  // Ensure it's cleared immediately too (covers any earlier mode changes).
  later()

  const interval = setInterval(enforce, 100)
  interval.unref()

  let done = false
  unhook = (): void => {
    if (done) return
    done = true

    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) {
      stdin.setRawMode = original
    }

    k.symbols.SetConsoleMode(handle, initial)
    unhook = undefined
  }

  return unhook
}
