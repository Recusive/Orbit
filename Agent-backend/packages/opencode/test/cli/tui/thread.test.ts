import fs from "fs/promises"
import path from "path"

import { describe, expect, mock, test } from "bun:test"

import { tmpdir } from "../../fixture/fixture"

const stop = new Error("stop")
const seen = {
  tui: [] as string[],
  inst: [] as string[],
}

void mock.module("../../../src/cli/cmd/tui/app", () => ({
  tui: (input: { directory: string }) => {
    seen.tui.push(input.directory)
    throw stop
  },
}))

void mock.module("@/util/rpc", () => ({
  Rpc: {
    client: () => ({
      call: () => ({ url: "http://127.0.0.1" }),
      on: () => {
        /* noop */
      },
    }),
  },
}))

void mock.module("@/cli/ui", () => ({
  UI: {
    error: () => {
      /* noop */
    },
  },
}))

void mock.module("@/util/log", () => ({
  Log: {
    init: async () => {
      /* noop */
    },
    create: () => ({
      error: () => {
        /* noop */
      },
      info: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
      debug: () => {
        /* noop */
      },
      time: () => ({
        stop: () => {
          /* noop */
        },
      }),
    }),
    Default: {
      error: () => {
        /* noop */
      },
      info: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
      debug: () => {
        /* noop */
      },
    },
  },
}))

void mock.module("@/util/timeout", () => ({
  withTimeout: <T>(input: Promise<T>) => input,
}))

void mock.module("@/cli/network", () => ({
  withNetworkOptions: <T>(input: T) => input,
  resolveNetworkOptions: () => ({
    mdns: false,
    port: 0,
    hostname: "127.0.0.1",
  }),
}))

void mock.module("../../../src/cli/cmd/tui/win32", () => ({
  win32DisableProcessedInput: () => {
    /* noop */
  },
  win32InstallCtrlCGuard: () => undefined,
}))

void mock.module("@/config/tui", () => ({
  TuiConfig: {
    get: () => ({}),
  },
}))

void mock.module("@/project/instance", () => ({
  Instance: {
    provide: (input: { directory: string; fn: () => unknown }) => {
      seen.inst.push(input.directory)
      return input.fn()
    },
  },
}))

describe("tui thread", () => {
  async function call(project?: string): Promise<void> {
    const { TuiThreadCommand } = await import("../../../src/cli/cmd/tui/thread")
    const args: Parameters<NonNullable<typeof TuiThreadCommand.handler>>[0] = {
      _: [],
      $0: "orbit",
      project,
      prompt: "hi",
      model: undefined,
      agent: undefined,
      session: undefined,
      continue: false,
      fork: false,
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "orbit.local",
      mdnsDomain: "orbit.local",
      cors: [],
    }
    return TuiThreadCommand.handler(args)
  }

  async function check(project?: string): Promise<void> {
    await using tmp = await tmpdir({ git: true })
    const cwd = process.cwd()
    const pwd = process.env.PWD
    const worker = globalThis.Worker
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY")
    const link = path.join(path.dirname(tmp.path), path.basename(tmp.path) + "-link")
    const type = process.platform === "win32" ? "junction" : "dir"
    seen.tui.length = 0
    seen.inst.length = 0
    await fs.symlink(tmp.path, link, type)

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    })
    globalThis.Worker = class extends EventTarget {
      onerror = null
      onmessage = null
      onmessageerror = null
      postMessage(): void {
        /* noop */
      }
      terminate(): void {
        /* noop */
      }
    } as unknown as typeof Worker

    try {
      process.chdir(tmp.path)
      process.env.PWD = link
      await expect(call(project)).rejects.toBe(stop)
      expect(seen.inst[0]).toBe(tmp.path)
      expect(seen.tui[0]).toBe(tmp.path)
    } finally {
      process.chdir(cwd)
      if (pwd === undefined) delete process.env.PWD
      else process.env.PWD = pwd
      if (tty) Object.defineProperty(process.stdin, "isTTY", tty)
      else delete (process.stdin as { isTTY?: boolean }).isTTY
      globalThis.Worker = worker
      await fs.rm(link, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  test("uses the real cwd when PWD points at a symlink", async () => {
    await check()
  })

  test("uses the real cwd after resolving a relative project from PWD", async () => {
    await check(".")
  })
})
