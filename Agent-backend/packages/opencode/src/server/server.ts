import { NamedError } from "@orbit.build/util/error"
import { Hono } from "hono"
import { basicAuth } from "hono/basic-auth"
import { websocket } from "hono/bun"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { proxy } from "hono/proxy"
import { streamSSE } from "hono/streaming"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import z from "zod"

import { Agent } from "../agent/agent"
import { Auth } from "../auth"
import { Command } from "../command"
import { WorkspaceContext } from "../control-plane/workspace-context"
import { WorkspaceRouterMiddleware } from "../control-plane/workspace-router-middleware"
import { Flag } from "../flag/flag"
import { Format } from "../format"
import { Global } from "../global"
import { LSP } from "../lsp"
import { InstanceBootstrap } from "../project/bootstrap"
import { Instance } from "../project/instance"
import { Vcs } from "../project/vcs"
import { Provider } from "../provider/provider"
import { Skill } from "../skill/skill"
import { NotFoundError } from "../storage/db"
import { Log } from "../util/log"

import { errors } from "./error"
import { MDNS } from "./mdns"
import { ConfigRoutes } from "./routes/config"
import { ExperimentalRoutes } from "./routes/experimental"
import { FileRoutes } from "./routes/file"
import { GlobalRoutes } from "./routes/global"
import { McpRoutes } from "./routes/mcp"
import { PermissionRoutes } from "./routes/permission"
import { ProjectRoutes } from "./routes/project"
import { ProviderRoutes } from "./routes/provider"
import { PtyRoutes } from "./routes/pty"
import { QuestionRoutes } from "./routes/question"
import { SessionRoutes } from "./routes/session"
import { TuiRoutes } from "./routes/tui"

import type { ContentfulStatusCode } from "hono/utils/http-status"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Filesystem } from "@/util/filesystem"
import { lazy } from "@/util/lazy"

