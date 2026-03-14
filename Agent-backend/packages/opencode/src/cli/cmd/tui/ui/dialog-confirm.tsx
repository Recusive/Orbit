import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { For } from "solid-js"
import { createStore } from "solid-js/store"

import { useTheme } from "../context/theme"

import { useDialog } from "./dialog"

import type { DialogContext } from "./dialog"
import type { JSX } from "solid-js"

import { Locale } from "@/util/locale"

export interface DialogConfirmProps {
  title: string
  message: string
  onConfirm?: () => void
  onCancel?: () => void
}

export function DialogConfirm(props: DialogConfirmProps): JSX.Element {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "confirm" as "confirm" | "cancel",
  })

  useKeyboard((evt) => {
    if (evt.name === "return") {
      if (store.active === "confirm") props.onConfirm?.()
      if (store.active === "cancel") props.onCancel?.()
      dialog.clear()
    }

    if (evt.name === "left" || evt.name === "right") {
      setStore("active", store.active === "confirm" ? "cancel" : "confirm")
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text
          fg={theme.textMuted}
          onMouseUp={() => {
            dialog.clear()
          }}
        >
          esc
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>{props.message}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <For each={["cancel", "confirm"]}>
          {(key) => (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={key === store.active ? theme.primary : undefined}
              onMouseUp={(_evt) => {
                if (key === "confirm") props.onConfirm?.()
                if (key === "cancel") props.onCancel?.()
                dialog.clear()
              }}
            >
              <text fg={key === store.active ? theme.selectedListItemText : theme.textMuted}>
                {Locale.titlecase(key)}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

DialogConfirm.show = (dialog: DialogContext, title: string, message: string): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
        <DialogConfirm
          title={title}
          message={message}
          onConfirm={() => {
            resolve(true)
          }}
          onCancel={() => {
            resolve(false)
          }}
        />
      ),
      () => {
        resolve(false)
      },
    )
  })
}
