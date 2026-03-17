import z from "zod"

import { Instance } from "../project/instance"
import { Log } from "../util/log"

import { BusEvent } from "./bus-event"
import { GlobalBus } from "./global"

export namespace Bus {
  const log = Log.create({ service: "bus" })
  type Subscription = (event: unknown) => void

  export const InstanceDisposed = BusEvent.define(
    "server.instance.disposed",
    z.object({
      directory: z.string(),
    }),
  )

  const state = Instance.state(
    () => {
      const subscriptions = new Map<string, Subscription[]>()

      return {
        subscriptions,
      }
    },
    (entry): Promise<void> => {
      const wildcard = entry.subscriptions.get("*")
      if (wildcard === undefined) return Promise.resolve()
      const event = {
        type: InstanceDisposed.type,
        properties: {
          directory: Instance.directory,
        },
      }
      for (const sub of [...wildcard]) {
        sub(event)
      }
      return Promise.resolve()
    },
  )

  export function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.output<Definition["properties"]>,
  ): Promise<unknown[]> {
    const payload = {
      type: def.type,
      properties,
    }
    log.info("publishing", {
      type: def.type,
    })
    for (const key of [def.type, "*"]) {
      const match = state().subscriptions.get(key)
      for (const sub of match ?? []) {
        sub(payload)
      }
    }
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload,
    })
    return Promise.resolve([])
  }

  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
  ): () => void {
    return raw(def.type, callback as Subscription)
  }

  export function once<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"]
      properties: z.infer<Definition["properties"]>
    }) => "done" | undefined,
  ): void {
    const unsub = subscribe(def, (event) => {
      if (callback(event) === "done") unsub()
    })
  }

  export function subscribeAll(callback: (event: unknown) => void): () => void {
    return raw("*", callback)
  }

  function raw(type: string, callback: (event: unknown) => void): () => void {
    log.info("subscribing", { type })
    const subscriptions = state().subscriptions
    const match = subscriptions.get(type) ?? []
    match.push(callback)
    subscriptions.set(type, match)

    return () => {
      log.info("unsubscribing", { type })
      const current = subscriptions.get(type)
      if (current === undefined) return
      const index = current.indexOf(callback)
      if (index === -1) return
      current.splice(index, 1)
    }
  }
}
