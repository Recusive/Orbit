import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { Clipboard } from "@tui/util/clipboard"
import { createMemo } from "solid-js"

import type { PromptInfo } from "@tui/component/prompt/history"
import type { JSX } from "solid-js"

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
}): JSX.Element {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => (sync.data.message[props.sessionID] ?? []).find((x) => x.id === props.messageID))
  const route = useRoute()

  return (
    <DialogSelect
      title="Message Actions"
      options={[
        {
          title: "Revert",
          value: "session.revert",
          description: "undo messages and file changes",
          onSelect: (dialog) => {
            const msg = message()
            if (!msg) return

            void sdk.client.session.revert({
              sessionID: props.sessionID,
              messageID: msg.id,
            })

            if (props.setPrompt) {
              const parts = sync.data.part[msg.id] ?? []
              const promptInfo = parts.reduce(
                (agg, part) => {
                  if (part.type === "text") {
                    if (!part.synthetic) agg.input += part.text
                  }
                  if (part.type === "file") agg.parts.push(part)
                  return agg
                },
                { input: "", parts: [] as PromptInfo["parts"] },
              )
              props.setPrompt(promptInfo)
            }

            dialog.clear()
          },
        },
        {
          title: "Copy",
          value: "message.copy",
          description: "message text to clipboard",
          onSelect: (dialog) => {
            const msg = message()
            if (!msg) return

            const parts = sync.data.part[msg.id] ?? []
            const text = parts.reduce((agg, part) => {
              if (part.type === "text" && !part.synthetic) {
                agg += part.text
              }
              return agg
            }, "")

            void Clipboard.copy(text)
            dialog.clear()
          },
        },
        {
          title: "Fork",
          value: "session.fork",
          description: "create a new session",
          onSelect: (dialog) => {
            void (async (): Promise<void> => {
              const result = await sdk.client.session.fork({
                sessionID: props.sessionID,
                messageID: props.messageID,
              })
              const initialPrompt = (() => {
                const msg = message()
                if (!msg) return undefined
                const parts = sync.data.part[msg.id] ?? []
                return parts.reduce(
                  (agg, part) => {
                    if (part.type === "text") {
                      if (!part.synthetic) agg.input += part.text
                    }
                    if (part.type === "file") agg.parts.push(part)
                    return agg
                  },
                  { input: "", parts: [] as PromptInfo["parts"] },
                )
              })()
              const id = result.data?.id
              if (id) {
                route.navigate({
                  sessionID: id,
                  type: "session",
                  initialPrompt,
                })
              }
              dialog.clear()
            })()
          },
        },
      ]}
    />
  )
}
