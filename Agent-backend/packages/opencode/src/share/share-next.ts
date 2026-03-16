import { SessionShareTable } from "./share.sql"

import type * as SDK from "@orbit.build/sdk/v2"

import { Account } from "@/account"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionID } from "@/session/schema"
import { Database, eq } from "@/storage/db"
import { Log } from "@/util/log"

export namespace ShareNext {
  const log = Log.create({ service: "share-next" })

  type ApiEndpoints = {
    create: string
    sync: (shareID: string) => string
    remove: (shareID: string) => string
    data: (shareID: string) => string
  }

  function apiEndpoints(resource: string): ApiEndpoints {
    return {
      create: `/api/${resource}`,
      sync: (shareID) => `/api/${resource}/${shareID}/sync`,
      remove: (shareID) => `/api/${resource}/${shareID}`,
      data: (shareID) => `/api/${resource}/${shareID}/data`,
    }
  }

  const legacyApi = apiEndpoints("share")
  const consoleApi = apiEndpoints("shares")

  export async function url(): Promise<string> {
    const req = await request()
    return req.baseUrl
  }

  export async function request(): Promise<{
    headers: Record<string, string>
    api: ApiEndpoints
    baseUrl: string
  }> {
    const headers: Record<string, string> = {}

    const active = Account.active()
    if (!active?.active_org_id) {
      const baseUrl = await Config.get().then((x) => x.enterprise?.url ?? "https://opncd.ai")
      return { headers, api: legacyApi, baseUrl }
    }

    const token = await Account.token(active.id)
    if (!token) {
      throw new Error("No active account token available for sharing")
    }

    headers.authorization = `Bearer ${token}`
    headers["x-org-id"] = active.active_org_id
    return { headers, api: consoleApi, baseUrl: active.url }
  }

  const disabled = process.env.OPENCODE_DISABLE_SHARE === "true" || process.env.OPENCODE_DISABLE_SHARE === "1"

  export function init(): void {
    if (disabled) return
    Bus.subscribe(Session.Event.Updated, (evt) => {
      sync(evt.properties.info.id, [
        {
          type: "session",
          data: evt.properties.info,
        },
      ])
    })
    Bus.subscribe(MessageV2.Event.Updated, (evt) => {
      sync(evt.properties.info.sessionID, [
        {
          type: "message",
          data: evt.properties.info,
        },
      ])
      if (evt.properties.info.role === "user") {
        const userMsg = evt.properties.info as SDK.UserMessage
        void (async () => {
          const model = await Provider.getModel(userMsg.model.providerID, userMsg.model.modelID)
          sync(evt.properties.info.sessionID, [
            {
              type: "model",
              data: [model],
            },
          ])
        })()
      }
    })
    Bus.subscribe(MessageV2.Event.PartUpdated, (evt) => {
      sync(evt.properties.part.sessionID, [
        {
          type: "part",
          data: evt.properties.part,
        },
      ])
    })
    Bus.subscribe(Session.Event.Diff, (evt) => {
      sync(evt.properties.sessionID, [
        {
          type: "session_diff",
          data: evt.properties.diff,
        },
      ])
    })
  }

  export async function create(sessionID: string): Promise<{ id: string; url: string; secret: string }> {
    if (disabled) return { id: "", url: "", secret: "" }
    log.info("creating share", { sessionID })
    const result = await fetch(`${await url()}/api/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionID: sessionID }),
    })
      .then((x) => x.json())
      .then((x) => x as { id: string; url: string; secret: string })
    Database.use((db) => {
      db.insert(SessionShareTable)
        .values({ session_id: sessionID, id: result.id, secret: result.secret, url: result.url })
        .onConflictDoUpdate({
          target: SessionShareTable.session_id,
          set: { id: result.id, secret: result.secret, url: result.url },
        })
        .run()
    })
    void fullSync(sessionID)
    return result
  }

  function get(sessionID: string): { id: string; secret: string; url: string } | undefined {
    const row = Database.use((db) =>
      db.select().from(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).get(),
    )
    if (row === undefined) return undefined
    return { id: row.id, secret: row.secret, url: row.url }
  }

  type Data =
    | {
        type: "session"
        data: SDK.Session
      }
    | {
        type: "message"
        data: SDK.Message
      }
    | {
        type: "part"
        data: SDK.Part
      }
    | {
        type: "session_diff"
        data: SDK.FileDiff[]
      }
    | {
        type: "model"
        data: SDK.Model[]
      }

  function key(item: Data): string {
    switch (item.type) {
      case "session":
        return "session"
      case "message":
        return `message/${item.data.id}`
      case "part":
        return `part/${item.data.messageID}/${item.data.id}`
      case "session_diff":
        return "session_diff"
      case "model":
        return "model"
    }
  }

  const queue = new Map<string, { timeout: NodeJS.Timeout; data: Map<string, Data> }>()
  function sync(sessionID: string, data: Data[]): void {
    if (disabled) return
    const existing = queue.get(sessionID)
    if (existing !== undefined) {
      for (const item of data) {
        existing.data.set(key(item), item)
      }
      return
    }

    const dataMap = new Map<string, Data>()
    for (const item of data) {
      dataMap.set(key(item), item)
    }

    const timeout = setTimeout(() => {
      const queued = queue.get(sessionID)
      if (queued === undefined) return
      queue.delete(sessionID)
      const share = get(sessionID)
      if (share === undefined) return

      void (async () => {
        const baseUrl = await url()
        await fetch(`${baseUrl}/api/share/${share.id}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            secret: share.secret,
            data: Array.from(queued.data.values()),
          }),
        })
      })()
    }, 1000)
    queue.set(sessionID, { timeout, data: dataMap })
  }

  export async function remove(sessionID: string): Promise<void> {
    if (disabled) return
    log.info("removing share", { sessionID })
    const share = get(sessionID)
    if (share === undefined) return
    await fetch(`${await url()}/api/share/${share.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: share.secret,
      }),
    })
    Database.use((db) => {
      db.delete(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).run()
    })
  }

  async function fullSync(sessionID: string): Promise<void> {
    log.info("full sync", { sessionID })
    const brandedSessionID = SessionID.make(sessionID)
    const session = Session.get(brandedSessionID)
    const diffs = await Session.diff(brandedSessionID)
    const messages = await Array.fromAsync(MessageV2.stream(brandedSessionID))
    const models = await Promise.all(
      Array.from(
        new Map(
          messages
            .filter((m) => m.info.role === "user")
            .map((m) => (m.info as SDK.UserMessage).model)
            .map((m) => [`${m.providerID}/${m.modelID}`, m] as const),
        ).values(),
      ).map((m) => Provider.getModel(m.providerID, m.modelID).then((item) => item)),
    )
    sync(sessionID, [
      {
        type: "session",
        data: session,
      },
      ...messages.map((x) => ({
        type: "message" as const,
        data: x.info,
      })),
      ...messages.flatMap((x) => x.parts.map((y) => ({ type: "part" as const, data: y }))),
      {
        type: "session_diff",
        data: diffs,
      },
      {
        type: "model",
        data: models,
      },
    ])
  }
}
