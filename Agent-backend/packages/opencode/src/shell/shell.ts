import { spawn  } from "child_process"
import { setTimeout as sleep } from "node:timers/promises"
import path from "path"

import type {ChildProcess} from "child_process";

import { Flag } from "@/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { lazy } from "@/util/lazy"
import { which } from "@/util/which"


const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (pid === undefined || (opts?.exited?.() === true)) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => { resolve() })
        killer.once("error", () => { resolve() })
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await sleep(SIGKILL_TIMEOUT_MS)
      if (opts?.exited?.() !== true) {
        process.kill(-pid, "SIGKILL")
      }
    } catch {
      proc.kill("SIGTERM")
      await sleep(SIGKILL_TIMEOUT_MS)
      if (opts?.exited?.() !== true) {
        proc.kill("SIGKILL")
      }
    }
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function fallback(): string {
    if (process.platform === "win32") {
      if (Flag.OPENCODE_GIT_BASH_PATH) return Flag.OPENCODE_GIT_BASH_PATH
      const gitPath = which("git")
      if (gitPath !== null) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(gitPath, "..", "..", "bin", "bash.exe")
        if ((Filesystem.stat(bash)?.size ?? 0) > 0) return bash
      }
      return process.env.COMSPEC ?? "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = which("bash")
    if (bash !== null) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s !== undefined && s !== "") return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s !== undefined && s !== "" && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) return s
    return fallback()
  })
}
