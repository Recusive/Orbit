import { existsSync } from "fs"
import path from "path"

import { fn } from "@opencode-ai/util/fn"
import z from "zod"

import { SessionTable } from "../session/session.sql"
import { Database, eq } from "../storage/db"
import { Filesystem } from "../util/filesystem"
import { git } from "../util/git"
import { Glob } from "../util/glob"
import { Log } from "../util/log"
import { work } from "../util/queue"
import { which } from "../util/which"

import { ProjectTable } from "./project.sql"

import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { Flag } from "@/flag/flag"
import { iife } from "@/util/iife"

export namespace Project {
  const log = Log.create({ service: "project" })

  function gitpath(cwd: string, name: string): string {
    if (!name) return cwd
    // git output includes trailing newlines; keep path whitespace intact.
    name = name.replace(/[\r\n]+$/, "")
    if (!name) return cwd

    name = Filesystem.windowsPath(name)

    if (path.isAbsolute(name)) return path.normalize(name)
    return path.resolve(cwd, name)
  }

  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      icon: z
        .object({
          url: z.string().optional(),
          override: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      commands: z
        .object({
          start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }

  type Row = typeof ProjectTable.$inferSelect

  export function fromRow(row: Row): Info {
    const icon =
      row.icon_url ?? row.icon_color
        ? { url: row.icon_url ?? undefined, color: row.icon_color ?? undefined }
        : undefined
    return {
      id: row.id,
      worktree: row.worktree,
      vcs: row.vcs ? Info.shape.vcs.parse(row.vcs) : undefined,
      name: row.name ?? undefined,
      icon,
      time: {
        created: row.time_created,
        updated: row.time_updated,
        initialized: row.time_initialized ?? undefined,
      },
      sandboxes: row.sandboxes,
      commands: row.commands ?? undefined,
    }
  }

  export async function fromDirectory(directory: string): Promise<{ project: Info; sandbox: string }> {
    log.info("fromDirectory", { directory })

    const data = await iife(async () => {
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      const first = matches.next()
      matches.return(undefined as never)
      const dotgit = first.done === true ? undefined : first.value
      if (dotgit !== undefined) {
        let sandbox = path.dirname(dotgit)

        const gitBinary = which("git")

        // cached id calculation
        let id = await Filesystem.readText(path.join(dotgit, "opencode"))
          .then((x) => x.trim())
          .catch(() => undefined)

        if (!gitBinary) {
          return {
            id: id ?? "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        // generate id from root commit
        if (!id) {
          const roots = await git(["rev-list", "--max-parents=0", "--all"], {
            cwd: sandbox,
          })
            .then((result) =>
              result
                .text()
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
            .catch(() => undefined)

          if (!roots) {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
            }
          }

          id = roots[0] as string | undefined
          if (id !== undefined) {
            await Filesystem.write(path.join(dotgit, "opencode"), id).catch(() => undefined)
          }
        }

        if (!id) {
          return {
            id: "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: "git",
          }
        }

        const top = await git(["rev-parse", "--show-toplevel"], {
          cwd: sandbox,
        })
          .then((result) => gitpath(sandbox, result.text()))
          .catch(() => undefined)

        if (!top) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        sandbox = top

        const worktree = await git(["rev-parse", "--git-common-dir"], {
          cwd: sandbox,
        })
          .then((result) => {
            const common = gitpath(sandbox, result.text())
            // Avoid going to parent of sandbox when git-common-dir is empty.
            return common === sandbox ? sandbox : path.dirname(common)
          })
          .catch(() => undefined)

        if (!worktree) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    })

    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, data.id)).get())
    const existing = await iife(async () => {
      if (row) return fromRow(row)
      const fresh: Info = {
        id: data.id,
        worktree: data.worktree,
        vcs: data.vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      if (data.id !== "global") {
        await migrateFromGlobal(data.id, data.worktree)
      }
      return fresh
    })

    if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) void discover(existing)

    const result: Info = {
      ...existing,
      worktree: data.worktree,
      vcs: data.vcs as Info["vcs"],
      time: {
        ...existing.time,
        updated: Date.now(),
      },
    }
    if (data.sandbox !== result.worktree && !result.sandboxes.includes(data.sandbox))
      result.sandboxes.push(data.sandbox)
    result.sandboxes = result.sandboxes.filter((x) => existsSync(x))
    const insert = {
      id: result.id,
      worktree: result.worktree,
      vcs: result.vcs ?? null,
      name: result.name,
      icon_url: result.icon?.url,
      icon_color: result.icon?.color,
      time_created: result.time.created,
      time_updated: result.time.updated,
      time_initialized: result.time.initialized,
      sandboxes: result.sandboxes,
      commands: result.commands,
    }
    const updateSet = {
      worktree: result.worktree,
      vcs: result.vcs ?? null,
      name: result.name,
      icon_url: result.icon?.url,
      icon_color: result.icon?.color,
      time_updated: result.time.updated,
      time_initialized: result.time.initialized,
      sandboxes: result.sandboxes,
      commands: result.commands,
    }
    Database.use((db) => {
      db.insert(ProjectTable).values(insert).onConflictDoUpdate({ target: ProjectTable.id, set: updateSet }).run()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return { project: result, sandbox: data.sandbox }
  }

  export async function discover(input: Info): Promise<void> {
    if (input.vcs !== "git") return
    if (input.icon?.override) return
    if (input.icon?.url) return
    const matches = await Glob.scan("**/favicon.{ico,png,svg,jpg,jpeg,webp}", {
      cwd: input.worktree,
      absolute: true,
      include: "file",
    })
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return
    const buffer = await Filesystem.readBytes(shortest)
    const base64 = buffer.toString("base64")
    const mime = Filesystem.mimeType(shortest) || "image/png"
    const url = `data:${mime};base64,${base64}`
    update({
      projectID: input.id,
      icon: {
        url,
      },
    })
  }

  async function migrateFromGlobal(id: string, worktree: string): Promise<void> {
    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, "global")).get())
    if (!row) return

    const sessions = Database.use((db) =>
      db.select().from(SessionTable).where(eq(SessionTable.project_id, "global")).all(),
    )
    if (sessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID: id, worktree, count: sessions.length })

    await work(10, sessions, (row) => {
      // Skip sessions that belong to a different directory
      if (row.directory && row.directory !== worktree) return Promise.resolve()

      log.info("migrating session", { sessionID: row.id, from: "global", to: id })
      Database.use((db) => {
        db.update(SessionTable).set({ project_id: id }).where(eq(SessionTable.id, row.id)).run()
      })
      return Promise.resolve()
    }).catch((error: unknown) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: id })
    })
  }

  export function setInitialized(id: string): void {
    Database.use((db) => {
      db.update(ProjectTable)
        .set({
          time_initialized: Date.now(),
        })
        .where(eq(ProjectTable.id, id))
        .run()
    })
  }

  export function list(): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(ProjectTable)
        .all()
        .map((row) => fromRow(row)),
    )
  }

  export function get(id: string): Info | undefined {
    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get())
    if (!row) return undefined
    return fromRow(row)
  }

  export async function initGit(input: { directory: string; project: Info }): Promise<Info> {
    if (input.project.vcs === "git") return input.project
    if (!which("git")) throw new Error("Git is not installed")

    const result = await git(["init", "--quiet"], {
      cwd: input.directory,
    })
    if (result.exitCode !== 0) {
      const text = result.stderr.toString().trim() || result.text().trim()
      throw new Error(text || "Failed to initialize git repository")
    }

    return (await fromDirectory(input.directory)).project
  }

  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
      commands: Info.shape.commands.optional(),
    }),
    (input) => {
      const result = Database.use((db) =>
        db
          .update(ProjectTable)
          .set({
            name: input.name,
            icon_url: input.icon?.url,
            icon_color: input.icon?.color,
            commands: input.commands,
            time_updated: Date.now(),
          })
          .where(eq(ProjectTable.id, input.projectID))
          .returning()
          .get(),
      )
      const data = fromRow(result)
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: data,
        },
      })
      return data
    },
  )

  export function sandboxes(id: string): string[] {
    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get())
    if (!row) return []
    const data = fromRow(row)
    const valid: string[] = []
    for (const dir of data.sandboxes) {
      const s = Filesystem.stat(dir)
      if (s?.isDirectory()) valid.push(dir)
    }
    return valid
  }

  export function addSandbox(id: string, directory: string): Info {
    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get())
    if (!row) throw new Error(`Project not found: ${id}`)
    const sandboxList = [...row.sandboxes]
    if (!sandboxList.includes(directory)) sandboxList.push(directory)
    const result = Database.use((db) =>
      db
        .update(ProjectTable)
        .set({ sandboxes: sandboxList, time_updated: Date.now() })
        .where(eq(ProjectTable.id, id))
        .returning()
        .get(),
    )
    const data = fromRow(result)
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: data,
      },
    })
    return data
  }

  export function removeSandbox(id: string, directory: string): Info {
    const row = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get())
    if (!row) throw new Error(`Project not found: ${id}`)
    const sandboxList = row.sandboxes.filter((s) => s !== directory)
    const result = Database.use((db) =>
      db
        .update(ProjectTable)
        .set({ sandboxes: sandboxList, time_updated: Date.now() })
        .where(eq(ProjectTable.id, id))
        .returning()
        .get(),
    )
    const data = fromRow(result)
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: data,
      },
    })
    return data
  }
}
