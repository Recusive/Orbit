import { existsSync } from "fs"
import path from "path"

import { drizzle } from "drizzle-orm/bun-sqlite"

import { Global } from "../global"
import { ProjectTable } from "../project/project.sql"
import { SessionTable, MessageTable, PartTable, TodoTable, PermissionTable } from "../session/session.sql"
import { SessionShareTable } from "../share/share.sql"
import { Filesystem } from "../util/filesystem"
import { Glob } from "../util/glob"
import { Log } from "../util/log"

import * as schema from "./schema"

import type { Database } from "bun:sqlite"
import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"

interface ProjectJson {
  worktree?: string
  vcs?: string
  name?: string
  icon?: { url?: string; color?: string }
  time?: { created?: number; updated?: number; initialized?: number }
  sandboxes?: unknown[]
  commands?: unknown
}

interface SessionJson {
  parentID?: string
  slug?: string
  directory?: string
  title?: string
  version?: string
  share?: { url?: string }
  summary?: { additions?: number; deletions?: number; files?: unknown; diffs?: unknown }
  revert?: unknown
  permission?: unknown
  time?: { created?: number; updated?: number; compacting?: number; archived?: number }
}

interface MessageJson {
  id?: string
  sessionID?: string
  time?: { created?: number; updated?: number }
  [key: string]: unknown
}

interface PartJson {
  id?: string
  messageID?: string
  sessionID?: string
  time?: { created?: number; updated?: number }
  [key: string]: unknown
}

interface TodoItem {
  content?: string
  status?: string
  priority?: string
}

interface ShareJson {
  id?: string
  secret?: string
  url?: string
}

export namespace JsonMigration {
  const log = Log.create({ service: "json-migration" })

  export interface Progress {
    current: number
    total: number
    label: string
  }

  interface Options {
    progress?: (event: Progress) => void
  }

