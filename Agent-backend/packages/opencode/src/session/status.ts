import z from "zod"

import { SessionID } from "./schema"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Instance } from "@/project/instance"

export namespace SessionStatus {
  export const Info = z
    .union([
      z.object({
        type: z.literal("idle"),
      }),
      z.object({
        type: z.literal("retry"),
        attempt: z.number(),
        message: z.string(),
        next: z.number(),
      }),
      z.object({
        type: z.literal("busy"),
      }),
    ])
    .meta({
      ref: "SessionStatus",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: SessionID.zod,
        status: Info,
      }),
    ),
    // deprecated
    Idle: BusEvent.define(
      "session.idle",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  const state = Instance.state(() => {
    const data: Record<string, Info> = {}
    return data
  })

  export function get(sessionID: SessionID): Info {
    return (
      state()[sessionID] ?? {
        type: "idle" as const,
      }
    )
  }

  export function list(): Record<string, Info> {
    return state()
  }

  export function set(sessionID: SessionID, status: Info): void {
    void Bus.publish(Event.Status, {
      sessionID,
      status,
    })
    if (status.type === "idle") {
      // deprecated
      void Bus.publish(Event.Idle, {
        sessionID,
      })
      const s = state()
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by session ID
      delete s[sessionID]
      return
    }
    state()[sessionID] = status
  }
}
