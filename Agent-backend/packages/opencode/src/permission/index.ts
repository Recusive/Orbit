import z from "zod"

import { Plugin } from "../plugin"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Wildcard } from "../util/wildcard"

import { PermissionID } from "./schema"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { MessageID, SessionID } from "@/session/schema"

export namespace Permission {
  const log = Log.create({ service: "permission" })

  function toKeys(pattern: Info["pattern"], type: string): string[] {
    return pattern === undefined ? [type] : Array.isArray(pattern) ? pattern : [pattern]
  }

  function covered(keys: string[], approved: Map<string, boolean>): boolean {
    return keys.every((k) => {
      for (const p of approved.keys()) {
        if (Wildcard.match(k, p)) return true
      }
      return false
    })
  }

  export const Info = z
    .object({
      id: PermissionID.zod,
      type: z.string(),
      pattern: z.union([z.string(), z.array(z.string())]).optional(),
      sessionID: SessionID.zod,
      messageID: MessageID.zod,
      callID: z.string().optional(),
      message: z.string(),
      metadata: z.record(z.string(), z.any()),
      time: z.object({
        created: z.number(),
      }),
    })
    .meta({
      ref: "Permission",
    })
  export type Info = z.infer<typeof Info>

  interface PendingEntry {
    info: Info
    resolve: () => void
    reject: (e: Error) => void
  }

  export const Event = {
    Updated: BusEvent.define("permission.updated", Info),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: SessionID.zod,
        permissionID: PermissionID.zod,
        response: z.string(),
      }),
    ),
  }

  const state = Instance.state(
    () => ({
      pending: new Map<SessionID, Map<PermissionID, PendingEntry>>(),
      approved: new Map<SessionID, Map<string, boolean>>(),
    }),
    (state): Promise<void> => {
      for (const pending of state.pending.values()) {
        for (const item of pending.values()) {
          item.reject(new RejectedError(item.info.sessionID, item.info.id, item.info.callID, item.info.metadata))
        }
      }
      return Promise.resolve()
    },
  )

  export function pending(): Map<SessionID, Map<PermissionID, PendingEntry>> {
    return state().pending
  }

  export function list(): Info[] {
    const { pending } = state()
    const result: Info[] = []
    for (const items of pending.values()) {
      for (const item of items.values()) {
        result.push(item.info)
      }
    }
    return result.sort((a, b) => a.id.localeCompare(b.id))
  }

  export async function ask(input: {
    type: Info["type"]
    message: Info["message"]
    pattern?: Info["pattern"]
    callID?: Info["callID"]
    sessionID: Info["sessionID"]
    messageID: Info["messageID"]
    metadata: Info["metadata"]
  }): Promise<void> {
    const { pending, approved } = state()
    log.info("asking", {
      sessionID: input.sessionID,
      messageID: input.messageID,
      toolCallID: input.callID,
      pattern: input.pattern,
    })
    const approvedForSession = approved.get(input.sessionID)
    const keys = toKeys(input.pattern, input.type)
    if (approvedForSession && covered(keys, approvedForSession)) return
    const info: Info = {
      id: PermissionID.ascending(),
      type: input.type,
      pattern: input.pattern,
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      message: input.message,
      metadata: input.metadata,
      time: {
        created: Date.now(),
      },
    }

    switch (
      await Plugin.trigger(
        "permission.ask",
        { ...info, title: info.message },
        {
          status: "ask",
        },
      ).then((x) => x.status)
    ) {
      case "deny":
        throw new RejectedError(info.sessionID, info.id, info.callID, info.metadata)
      case "allow":
        return
      case "ask":
        break
    }

    if (!pending.has(input.sessionID)) pending.set(input.sessionID, new Map())
    return new Promise<void>((resolve, reject) => {
      const sessionPending = pending.get(input.sessionID)
      if (sessionPending === undefined) throw new Error(`Missing pending permission session: ${input.sessionID}`)
      sessionPending.set(info.id, {
        info,
        resolve,
        reject,
      })
      void Bus.publish(Event.Updated, info)
    })
  }

  export const Response = z.enum(["once", "always", "reject"])
  export type Response = z.infer<typeof Response>

  export function respond(input: { sessionID: Info["sessionID"]; permissionID: Info["id"]; response: Response }): void {
    log.info("response", input)
    const { pending, approved } = state()
    const sessionPending = pending.get(input.sessionID)
    const match = sessionPending?.get(input.permissionID)
    if (match === undefined || sessionPending === undefined) return
    sessionPending.delete(input.permissionID)
    if (sessionPending.size === 0) pending.delete(input.sessionID)
    void Bus.publish(Event.Replied, {
      sessionID: input.sessionID,
      permissionID: input.permissionID,
      response: input.response,
    })
    if (input.response === "reject") {
      match.reject(new RejectedError(input.sessionID, input.permissionID, match.info.callID, match.info.metadata))
      return
    }
    match.resolve()
    if (input.response === "always") {
      if (!approved.has(input.sessionID)) approved.set(input.sessionID, new Map())
      const approvedSession = approved.get(input.sessionID)
      if (approvedSession === undefined) throw new Error(`Missing approved permission session: ${input.sessionID}`)
      const approveKeys = toKeys(match.info.pattern, match.info.type)
      for (const k of approveKeys) {
        approvedSession.set(k, true)
      }
      const items = pending.get(input.sessionID)
      if (items === undefined) return
      const toRespond: Info[] = []
      for (const item of items.values()) {
        const itemKeys = toKeys(item.info.pattern, item.info.type)
        if (covered(itemKeys, approvedSession)) {
          toRespond.push(item.info)
        }
      }
      for (const item of toRespond) {
        respond({
          sessionID: item.sessionID,
          permissionID: item.id,
          response: input.response,
        })
      }
    }
  }

  export class RejectedError extends Error {
    constructor(
      public readonly sessionID: SessionID,
      public readonly permissionID: PermissionID,
      public readonly toolCallID?: string,
      public readonly metadata?: Record<string, unknown>,
      public readonly reason?: string,
    ) {
      super(
        reason ??
          `The user rejected permission to use this specific tool call. You may try again with different parameters.`,
      )
    }
  }
}
