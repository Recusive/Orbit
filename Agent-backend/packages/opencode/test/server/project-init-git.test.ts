import path from "path"

import { afterEach, describe, expect, spyOn, test } from "bun:test"

import { GlobalBus } from "../../src/bus/global"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Snapshot } from "../../src/snapshot"
import { Filesystem } from "../../src/util/filesystem"
import { Log } from "../../src/util/log"
import { resetDatabase } from "../fixture/db"
import { tmpdir } from "../fixture/fixture"

void Log.init({ print: false })

afterEach(async () => {
  await resetDatabase()
})

describe("project.initGit endpoint", () => {
  test("initializes git and reloads immediately", async () => {
    await using tmp = await tmpdir()
    const app = Server.Default()
    const seen: { directory?: string; payload: unknown }[] = []
    const fn = (evt: { directory?: string; payload: unknown }): void => {
      seen.push(evt)
    }
    const reload = (input: Parameters<typeof Instance.reload>[0]): ReturnType<typeof Instance.reload> => Instance.reload(input)
    const reloadSpy = spyOn(Instance, "reload").mockImplementation((input) => reload(input))
    GlobalBus.on("event", fn)

    try {
      const init = await app.request("/project/git/init", {
        method: "POST",
        headers: {
          "x-opencode-directory": tmp.path,
        },
      })
      const body = await init.json()
      expect(init.status).toBe(200)
      expect(body).toMatchObject({
        id: "global",
        vcs: "git",
        worktree: tmp.path,
      })
      expect(reloadSpy).toHaveBeenCalledTimes(1)
      expect(reloadSpy.mock.calls[0]?.[0]?.init).toBe(InstanceBootstrap)
      expect(seen.some((evt) => evt.directory === tmp.path && (evt.payload as { type?: string }).type === "server.instance.disposed")).toBe(
        true,
      )
      expect(Filesystem.exists(path.join(tmp.path, ".git", "opencode"))).toBe(false)

      const current = await app.request("/project/current", {
        headers: {
          "x-opencode-directory": tmp.path,
        },
      })
      expect(current.status).toBe(200)
      expect(await current.json()).toMatchObject({
        id: "global",
        vcs: "git",
        worktree: tmp.path,
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          expect(await Snapshot.track()).toBeTruthy()
        },
      })
    } finally {
      reloadSpy.mockRestore()
      GlobalBus.off("event", fn)
    }
  })

  test("does not reload when the project is already git", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default()
    const seen: { directory?: string; payload: unknown }[] = []
    const fn = (evt: { directory?: string; payload: unknown }): void => {
      seen.push(evt)
    }
    const reload = (input: Parameters<typeof Instance.reload>[0]): ReturnType<typeof Instance.reload> => Instance.reload(input)
    const reloadSpy = spyOn(Instance, "reload").mockImplementation((input) => reload(input))
    GlobalBus.on("event", fn)

    try {
      const init = await app.request("/project/git/init", {
        method: "POST",
        headers: {
          "x-opencode-directory": tmp.path,
        },
      })
      expect(init.status).toBe(200)
      expect(await init.json()).toMatchObject({
        vcs: "git",
        worktree: tmp.path,
      })
      expect(
        seen.filter((evt) => evt.directory === tmp.path && (evt.payload as { type?: string }).type === "server.instance.disposed").length,
      ).toBe(0)
      expect(reloadSpy).toHaveBeenCalledTimes(0)

      const current = await app.request("/project/current", {
        headers: {
          "x-opencode-directory": tmp.path,
        },
      })
      expect(current.status).toBe(200)
      expect(await current.json()).toMatchObject({
        vcs: "git",
        worktree: tmp.path,
      })
    } finally {
      reloadSpy.mockRestore()
      GlobalBus.off("event", fn)
    }
  })
})
