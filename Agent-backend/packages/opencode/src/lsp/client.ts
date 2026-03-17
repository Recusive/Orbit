import path from "path"
import { pathToFileURL, fileURLToPath } from "url"

import { NamedError } from "@opencode-ai/util/error"
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node"
import z from "zod"

import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"
import { withTimeout } from "../util/timeout"

import { LANGUAGE_EXTENSIONS } from "./language"

import type { LSPServer } from "./server"
import type { MessageConnection } from "vscode-jsonrpc/node"
import type { Diagnostic as VSCodeDiagnostic } from "vscode-languageserver-types"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"

const DIAGNOSTICS_DEBOUNCE_MS = 150

interface PublishDiagnosticsParams {
  uri: string
  diagnostics: VSCodeDiagnostic[]
}

export namespace LSPClient {
  const log = Log.create({ service: "lsp.client" })

  export type Diagnostic = VSCodeDiagnostic

  export interface Info {
    root: string
    readonly serverID: string
    readonly connection: MessageConnection
    notify: {
      open(input: { path: string }): Promise<void>
    }
    readonly diagnostics: Map<string, Diagnostic[]>
    waitForDiagnostics(input: { path: string }): Promise<void>
    shutdown(): void
  }

  export const InitializeError = NamedError.create(
    "LSPInitializeError",
    z.object({
      serverID: z.string(),
    }),
  )

  export const Event = {
    Diagnostics: BusEvent.define(
      "lsp.client.diagnostics",
      z.object({
        serverID: z.string(),
        path: z.string(),
      }),
    ),
  }

