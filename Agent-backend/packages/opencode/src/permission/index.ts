import z from "zod"

import { Identifier } from "../id/id"
import { Plugin } from "../plugin"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Wildcard } from "../util/wildcard"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"

export namespace Permission {
  const log = Log.create({ service: "permission" })

  function toKeys(pattern: Info["pattern"], type: string): string[] {
    return pattern === undefined ? [type] : Array.isArray(pattern) ? pattern : [pattern]
  }

  function covered(keys: string[], approved: Record<string, boolean>): boolean {
    const pats = Object.keys(approved)
    return keys.every((k) => pats.some((p) => Wildcard.match(k, p)))
  }

  export const Info = z
    .object({
      id: z.string(),
      type: z.string(),
      pattern: z.union([z.string(), z.array(z.string())]).optional(),
      sessionID: z.string(),
      messageID: z.string(),
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

  export const Event = {
    Updated: BusEvent.define("permission.updated", Info),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: z.string(),
        permissionID: z.string(),
        response: z.string(),
      }),
    ),
  }

  const state = Instance.state(
    () => {
      const pending: Record<
        string,
        Record<
          string,
          {
            info: Info
            resolve: () => void
            reject: (e: Error) => void
          }
        >
      > = {}

      const approved: Record<string, Record<string, boolean>> = {}

      return {
        pending,
        approved,
      }
    },
    (state): Promise<void> => {
      for (const pending of Object.values(state.pending)) {
        for (const item of Object.values(pending)) {
          item.reject(new RejectedError(item.info.sessionID, item.info.id, item.info.callID, item.info.metadata))
        }
      }
      return Promise.resolve()
    },
  )

  export function pending(): Record<
    string,
    Record<string, { info: Info; resolve: () => void; reject: (e: Error) => void }>
  > {
    return state().pending
  }

  export function list(): Info[] {
    const { pending } = state()
    const result: Info[] = []
    for (const items of Object.values(pending)) {
      for (const item of Object.values(items)) {
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
    const approvedForSession = input.sessionID in approved ? approved[input.sessionID] : {}
    const keys = toKeys(input.pattern, input.type)
    if (covered(keys, approvedForSession)) return
    const info: Info = {
      id: Identifier.ascending("permission"),
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

    if (!(input.sessionID in pending)) {
      pending[input.sessionID] = {}
    }
    return new Promise<void>((resolve, reject) => {
      pending[input.sessionID][info.id] = {
        info,
        resolve,
        reject,
      }
      void Bus.publish(Event.Updated, info)
    })
  }

  export const Response = z.enum(["once", "always", "reject"])
  export type Response = z.infer<typeof Response>

  export function respond(input: { sessionID: Info["sessionID"]; permissionID: Info["id"]; response: Response }): void {
    log.info("response", input)
    const { pending, approved } = state()
    const sessionPending = input.sessionID in pending ? pending[input.sessionID] : undefined
    const match =
      sessionPending !== undefined && input.permissionID in sessionPending
        ? sessionPending[input.permissionID]
        : undefined
    if (match === undefined) return
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by permission ID
    delete pending[input.sessionID][input.permissionID]
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
      if (!(input.sessionID in approved)) {
        approved[input.sessionID] = {}
      }
      const approveKeys = toKeys(match.info.pattern, match.info.type)
      for (const k of approveKeys) {
        approved[input.sessionID][k] = true
      }
      const items = input.sessionID in pending ? pending[input.sessionID] : undefined
      if (items === undefined) return
      for (const item of Object.values(items)) {
        const itemKeys = toKeys(item.info.pattern, item.info.type)
        if (covered(itemKeys, approved[input.sessionID])) {
          respond({
            sessionID: item.info.sessionID,
            permissionID: item.info.id,
            response: input.response,
          })
        }
      }
    }
  }

  export class RejectedError extends Error {
    constructor(
      public readonly sessionID: string,
      public readonly permissionID: string,
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
