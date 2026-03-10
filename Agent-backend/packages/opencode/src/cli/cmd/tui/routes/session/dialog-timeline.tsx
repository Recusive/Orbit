import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createMemo, onMount } from "solid-js"

import { useDialog } from "../../ui/dialog"

import { DialogMessage } from "./dialog-message"

import type { PromptInfo } from "../../component/prompt/history"
import type { DialogSelectOption } from "@tui/ui/dialog-select"
import type { JSX } from "solid-js"

import { Locale } from "@/util/locale"

export function DialogTimeline(props: {
  sessionID: string
  onMove: (messageID: string) => void
  setPrompt?: (prompt: PromptInfo) => void
}): JSX.Element {
  const sync = useSync()
  const dialog = useDialog()

  onMount(() => {
    dialog.setSize("large")
  })

  const options = createMemo((): DialogSelectOption<string>[] => {
    const messages = sync.data.message[props.sessionID] ?? []
    const result: DialogSelectOption<string>[] = []
    for (const message of messages) {
      if (message.role !== "user") continue
      const part = (sync.data.part[message.id] ?? []).find(
        (x) => x.type === "text" && !x.synthetic && !x.ignored,
      )
      if (part?.type !== "text") continue
      result.push({
        title: part.text.replace(/\n/g, " "),
        value: message.id,
        footer: Locale.time(message.time.created),
        onSelect: (dlg) => {
          dlg.replace(() =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
            (<DialogMessage messageID={message.id} sessionID={props.sessionID} setPrompt={props.setPrompt} />)
          )
        },
      })
    }
    result.reverse()
    return result
  })

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types unresolvable by ESLint type-checker
  return <DialogSelect onMove={(option) => { props.onMove(option.value); }} title="Timeline" options={options()} />
}