  export async function run(
    sqlite: Database,
    options?: Options,
  ): Promise<{
    projects: number
    sessions: number
    messages: number
    parts: number
    todos: number
    permissions: number
    shares: number
    errors: string[]
  }> {
    const storageDir = path.join(Global.Path.data, "storage")

    if (!existsSync(storageDir)) {
      log.info("storage directory does not exist, skipping migration")
      return {
        projects: 0,
        sessions: 0,
        messages: 0,
        parts: 0,
        todos: 0,
        permissions: 0,
        shares: 0,
        errors: [] as string[],
      }
    }

    log.info("starting json to sqlite migration", { storageDir })
    const start = performance.now()

    type Schema = typeof schema
    const db: SQLiteBunDatabase<Schema> = drizzle({ client: sqlite, schema })

    // Optimize SQLite for bulk inserts
    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = OFF")
    sqlite.run("PRAGMA cache_size = 10000")
    sqlite.run("PRAGMA temp_store = MEMORY")
    const stats = {
      projects: 0,
      sessions: 0,
      messages: 0,
      parts: 0,
      todos: 0,
      permissions: 0,
      shares: 0,
      errors: [] as string[],
    }
    const orphans = {
      sessions: 0,
      todos: 0,
      permissions: 0,
      shares: 0,
    }
    const errs = stats.errors

    const batchSize = 1000
    const now = Date.now()

    async function list(pattern: string): Promise<string[]> {
      return Glob.scan(pattern, { cwd: storageDir, absolute: true })
    }

    async function read<T>(files: string[], start: number, end: number): Promise<(T | undefined)[]> {
      const count = end - start
      const tasks = new Array<Promise<T>>(count)
      for (let i = 0; i < count; i++) {
        tasks[i] = Filesystem.readJson<T>(files[start + i])
      }
      const results = await Promise.allSettled(tasks)
      const items = new Array<T | undefined>(count)
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === "fulfilled") {
          items[i] = result.value
          continue
        }
        errs.push(`failed to read ${files[start + i]}: ${String(result.reason)}`)
      }
      return items
    }

    function insert(
      values: Record<string, unknown>[],
      table:
        | typeof ProjectTable
        | typeof SessionTable
        | typeof MessageTable
        | typeof PartTable
        | typeof TodoTable
        | typeof PermissionTable
        | typeof SessionShareTable,
      label: string,
    ): number {
      if (values.length === 0) return 0
      try {
        db.insert(table).values(values).onConflictDoNothing().run()
        return values.length
      } catch (e) {
        errs.push(`failed to migrate ${label} batch: ${String(e)}`)
        return 0
      }
    }

    // Pre-scan all files upfront to avoid repeated glob operations
    log.info("scanning files...")
    const [projectFiles, sessionFiles, messageFiles, partFiles, todoFiles, permFiles, shareFiles] = await Promise.all([
      list("project/*.json"),
      list("session/*/*.json"),
      list("message/*/*.json"),
      list("part/*/*.json"),
      list("todo/*.json"),
      list("permission/*.json"),
      list("session_share/*.json"),
    ])

    log.info("file scan complete", {
      projects: projectFiles.length,
      sessions: sessionFiles.length,
      messages: messageFiles.length,
      parts: partFiles.length,
      todos: todoFiles.length,
      permissions: permFiles.length,
      shares: shareFiles.length,
    })

    const total = Math.max(
      1,
      projectFiles.length +
        sessionFiles.length +
        messageFiles.length +
        partFiles.length +
        todoFiles.length +
        permFiles.length +
        shareFiles.length,
    )
    const progress = options?.progress
    let current = 0
    const step = (label: string, count: number): void => {
      current = Math.min(total, current + count)
      progress?.({ current, total, label })
    }

    progress?.({ current, total, label: "starting" })

    sqlite.run("BEGIN TRANSACTION")

    // Migrate projects first (no FK deps)
    // Derive all IDs from file paths, not JSON content
    const projectIds = new Set<string>()
    const projectValues: Record<string, unknown>[] = []
    for (let i = 0; i < projectFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, projectFiles.length)
      const batch = await read<ProjectJson>(projectFiles, i, end)
      projectValues.length = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const id = path.basename(projectFiles[i + j], ".json")
        projectIds.add(id)
        projectValues.push({
          id,
          worktree: data.worktree ?? "/",
          vcs: data.vcs,
          name: data.name ?? undefined,
          icon_url: data.icon?.url,
          icon_color: data.icon?.color,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          time_initialized: data.time?.initialized,
          sandboxes: data.sandboxes ?? [],
          commands: data.commands,
        })
      }
      stats.projects += insert(projectValues, ProjectTable, "project")
      step("projects", end - i)
    }
    log.info("migrated projects", { count: stats.projects, duration: Math.round(performance.now() - start) })

    // Migrate sessions (depends on projects)
    // Derive all IDs from directory/file paths, not JSON content, since earlier
    // migrations may have moved sessions to new directories without updating the JSON
    const sessionProjects = sessionFiles.map((file) => path.basename(path.dirname(file)))
    const sessionIds = new Set<string>()
    const sessionValues: Record<string, unknown>[] = []
    for (let i = 0; i < sessionFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, sessionFiles.length)
      const batch = await read<SessionJson>(sessionFiles, i, end)
      sessionValues.length = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const id = path.basename(sessionFiles[i + j], ".json")
        const projectID = sessionProjects[i + j]
        if (!projectIds.has(projectID)) {
          orphans.sessions++
          continue
        }
        sessionIds.add(id)
        sessionValues.push({
          id,
          project_id: projectID,
          parent_id: data.parentID ?? null,
          slug: data.slug ?? "",
          directory: data.directory ?? "",
          title: data.title ?? "",
          version: data.version ?? "",
          share_url: data.share?.url ?? null,
          summary_additions: data.summary?.additions ?? null,
          summary_deletions: data.summary?.deletions ?? null,
          summary_files: data.summary?.files ?? null,
          summary_diffs: data.summary?.diffs ?? null,
          revert: data.revert ?? null,
          permission: data.permission ?? null,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          time_compacting: data.time?.compacting ?? null,
          time_archived: data.time?.archived ?? null,
        })
      }
      stats.sessions += insert(sessionValues, SessionTable, "session")
      step("sessions", end - i)
    }
    log.info("migrated sessions", { count: stats.sessions })
    if (orphans.sessions > 0) {
      log.warn("skipped orphaned sessions", { count: orphans.sessions })
    }

    // Migrate messages using pre-scanned file map
    const allMessageFiles: string[] = []
    const allMessageSessions: string[] = []
    const messageSessions = new Map<string, string>()
    for (const file of messageFiles) {
      const sessionID = path.basename(path.dirname(file))
      if (!sessionIds.has(sessionID)) continue
      allMessageFiles.push(file)
      allMessageSessions.push(sessionID)
    }

    for (let i = 0; i < allMessageFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, allMessageFiles.length)
      const batch = await read<MessageJson>(allMessageFiles, i, end)
      const values = new Array<Record<string, unknown>>(batch.length)
      let count = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const file = allMessageFiles[i + j]
        const id = path.basename(file, ".json")
        const sessionID = allMessageSessions[i + j]
        messageSessions.set(id, sessionID)
        const rest = { ...data }
        delete rest.id
        delete rest.sessionID
        values[count++] = {
          id,
          session_id: sessionID,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          data: rest,
        }
      }
      values.length = count
      stats.messages += insert(values, MessageTable, "message")
      step("messages", end - i)
    }
    log.info("migrated messages", { count: stats.messages })

    // Migrate parts using pre-scanned file map
    for (let i = 0; i < partFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, partFiles.length)
      const batch = await read<PartJson>(partFiles, i, end)
      const values = new Array<Record<string, unknown>>(batch.length)
      let count = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const file = partFiles[i + j]
        const id = path.basename(file, ".json")
        const messageID = path.basename(path.dirname(file))
        const sessionID = messageSessions.get(messageID)
        if (sessionID === undefined) {
          errs.push(`part missing message session: ${file}`)
          continue
        }
        if (!sessionIds.has(sessionID)) continue
        const rest = { ...data }
        delete rest.id
        delete rest.messageID
        delete rest.sessionID
        values[count++] = {
          id,
          message_id: messageID,
          session_id: sessionID,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          data: rest,
        }
      }
      values.length = count
      stats.parts += insert(values, PartTable, "part")
      step("parts", end - i)
    }
    log.info("migrated parts", { count: stats.parts })

    // Migrate todos
    const todoSessions = todoFiles.map((file) => path.basename(file, ".json"))
    for (let i = 0; i < todoFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, todoFiles.length)
      const batch = await read<unknown>(todoFiles, i, end)
      const values: Record<string, unknown>[] = []
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const sessionID = todoSessions[i + j]
        if (!sessionIds.has(sessionID)) {
          orphans.todos++
          continue
        }
        if (!Array.isArray(data)) {
          errs.push(`todo not an array: ${todoFiles[i + j]}`)
          continue
        }
        for (let position = 0; position < data.length; position++) {
          const todo = data[position] as TodoItem | null | undefined
          if (
            todo === undefined ||
            todo === null ||
            typeof todo.content !== "string" ||
            typeof todo.status !== "string" ||
            typeof todo.priority !== "string"
          )
            continue
          values.push({
            session_id: sessionID,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            position,
            time_created: now,
            time_updated: now,
          })
        }
      }
      stats.todos += insert(values, TodoTable, "todo")
      step("todos", end - i)
    }
    log.info("migrated todos", { count: stats.todos })
    if (orphans.todos > 0) {
      log.warn("skipped orphaned todos", { count: orphans.todos })
    }

    // Migrate permissions
    const permProjects = permFiles.map((file) => path.basename(file, ".json"))
    const permValues: Record<string, unknown>[] = []
    for (let i = 0; i < permFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, permFiles.length)
      const batch = await read<unknown>(permFiles, i, end)
      permValues.length = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const projectID = permProjects[i + j]
        if (!projectIds.has(projectID)) {
          orphans.permissions++
          continue
        }
        permValues.push({ project_id: projectID, data })
      }
      stats.permissions += insert(permValues, PermissionTable, "permission")
      step("permissions", end - i)
    }
    log.info("migrated permissions", { count: stats.permissions })
    if (orphans.permissions > 0) {
      log.warn("skipped orphaned permissions", { count: orphans.permissions })
    }

    // Migrate session shares
    const shareSessions = shareFiles.map((file) => path.basename(file, ".json"))
    const shareValues: Record<string, unknown>[] = []
    for (let i = 0; i < shareFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, shareFiles.length)
      const batch = await read<ShareJson>(shareFiles, i, end)
      shareValues.length = 0
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j]
        if (data === undefined) continue
        const sessionID = shareSessions[i + j]
        if (!sessionIds.has(sessionID)) {
          orphans.shares++
          continue
        }
        if (typeof data.id !== "string" || typeof data.secret !== "string" || typeof data.url !== "string") {
          errs.push(`session_share missing id/secret/url: ${shareFiles[i + j]}`)
          continue
        }
        shareValues.push({ session_id: sessionID, id: data.id, secret: data.secret, url: data.url })
      }
      stats.shares += insert(shareValues, SessionShareTable, "session_share")
      step("shares", end - i)
    }
    log.info("migrated session shares", { count: stats.shares })
    if (orphans.shares > 0) {
      log.warn("skipped orphaned session shares", { count: orphans.shares })
    }

    sqlite.run("COMMIT")

    log.info("json migration complete", {
      projects: stats.projects,
      sessions: stats.sessions,
      messages: stats.messages,
      parts: stats.parts,
      todos: stats.todos,
      permissions: stats.permissions,
      shares: stats.shares,
      errorCount: stats.errors.length,
      duration: Math.round(performance.now() - start),
    })

    if (stats.errors.length > 0) {
      log.warn("migration errors", { errors: stats.errors.slice(0, 20) })
    }

    progress?.({ current: total, total, label: "complete" })

    return stats
  }
}
