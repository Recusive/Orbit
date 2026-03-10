import { Hono } from "hono"

import { InstanceBootstrap } from "../../project/bootstrap"
import { Instance } from "../../project/instance"
import { SessionRoutes } from "../../server/routes/session"
import { WorkspaceContext } from "../workspace-context"

import { WorkspaceServerRoutes } from "./routes"

export namespace WorkspaceServer {
  export function App(): Hono {
    const session = new Hono()
      .use(async (_c, next) => {
        // Right now, we need handle all requests because we don't
        // have syncing. In the future all GET requests will handled
        // by the control plane
        //
        // if (c.req.method === "GET") return c.notFound()
        await next()
      })
      .route("/", SessionRoutes())

    return new Hono()
      .use(async (c, next) => {
        const workspaceID = c.req.query("workspace") ?? c.req.header("x-opencode-workspace")
        const raw = c.req.query("directory") ?? c.req.header("x-opencode-directory")
        if (workspaceID === undefined) {
          throw new Error("workspaceID parameter is required")
        }
        if (raw === undefined) {
          throw new Error("directory parameter is required")
        }

        const directory = (() => {
          try {
            return decodeURIComponent(raw)
          } catch {
            return raw
          }
        })()

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
      .route("/session", session)
      .route("/", WorkspaceServerRoutes())
  }

  export function Listen(opts: { hostname: string; port: number }): ReturnType<typeof Bun.serve> {
    return Bun.serve({
      hostname: opts.hostname,
      port: opts.port,
      fetch: App().fetch,
    })
  }
}
