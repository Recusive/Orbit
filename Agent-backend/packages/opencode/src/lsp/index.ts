import { spawn } from "child_process"
import path from "path"
import { pathToFileURL, fileURLToPath } from "url"

import z from "zod"

import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Log } from "../util/log"

import { LSPClient } from "./client"
import { LSPServer } from "./server"

import type {
  Hover as VSCodeHover,
  Location as VSCodeLocation,
  DocumentSymbol as VSCodeDocumentSymbol,
  SymbolInformation as VSCodeSymbolInformation,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from "vscode-languageserver-types"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Flag } from "@/flag/flag"

export namespace LSP {
  const log = Log.create({ service: "lsp" })

  export const Event = {
    Updated: BusEvent.define("lsp.updated", z.object({})),
  }

  export const Range = z
    .object({
      start: z.object({
        line: z.number(),
        character: z.number(),
      }),
      end: z.object({
        line: z.number(),
        character: z.number(),
      }),
    })
    .meta({
      ref: "Range",
    })
  export type Range = z.infer<typeof Range>

  export const Symbol = z
    .object({
      name: z.string(),
      kind: z.number(),
      location: z.object({
        uri: z.string(),
        range: Range,
      }),
    })
    .meta({
      ref: "Symbol",
    })
  export type Symbol = z.infer<typeof Symbol>

  export const DocumentSymbol = z
    .object({
      name: z.string(),
      detail: z.string().optional(),
      kind: z.number(),
      range: Range,
      selectionRange: Range,
    })
    .meta({
      ref: "DocumentSymbol",
    })
  export type DocumentSymbol = z.infer<typeof DocumentSymbol>

  function removeServerKey(servers: Record<string, LSPServer.Info>, key: string): void {
    // Mutate by deleting the key — avoids `delete` on computed property
    // and avoids destructuring which creates unused variables.
    const entries = Object.entries(servers)
    for (const k of Object.keys(servers)) {
      // Clear all keys first
      Object.defineProperty(servers, k, { value: undefined, configurable: true, enumerable: false })
    }
    for (const [k, v] of entries) {
      if (k !== key) {
        servers[k] = v
      }
    }
  }

  const filterExperimentalServers = (servers: Record<string, LSPServer.Info>): void => {
    if (Flag.OPENCODE_EXPERIMENTAL_LSP_TY) {
      // If experimental flag is enabled, disable pyright
      if ("pyright" in servers) {
        log.info("LSP server pyright is disabled because OPENCODE_EXPERIMENTAL_LSP_TY is enabled")
        removeServerKey(servers, "pyright")
      }
    } else {
      // If experimental flag is disabled, disable ty
      if ("ty" in servers) {
        removeServerKey(servers, "ty")
      }
    }
  }

  interface LSPState {
    broken: Set<string>
    servers: Record<string, LSPServer.Info>
    clients: LSPClient.Info[]
    spawning: Map<string, Promise<LSPClient.Info | undefined>>
  }

  const state = Instance.state(
    async (): Promise<LSPState> => {
      const clients: LSPClient.Info[] = []
      const servers: Record<string, LSPServer.Info> = {}
      const cfg = await Config.get()

      if (cfg.lsp === false) {
        log.info("all LSPs are disabled")
        return {
          broken: new Set<string>(),
          servers,
          clients,
          spawning: new Map<string, Promise<LSPClient.Info | undefined>>(),
        }
      }

      for (const server of Object.values(LSPServer)) {
        servers[server.id] = server
      }

      filterExperimentalServers(servers)

      for (const [name, item] of Object.entries(cfg.lsp ?? {})) {
        const existing = servers[name] as LSPServer.Info | undefined
        if (item.disabled) {
          log.info(`LSP server ${name} is disabled`)
          removeServerKey(servers, name)
          continue
        }
        servers[name] = {
          ...existing,
          id: name,
          root: existing?.root ?? (() => Promise.resolve(Instance.directory)),
          extensions: item.extensions ?? existing?.extensions ?? [],
          spawn: (root: string) => {
            return Promise.resolve({
              process: spawn(item.command[0], item.command.slice(1), {
                cwd: root,
                env: {
                  ...process.env,
                  ...item.env,
                },
              }),
              initialization: item.initialization,
            })
          },
        }
      }

      log.info("enabled LSP servers", {
        serverIds: Object.values(servers)
          .map((server) => server.id)
          .join(", "),
      })

      return {
        broken: new Set<string>(),
        servers,
        clients,
        spawning: new Map<string, Promise<LSPClient.Info | undefined>>(),
      }
    },
    (s: LSPState) => {
      s.clients.forEach((client) => {
        client.shutdown()
      })
      return Promise.resolve()
    },
  )

  export async function init(): Promise<LSPState> {
    return state()
  }

  export const Status = z
    .object({
      id: z.string(),
      name: z.string(),
      root: z.string(),
      status: z.union([z.literal("connected"), z.literal("error")]),
    })
    .meta({
      ref: "LSPStatus",
    })
  export type Status = z.infer<typeof Status>