  export async function create(input: {
    serverID: string
    server: LSPServer.Handle
    root: string
  }): Promise<Info | undefined> {
    const l = log.clone().tag("serverID", input.serverID)
    l.info("starting client")

    const connection = createMessageConnection(
      new StreamMessageReader(input.server.process.stdout as NodeJS.ReadableStream),
      new StreamMessageWriter(input.server.process.stdin as NodeJS.WritableStream),
    )

    const diagnosticsMap = new Map<string, Diagnostic[]>()
    connection.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
      const filePath = Filesystem.normalizePath(fileURLToPath(params.uri))
      l.info("textDocument/publishDiagnostics", {
        path: filePath,
        count: params.diagnostics.length,
      })
      const exists = diagnosticsMap.has(filePath)
      diagnosticsMap.set(filePath, params.diagnostics)
      if (!exists && input.serverID === "typescript") return
      void Bus.publish(Event.Diagnostics, { path: filePath, serverID: input.serverID })
    })
    connection.onRequest("window/workDoneProgress/create", (params: Record<string, unknown>) => {
      l.info("window/workDoneProgress/create", params)
      return null
    })
    connection.onRequest("workspace/configuration", () => {
      // Return server initialization options
      return [input.server.initialization ?? {}]
    })
    connection.onRequest("client/registerCapability", () => Promise.resolve())
    connection.onRequest("client/unregisterCapability", () => Promise.resolve())
    connection.onRequest("workspace/workspaceFolders", () => [
      {
        name: "workspace",
        uri: pathToFileURL(input.root).href,
      },
    ])
    connection.listen()

    l.info("sending initialize")
    await withTimeout(
      connection.sendRequest("initialize", {
        rootUri: pathToFileURL(input.root).href,
        processId: input.server.process.pid,
        workspaceFolders: [
          {
            name: "workspace",
            uri: pathToFileURL(input.root).href,
          },
        ],
        initializationOptions: {
          ...input.server.initialization,
        },
        capabilities: {
          window: {
            workDoneProgress: true,
          },
          workspace: {
            configuration: true,
            didChangeWatchedFiles: {
              dynamicRegistration: true,
            },
          },
          textDocument: {
            synchronization: {
              didOpen: true,
              didChange: true,
            },
            publishDiagnostics: {
              versionSupport: true,
            },
          },
        },
      }),
      45_000,
    ).catch((err: unknown) => {
      l.error("initialize error", { error: err })
      throw new InitializeError(
        { serverID: input.serverID },
        {
          cause: err,
        },
      )
    })

    await connection.sendNotification("initialized", {})

    if (input.server.initialization) {
      await connection.sendNotification("workspace/didChangeConfiguration", {
        settings: input.server.initialization,
      })
    }

    const files: Record<string, number> = {}

    const result: Info = {
      root: input.root,
      get serverID(): string {
        return input.serverID
      },
      get connection() {
        return connection
      },
      notify: {
        async open(openInput: { path: string }): Promise<void> {
          openInput.path = path.isAbsolute(openInput.path)
            ? openInput.path
            : path.resolve(Instance.directory, openInput.path)
          const fileText = await Filesystem.readText(openInput.path)
          const extension = path.extname(openInput.path)
          const languageId = LANGUAGE_EXTENSIONS[extension] ?? "plaintext"

          if (openInput.path in files) {
            const version = files[openInput.path]
            log.info("workspace/didChangeWatchedFiles", openInput)
            await connection.sendNotification("workspace/didChangeWatchedFiles", {
              changes: [
                {
                  uri: pathToFileURL(openInput.path).href,
                  type: 2, // Changed
                },
              ],
            })

            const next = version + 1
            files[openInput.path] = next
            log.info("textDocument/didChange", {
              path: openInput.path,
              version: next,
            })
            await connection.sendNotification("textDocument/didChange", {
              textDocument: {
                uri: pathToFileURL(openInput.path).href,
                version: next,
              },
              contentChanges: [{ text: fileText }],
            })
            return
          }

          log.info("workspace/didChangeWatchedFiles", openInput)
          await connection.sendNotification("workspace/didChangeWatchedFiles", {
            changes: [
              {
                uri: pathToFileURL(openInput.path).href,
                type: 1, // Created
              },
            ],
          })

          log.info("textDocument/didOpen", openInput)
          diagnosticsMap.delete(openInput.path)
          await connection.sendNotification("textDocument/didOpen", {
            textDocument: {
              uri: pathToFileURL(openInput.path).href,
              languageId,
              version: 0,
              text: fileText,
            },
          })
          files[openInput.path] = 0
          return
        },
      },
      get diagnostics() {
        return diagnosticsMap
      },
      async waitForDiagnostics(diagInput: { path: string }): Promise<void> {
        const normalizedPath = Filesystem.normalizePath(
          path.isAbsolute(diagInput.path)
            ? diagInput.path
            : path.resolve(Instance.directory, diagInput.path),
        )
        log.info("waiting for diagnostics", { path: normalizedPath })
        let unsub: (() => void) | undefined
        let debounceTimer: ReturnType<typeof setTimeout> | undefined
        await withTimeout(
          new Promise<void>((resolve) => {
            unsub = Bus.subscribe(Event.Diagnostics, (event) => {
              if (event.properties.path === normalizedPath && event.properties.serverID === result.serverID) {
                // Debounce to allow LSP to send follow-up diagnostics (e.g., semantic after syntax)
                if (debounceTimer !== undefined) clearTimeout(debounceTimer)
                debounceTimer = setTimeout(() => {
                  log.info("got diagnostics", { path: normalizedPath })
                  if (unsub) unsub()
                  resolve()
                }, DIAGNOSTICS_DEBOUNCE_MS)
              }
            })
          }),
          3000,
        )
          .catch(() => {
            // noop — timeout is expected
          })
          .finally(() => {
            if (debounceTimer !== undefined) clearTimeout(debounceTimer)
            if (unsub) unsub()
          })
      },
      shutdown(): void {
        l.info("shutting down")
        connection.end()
        connection.dispose()
        input.server.process.kill()
        l.info("shutdown")
      },
    }

    l.info("initialized")

    return result
  }
}
