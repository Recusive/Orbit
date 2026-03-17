import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createMemo, onMount } from "solid-js"

import { useDialog } from "../../ui/dialog"

import type { PromptInfo } from "@tui/component/prompt/history"
import type { DialogSelectOption } from "@tui/ui/dialog-select"
import type { JSX } from "solid-js"

import { Locale } from "@/util/locale"

export function DialogForkFromTimeline(props: { sessionID: string; onMove: (messageID: string) => void }): JSX.Element {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const route = useRoute()

  onMount(() => {
    dialog.setSize("large")
  })

  const options = createMemo((): DialogSelectOption<string>[] => {
    const messages = sync.data.message[props.sessionID] ?? []
    const result: DialogSelectOption<string>[] = []
    for (const message of messages) {
      if (message.role !== "user") continue
      const part = (sync.data.part[message.id] ?? []).find((x) => x.type === "text" && !x.synthetic && !x.ignored)
      if (part?.type !== "text") continue
      result.push({
        title: part.text.replace(/\n/g, " "),
        value: message.id,
        footer: Locale.time(message.time.created),
        onSelect: (dlg) => {
          void (async (): Promise<void> => {
            const forked = await sdk.client.session.fork({
              sessionID: props.sessionID,
              messageID: message.id,
            })
            const parts = sync.data.part[message.id] ?? []
            const initialPrompt = parts.reduce(
              (agg, p) => {
                if (p.type === "text") {
                  if (!p.synthetic) agg.input += p.text
                }
                if (p.type === "file") agg.parts.push(p)
                return agg
              },
              { input: "", parts: [] as PromptInfo["parts"] },
            )
            const id = forked.data?.id
            if (id) {
              route.navigate({
                sessionID: id,
                type: "session",
                initialPrompt,
              })
            }
            dlg.clear()
          })()
        },
      })
    }
    result.reverse()
    return result
  })

  return (
    <DialogSelect
      onMove={(option) => {
        props.onMove(option.value)
      }}
      title="Fork from message"
      options={options()}
    />
  )
}