  export async function status(): Promise<Status[]> {
    return state().then((x) => {
      const result: Status[] = []
      for (const client of x.clients) {
        result.push({
          id: client.serverID,
          name: x.servers[client.serverID].id,
          root: path.relative(Instance.directory, client.root),
          status: "connected",
        })
      }
      return result
    })
  }

  async function getClients(file: string): Promise<LSPClient.Info[]> {
    const s = await state()
    const extension = path.parse(file).ext || file
    const result: LSPClient.Info[] = []

    async function schedule(server: LSPServer.Info, root: string, key: string): Promise<LSPClient.Info | undefined> {
      const handle = await server
        .spawn(root)
        .then((value) => {
          if (!value) s.broken.add(key)
          return value
        })
        .catch((err: unknown) => {
          s.broken.add(key)
          log.error(`Failed to spawn LSP server ${server.id}`, { error: err })
          return undefined
        })

      if (!handle) return undefined
      log.info("spawned lsp server", { serverID: server.id })

      const client = await LSPClient.create({
        serverID: server.id,
        server: handle,
        root,
      }).catch((err: unknown) => {
        s.broken.add(key)
        handle.process.kill()
        log.error(`Failed to initialize LSP client ${server.id}`, { error: err })
        return undefined
      })

      if (!client) {
        handle.process.kill()
        return undefined
      }

      const existing = s.clients.find((x) => x.root === root && x.serverID === server.id)
      if (existing) {
        handle.process.kill()
        return existing
      }

      s.clients.push(client)
      return client
    }

    for (const server of Object.values(s.servers)) {
      if (server.extensions.length > 0 && !server.extensions.includes(extension)) continue

      const root = await server.root(file)
      if (!root) continue
      if (s.broken.has(root + server.id)) continue

      const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
      if (match) {
        result.push(match)
        continue
      }

      const inflight = s.spawning.get(root + server.id)
      if (inflight) {
        const client = await inflight
        if (!client) continue
        result.push(client)
        continue
      }

      const task = schedule(server, root, root + server.id)
      s.spawning.set(root + server.id, task)

      void task.finally(() => {
        if (s.spawning.get(root + server.id) === task) {
          s.spawning.delete(root + server.id)
        }
      })

      const client = await task
      if (!client) continue

      result.push(client)
      void Bus.publish(Event.Updated, {})
    }

    return result
  }

  export async function hasClients(file: string): Promise<boolean> {
    const s = await state()
    const extension = path.parse(file).ext || file
    for (const server of Object.values(s.servers)) {
      if (server.extensions.length > 0 && !server.extensions.includes(extension)) continue
      const root = await server.root(file)
      if (!root) continue
      if (s.broken.has(root + server.id)) continue
      return true
    }
    return false
  }

  export async function touchFile(input: string, waitForDiagnostics?: boolean): Promise<void> {
    log.info("touching file", { file: input })
    const clients = await getClients(input)
    await Promise.all(
      clients.map(async (client) => {
        const wait = waitForDiagnostics === true ? client.waitForDiagnostics({ path: input }) : Promise.resolve()
        await client.notify.open({ path: input })
        return wait
      }),
    ).catch((err: unknown) => {
      log.error("failed to touch file", { err, file: input })
    })
  }

  export async function diagnostics(): Promise<Record<string, LSPClient.Diagnostic[]>> {
    const results: Record<string, LSPClient.Diagnostic[]> = {}
    for (const clientDiags of await runAll((client) => Promise.resolve(client.diagnostics))) {
      for (const [filePath, diags] of clientDiags.entries()) {
        const arr = results[filePath] ?? []
        arr.push(...diags)
        results[filePath] = arr
      }
    }
    return results
  }

  export async function hover(input: {
    file: string
    line: number
    character: number
  }): Promise<(VSCodeHover | null)[]> {
    return run(input.file, (client) => {
      return client.connection
        .sendRequest("textDocument/hover", {
          textDocument: {
            uri: pathToFileURL(input.file).href,
          },
          position: {
            line: input.line,
            character: input.character,
          },
        })
        .then((r) => r as VSCodeHover | null)
        .catch(() => null)
    })
  }

  enum SymbolKind {
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    Field = 8,
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    String = 15,
    Number = 16,
    Boolean = 17,
    Array = 18,
    Object = 19,
    Key = 20,
    Null = 21,
    EnumMember = 22,
    Struct = 23,
    Event = 24,
    Operator = 25,
    TypeParameter = 26,
  }

  const kinds = [
    SymbolKind.Class,
    SymbolKind.Function,
    SymbolKind.Method,
    SymbolKind.Interface,
    SymbolKind.Variable,
    SymbolKind.Constant,
    SymbolKind.Struct,
    SymbolKind.Enum,
  ]

  export async function workspaceSymbol(query: string): Promise<LSP.Symbol[]> {
    return runAll((client) =>
      client.connection
        .sendRequest("workspace/symbol", {
          query,
        })
        .then((r) => {
          const symbols = r as VSCodeSymbolInformation[]
          return symbols.filter((x) => kinds.includes(x.kind))
        })
        .then((filtered) => filtered.slice(0, 10) as LSP.Symbol[])
        .catch(() => [] as LSP.Symbol[]),
    ).then((r) => r.flat())
  }