// This global is needed to prevent ai-sdk from logging warnings to stdout — see ai-sdk log-warnings.ts
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  export const Default = lazy(() => createApp({}))

  export const createApp = (opts: { cors?: string[] }): Hono => {
    const app = new Hono()
    return app
      .onError((err, c) => {
        log.error("failed", {
          error: err,
        })
        if (err instanceof NamedError) {
          let status: ContentfulStatusCode
          if (err instanceof NotFoundError) status = 404
          else if (err instanceof Provider.ModelNotFoundError) status = 400
          else if (err.name.startsWith("Worktree")) status = 400
          else status = 500
          return c.json(err.toObject(), { status })
        }
        if (err instanceof HTTPException) return err.getResponse()
        const message = err instanceof Error && err.stack ? err.stack : err.toString()
        return c.json(new NamedError.Unknown({ message }).toObject(), {
          status: 500,
        })
      })
      .use((c, next) => {
        // Allow CORS preflight requests to succeed without auth.
        // Browser clients sending Authorization headers will preflight with OPTIONS.
        if (c.req.method === "OPTIONS") return next()
        const password = Flag.OPENCODE_SERVER_PASSWORD
        if (!password) return next()
        const username = Flag.OPENCODE_SERVER_USERNAME ?? "orbit"
        return basicAuth({ username, password })(c, next)
      })
      .use(async (c, next) => {
        const skipLogging = c.req.path === "/log"
        if (!skipLogging) {
          log.info("request", {
            method: c.req.method,
            path: c.req.path,
          })
        }
        const timer = log.time("request", {
          method: c.req.method,
          path: c.req.path,
        })
        await next()
        if (!skipLogging) {
          timer.stop()
        }
      })
      .use(
        cors({
          origin(input) {
            if (!input) return

            if (input.startsWith("http://localhost:")) return input
            if (input.startsWith("http://127.0.0.1:")) return input
            if (
              input === "tauri://localhost" ||
              input === "http://tauri.localhost" ||
              input === "https://tauri.localhost"
            )
              return input

            // *.opencode.ai (https only, adjust if needed)
            if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) {
              return input
            }
            if (opts.cors?.includes(input)) {
              return input
            }

            return
          },
        }),
      )
      .route("/global", GlobalRoutes())
      .put(
        "/auth/:providerID",
        describeRoute({
          summary: "Set auth credentials",
          description: "Set authentication credentials",
          operationId: "auth.set",
          responses: {
            200: {
              description: "Successfully set authentication credentials",
              content: {
                "application/json": {
                  schema: resolver(z.boolean()),
                },
              },
            },
            ...errors(400),
          },
        }),
        validator(
          "param",
          z.object({
            providerID: z.string(),
          }),
        ),
        validator("json", Auth.Info),
        async (c) => {
          const providerID = c.req.valid("param").providerID
          const info = c.req.valid("json")
          await Auth.set(providerID, info)
          Provider.reset()
          return c.json(true)
        },
      )
      .delete(
        "/auth/:providerID",
        describeRoute({
          summary: "Remove auth credentials",
          description: "Remove authentication credentials",
          operationId: "auth.remove",
          responses: {
            200: {
              description: "Successfully removed authentication credentials",
              content: {
                "application/json": {
                  schema: resolver(z.boolean()),
                },
              },
            },
            ...errors(400),
          },
        }),
        validator(
          "param",
          z.object({
            providerID: z.string(),
          }),
        ),
        async (c) => {
          const providerID = c.req.valid("param").providerID
          await Auth.remove(providerID)
          Provider.reset()
          return c.json(true)
        },
      )
      .use(async (c, next) => {
        if (c.req.path === "/log") return next()
        const workspaceID = c.req.query("workspace") ?? c.req.header("x-opencode-workspace")
        const raw = c.req.query("directory") ?? c.req.header("x-opencode-directory") ?? process.cwd()
        const directory = Filesystem.resolve(
          (() => {
            try {
              return decodeURIComponent(raw)
            } catch {
              return raw
            }
          })(),
        )

        return WorkspaceContext.provide({
          workspaceID,
          async fn() {
            return Instance.provide({
              directory,
              init: InstanceBootstrap,
              async fn() {
                return next()
              },
            })
          },
        })
      })
      .use(WorkspaceRouterMiddleware)
      .get(
        "/doc",
        openAPIRouteHandler(app, {
          documentation: {
            info: {
              title: "orbit",
              version: "0.0.3",
              description: "orbit api",
            },
            openapi: "3.1.1",
          },
        }),
      )
      .use(
        validator(
          "query",
          z.object({
            directory: z.string().optional(),
            workspace: z.string().optional(),
          }),
        ),
      )
      .route("/project", ProjectRoutes())
      .route("/pty", PtyRoutes())
      .route("/config", ConfigRoutes())
      .route("/experimental", ExperimentalRoutes())
      .route("/session", SessionRoutes())
      .route("/permission", PermissionRoutes())
      .route("/question", QuestionRoutes())
      .route("/provider", ProviderRoutes())
      .route("/", FileRoutes())
      .route("/mcp", McpRoutes())
      .route("/tui", TuiRoutes())
      .post(
        "/instance/dispose",
        describeRoute({
          summary: "Dispose instance",
          description: "Clean up and dispose the current Orbit instance, releasing all resources.",
          operationId: "instance.dispose",
          responses: {
            200: {
              description: "Instance disposed",
              content: {
                "application/json": {
                  schema: resolver(z.boolean()),
                },
              },
            },
          },
        }),
        async (c) => {
          await Instance.dispose()
          return c.json(true)
        },
      )
      .get(
        "/path",
        describeRoute({
          summary: "Get paths",
          description: "Retrieve the current working directory and related path information for the Orbit instance.",
          operationId: "path.get",
          responses: {
            200: {
              description: "Path",
              content: {
                "application/json": {
                  schema: resolver(
                    z
                      .object({
                        home: z.string(),
                        state: z.string(),
                        config: z.string(),
                        worktree: z.string(),
                        directory: z.string(),
                      })
                      .meta({
                        ref: "Path",
                      }),
                  ),
                },
              },
            },
          },
        }),
        (c) => {
          return c.json({
            home: Global.Path.home,
            state: Global.Path.state,
            config: Global.Path.config,
            worktree: Instance.worktree,
            directory: Instance.directory,
          })
        },
      )
      .get(
        "/vcs",
        describeRoute({
          summary: "Get VCS info",
          description: "Retrieve version control system (VCS) information for the current project, such as git branch.",
          operationId: "vcs.get",
          responses: {
            200: {
              description: "VCS info",
              content: {
                "application/json": {
                  schema: resolver(Vcs.Info),
                },
              },
            },
          },
        }),
        async (c) => {
          const branch = await Vcs.branch()
          return c.json({
            branch,
          })
        },
      )
      .get(
        "/command",
        describeRoute({
          summary: "List commands",
          description: "Get a list of all available commands in the Orbit system.",
          operationId: "command.list",
          responses: {
            200: {
              description: "List of commands",
              content: {
                "application/json": {
                  schema: resolver(Command.Info.array()),
                },
              },
            },
          },
        }),
        async (c) => {
          const commands = await Command.list()
          return c.json(commands)
        },
      )
      .post(
        "/log",
        describeRoute({
          summary: "Write log",
          description: "Write a log entry to the server logs with specified level and metadata.",
          operationId: "app.log",
          responses: {
            200: {
              description: "Log entry written successfully",
              content: {
                "application/json": {
                  schema: resolver(z.boolean()),
                },
              },
            },
            ...errors(400),
          },
        }),
        validator(
          "json",
          z.object({
            service: z.string().meta({ description: "Service name for the log entry" }),
            level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
            message: z.string().meta({ description: "Log message" }),
            extra: z
              .record(z.string(), z.any())
              .optional()
              .meta({ description: "Additional metadata for the log entry" }),
          }),
        ),
        (c) => {
          const { service, level, message, extra } = c.req.valid("json")
          const logger = Log.create({ service })

          switch (level) {
            case "debug":
              logger.debug(message, extra)
              break
            case "info":
              logger.info(message, extra)
              break
            case "error":
              logger.error(message, extra)
              break
            case "warn":
              logger.warn(message, extra)
              break
          }

          return c.json(true)
        },
      )
      .get(
        "/agent",
        describeRoute({
          summary: "List agents",
          description: "Get a list of all available AI agents in the Orbit system.",
          operationId: "app.agents",
          responses: {
            200: {
              description: "List of agents",
              content: {
                "application/json": {
                  schema: resolver(Agent.Info.array()),
                },
              },
            },
          },
        }),
        async (c) => {
          const modes = await Agent.list()
          return c.json(modes)
        },
      )
      .get(
        "/skill",
        describeRoute({
          summary: "List skills",
          description: "Get a list of all available skills in the Orbit system.",
          operationId: "app.skills",
          responses: {
            200: {
              description: "List of skills",
              content: {
                "application/json": {
                  schema: resolver(Skill.Info.array()),
                },
              },
            },
          },
        }),
        async (c) => {
          const skills = await Skill.all()
          return c.json(skills)
        },
      )
      .get(
        "/lsp",
        describeRoute({
          summary: "Get LSP status",
          description: "Get LSP server status",
          operationId: "lsp.status",
          responses: {
            200: {
              description: "LSP server status",
              content: {
                "application/json": {
                  schema: resolver(LSP.Status.array()),
                },
              },
            },
          },
        }),
        async (c) => {
          return c.json(await LSP.status())
        },
      )
      .get(
        "/formatter",
        describeRoute({
          summary: "Get formatter status",
          description: "Get formatter status",
          operationId: "formatter.status",
          responses: {
            200: {
              description: "Formatter status",
              content: {
                "application/json": {
                  schema: resolver(Format.Status.array()),
                },
              },
            },
          },
        }),
        async (c) => {
          return c.json(await Format.status())
        },
      )
      .get(
        "/event",
        describeRoute({
          summary: "Subscribe to events",
          description: "Get events",
          operationId: "event.subscribe",
          responses: {
            200: {
              description: "Event stream",
              content: {
                "text/event-stream": {
                  schema: resolver(BusEvent.payloads()),
                },
              },
            },
          },
        }),
        (c) => {
          log.info("event connected")
          c.header("X-Accel-Buffering", "no")
          c.header("X-Content-Type-Options", "nosniff")
          return streamSSE(c, async (stream) => {
            void stream.writeSSE({
              data: JSON.stringify({
                type: "server.connected",
                properties: {},
              }),
            })
            const unsub = Bus.subscribeAll((event) => {
              void stream.writeSSE({
                data: JSON.stringify(event),
              })
              const typed = event as { type?: string }
              if (typed.type === Bus.InstanceDisposed.type) {
                void stream.close()
              }
            })

            // Send heartbeat every 10s to prevent stalled proxy streams.
            const heartbeat = setInterval(() => {
              void stream.writeSSE({
                data: JSON.stringify({
                  type: "server.heartbeat",
                  properties: {},
                }),
              })
            }, 10_000)

            await new Promise<void>((resolve) => {
              stream.onAbort(() => {
                clearInterval(heartbeat)
                unsub()
                resolve()
                log.info("event disconnected")
              })
            })
          })
        },
      )
      .all("/*", async (c) => {
        const path = c.req.path
        const headers = Object.fromEntries(c.req.raw.headers.entries())
        headers.host = "app.opencode.ai"

        const response = await proxy(`https://app.opencode.ai${path}`, {
          method: c.req.method,
          headers,
        })
        response.headers.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:",
        )
        return response
      })
  }

  export async function openapi(): Promise<Record<string, unknown>> {
    // Cast to break excessive type recursion from long route chains
    const result = await generateSpecs(Default(), {
      documentation: {
        info: {
          title: "orbit",
          version: "1.0.0",
          description: "orbit api",
        },
        openapi: "3.1.1",
      },
    })
    return result as Record<string, unknown>
  }

  export function listen(opts: {
    port: number
    hostname: string
    mdns?: boolean
    mdnsDomain?: string
    cors?: string[]
  }): ReturnType<typeof Bun.serve> {
    const app = createApp(opts)
    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: app.fetch,
      websocket: websocket,
    } as const
    const tryServe = (port: number): ReturnType<typeof Bun.serve> | undefined => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(4096) ?? tryServe(0)) : tryServe(opts.port)
    if (server === undefined) throw new Error(`Failed to start server on port ${String(opts.port)}`)

    const shouldPublishMDNS =
      opts.mdns === true &&
      server.port !== 0 &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"
    if (shouldPublishMDNS && server.port !== undefined) {
      MDNS.publish(server.port, opts.mdnsDomain)
    } else if (opts.mdns === true) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    const originalStop = server.stop.bind(server)
    server.stop = async (closeActiveConnections?: boolean) => {
      if (shouldPublishMDNS) MDNS.unpublish()
      return originalStop(closeActiveConnections)
    }

    return server
  }
}
