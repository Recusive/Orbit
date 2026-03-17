import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createMemo, createSignal, createResource, onMount } from "solid-js"

import { useKeybind } from "../../context/keybind"
import { useSDK } from "../../context/sdk"
import { useTheme } from "../../context/theme"
import { useToast } from "../../ui/toast"
import { createDebouncedSignal } from "../../util/signal"
import { DialogSessionRename } from "../dialog-session-rename"
import { Spinner } from "../spinner"

import type { JSX } from "solid-js"

import { Locale } from "@/util/locale"

export function DialogSessionList(props: { workspaceID?: string; localOnly?: boolean } = {}): JSX.Element {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const keybind = useKeybind()
  const { theme } = useTheme()
  const sdk = useSDK()
  const toast = useToast()
  const [toDelete, setToDelete] = createSignal<string>()
  const [search, setSearch] = createDebouncedSignal("", 150)

  const [listed, listedActions] = createResource(
    () => props.workspaceID,
    async (workspaceID) => {
      if (!workspaceID) return undefined
      const result = await sdk.client.session.list({ roots: true })
      return result.data ?? []
    },
  )

  const [searchResults] = createResource(search, async (query) => {
    if (!query || props.localOnly) return undefined
    const result = await sdk.client.session.list({
      search: query,
      limit: 30,
      ...(props.workspaceID ? { roots: true } : {}),
    })
    return result.data ?? []
  })

  const currentSessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))

  const sessions = createMemo(() => {
    const results = searchResults()
    if (results) return results
    if (props.workspaceID) return listed() ?? []
    if (props.localOnly) return sync.data.session.filter((session) => !session.workspaceID)
    return sync.data.session
  })

  const options = createMemo(() => {
    const today = new Date().toDateString()
    return sessions()
      .filter((x) => {
        if (x.parentID !== undefined) return false
        if (props.workspaceID && listed()) return true
        if (props.workspaceID) return x.workspaceID === props.workspaceID
        if (props.localOnly) return !x.workspaceID
        return true
      })
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .map((x) => {
        const date = new Date(x.time.updated)
        let category = date.toDateString()
        if (category === today) {
          category = "Today"
        }
        const isDeleting = toDelete() === x.id
        const status = sync.data.session_status[x.id] as { type?: string } | undefined
        const isWorking = status?.type === "busy"
        return {
          title: isDeleting ? `Press ${keybind.print("session_delete")} again to confirm` : x.title,
          bg: isDeleting ? theme.error : undefined,
          value: x.id,
          category,
          footer: Locale.time(x.time.updated),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentui JSX types
          gutter: isWorking ? <Spinner /> : undefined,
        }
      })
  })

  onMount(() => {
    dialog.setSize("large")
  })

  return (
    <DialogSelect
      title={props.workspaceID ? `Workspace Sessions` : props.localOnly ? "Local Sessions" : "Sessions"}
      options={options()}
      skipFilter={!props.localOnly}
      current={currentSessionID()}
      onFilter={setSearch}
      onMove={() => {
        setToDelete(undefined)
      }}
      onSelect={(option) => {
        route.navigate({
          type: "session",
          sessionID: option.value,
        })
        dialog.clear()
      }}
      keybind={[
        {
          keybind: keybind.all.session_delete[0],
          title: "delete",
          onTrigger: (option) => {
            if (toDelete() === option.value) {
              void (async (): Promise<void> => {
                const deleted = await sdk.client.session
                  .delete({
                    sessionID: option.value,
                  })
                  .then(() => true)
                  .catch(() => false)
                setToDelete(undefined)
                if (!deleted) {
                  toast.show({
                    message: "Failed to delete session",
                    variant: "error",
                  })
                  return
                }
                if (props.workspaceID) {
                  listedActions.mutate((sessions) => sessions?.filter((session) => session.id !== option.value))
                  return
                }
                sync.set(
                  "session",
                  sync.data.session.filter((session) => session.id !== option.value),
                )
              })()
              return
            }
            setToDelete(option.value)
          },
        },
        {
          keybind: keybind.all.session_rename[0],
          title: "rename",
          onTrigger: (option) => {
            dialog.replace(() => <DialogSessionRename session={option.value} />)
          },
        },
      ]}
    />
  )
}