  export async function documentSymbol(uri: string): Promise<(LSP.DocumentSymbol | LSP.Symbol)[]> {
    const file = fileURLToPath(uri)
    return run(file, (client) =>
      client.connection
        .sendRequest("textDocument/documentSymbol", {
          textDocument: {
            uri,
          },
        })
        .then((r) => r as (VSCodeDocumentSymbol | VSCodeSymbolInformation)[])
        .catch(() => [] as (VSCodeDocumentSymbol | VSCodeSymbolInformation)[]),
    )
      .then((r) => r.flat() as (LSP.DocumentSymbol | LSP.Symbol)[])
      .then((r) => r.filter(Boolean))
  }

  export async function definition(input: {
    file: string
    line: number
    character: number
  }): Promise<VSCodeLocation[]> {
    return run(input.file, (client) =>
      client.connection
        .sendRequest("textDocument/definition", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
        })
        .then((r) => r as VSCodeLocation | VSCodeLocation[] | null)
        .catch(() => null),
    ).then((r) => r.flat().filter((item): item is VSCodeLocation => item !== null))
  }

  export async function references(input: {
    file: string
    line: number
    character: number
  }): Promise<VSCodeLocation[]> {
    return run(input.file, (client) =>
      client.connection
        .sendRequest("textDocument/references", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
          context: { includeDeclaration: true },
        })
        .then((r) => r as VSCodeLocation[])
        .catch(() => [] as VSCodeLocation[]),
    ).then((r) => r.flat())
  }

  export async function implementation(input: {
    file: string
    line: number
    character: number
  }): Promise<VSCodeLocation[]> {
    return run(input.file, (client) =>
      client.connection
        .sendRequest("textDocument/implementation", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
        })
        .then((r) => r as VSCodeLocation | VSCodeLocation[] | null)
        .catch(() => null),
    ).then((r) => r.flat().filter((item): item is VSCodeLocation => item !== null))
  }

  export async function prepareCallHierarchy(input: {
    file: string
    line: number
    character: number
  }): Promise<CallHierarchyItem[]> {
    return run(input.file, (client) =>
      client.connection
        .sendRequest("textDocument/prepareCallHierarchy", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
        })
        .then((r) => r as CallHierarchyItem[])
        .catch(() => [] as CallHierarchyItem[]),
    ).then((r) => r.flat())
  }

  export async function incomingCalls(input: {
    file: string
    line: number
    character: number
  }): Promise<CallHierarchyIncomingCall[]> {
    return run(input.file, async (client) => {
      const items = await client.connection
        .sendRequest("textDocument/prepareCallHierarchy", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
        })
        .then((r) => r as CallHierarchyItem[])
        .catch(() => [] as CallHierarchyItem[])
      if (items.length === 0) return [] as CallHierarchyIncomingCall[]
      return client.connection
        .sendRequest("callHierarchy/incomingCalls", { item: items[0] })
        .then((r) => r as CallHierarchyIncomingCall[])
        .catch(() => [] as CallHierarchyIncomingCall[])
    }).then((r) => r.flat())
  }

  export async function outgoingCalls(input: {
    file: string
    line: number
    character: number
  }): Promise<CallHierarchyOutgoingCall[]> {
    return run(input.file, async (client) => {
      const items = await client.connection
        .sendRequest("textDocument/prepareCallHierarchy", {
          textDocument: { uri: pathToFileURL(input.file).href },
          position: { line: input.line, character: input.character },
        })
        .then((r) => r as CallHierarchyItem[])
        .catch(() => [] as CallHierarchyItem[])
      if (items.length === 0) return [] as CallHierarchyOutgoingCall[]
      return client.connection
        .sendRequest("callHierarchy/outgoingCalls", { item: items[0] })
        .then((r) => r as CallHierarchyOutgoingCall[])
        .catch(() => [] as CallHierarchyOutgoingCall[])
    }).then((r) => r.flat())
  }

  async function runAll<T>(input: (client: LSPClient.Info) => Promise<T>): Promise<T[]> {
    const clients = await state().then((x) => x.clients)
    const tasks = clients.map((x) => input(x))
    return Promise.all(tasks)
  }

  async function run<T>(file: string, input: (client: LSPClient.Info) => Promise<T>): Promise<T[]> {
    const clients = await getClients(file)
    const tasks = clients.map((x) => input(x))
    return Promise.all(tasks)
  }

  export namespace Diagnostic {
    export function pretty(diagnostic: LSPClient.Diagnostic): string {
      const severityMap: Record<number, string> = {
        1: "ERROR",
        2: "WARN",
        3: "INFO",
        4: "HINT",
      }

      const severityKey = diagnostic.severity ?? 1
      const severity = severityMap[severityKey]
      const line = diagnostic.range.start.line + 1
      const col = diagnostic.range.start.character + 1

      return `${severity} [${String(line)}:${String(col)}] ${diagnostic.message}`
    }
  }
}
