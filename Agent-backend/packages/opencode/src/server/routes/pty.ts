import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"

import { NotFoundError } from "../../storage/db"
import { lazy } from "../../util/lazy"
import { errors } from "../error"

import { Pty } from "@/pty"
import { PtyID } from "@/pty/schema"

export const PtyRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List PTY sessions",
        description: "Get a list of all active pseudo-terminal (PTY) sessions managed by Orbit.",
        operationId: "pty.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Pty.Info.array()),
              },
            },
          },
        },
      }),
      (c) => {
        return c.json(Pty.list())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create PTY session",
        description: "Create a new pseudo-terminal (PTY) session for running shell commands and processes.",
        operationId: "pty.create",
        responses: {
          200: {
            description: "Created session",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Pty.CreateInput),
      async (c) => {
        const info = await Pty.create(c.req.valid("json"))
        return c.json(info)
      },
    )
    .get(
      "/:ptyID",
      describeRoute({
        summary: "Get PTY session",
        description: "Retrieve detailed information about a specific pseudo-terminal (PTY) session.",
        operationId: "pty.get",
        responses: {
          200: {
            description: "Session info",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      (c) => {
        const info = Pty.get(PtyID.make(c.req.valid("param").ptyID))
        if (info === undefined) {
          throw new NotFoundError({ message: "Session not found" })
        }
        return c.json(info)
      },
    )
    .put(
      "/:ptyID",
      describeRoute({
        summary: "Update PTY session",
        description: "Update properties of an existing pseudo-terminal (PTY) session.",
        operationId: "pty.update",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      validator("json", Pty.UpdateInput),
      (c) => {
        const info = Pty.update(PtyID.make(c.req.valid("param").ptyID), c.req.valid("json"))
        return c.json(info)
      },
    )
    .delete(
      "/:ptyID",
      describeRoute({
        summary: "Remove PTY session",
        description: "Remove and terminate a specific pseudo-terminal (PTY) session.",
        operationId: "pty.remove",
        responses: {
          200: {
            description: "Session removed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      (c) => {
        Pty.remove(PtyID.make(c.req.valid("param").ptyID))
        return c.json(true)
      },
    )
    .get(
      "/:ptyID/connect",
      describeRoute({
        summary: "Connect to PTY session",
        description: "Establish a WebSocket connection to interact with a pseudo-terminal (PTY) session in real-time.",
        operationId: "pty.connect",
        responses: {
          200: {
            description: "Connected session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      upgradeWebSocket((c) => {
        const id = PtyID.make(c.req.param("ptyID"))
        const cursor = (() => {
          const raw = c.req.query("cursor")
          if (raw === undefined) return undefined
          const parsed = Number(raw)
          if (!Number.isSafeInteger(parsed) || parsed < -1) return undefined
          return parsed
        })()
        let handler: ReturnType<typeof Pty.connect>
        if (Pty.get(id) === undefined) throw new Error("Session not found")

        interface Socket {
          readyState: number
          send: (data: string | Uint8Array | ArrayBuffer) => void
          close: (code?: number, reason?: string) => void
        }

        const isSocket = (candidate: unknown): candidate is Socket => {
          if (candidate === null || candidate === undefined || typeof candidate !== "object") return false
          if (!("readyState" in candidate)) return false
          if (!("send" in candidate) || typeof (candidate as { send?: unknown }).send !== "function") return false
          if (!("close" in candidate) || typeof (candidate as { close?: unknown }).close !== "function") return false
          return typeof (candidate as { readyState?: unknown }).readyState === "number"
        }

        return {
          onOpen(_event, ws) {
            const socket: unknown = ws.raw
            if (!isSocket(socket)) {
              ws.close()
              return
            }
            handler = Pty.connect(id, socket, cursor)
          },
          onMessage(event) {
            if (typeof event.data !== "string") return
            handler?.onMessage(event.data)
          },
          onClose() {
            handler?.onClose()
          },
          onError() {
            handler?.onClose()
          },
        }
      }),
    ),
)
