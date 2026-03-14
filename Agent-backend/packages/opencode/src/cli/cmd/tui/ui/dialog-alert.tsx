import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"

import { useTheme } from "../context/theme"

import { useDialog } from "./dialog"

import type { DialogContext } from "./dialog"
import type { JSX } from "solid-js"

export interface DialogAlertProps {
  title: string
  message: string
  onConfirm?: () => void
}

export function DialogAlert(props: DialogAlertProps): JSX.Element {
  const dialog = useDialog()
  const { theme } = useTheme()

  useKeyboard((evt) => {
    if (evt.name === "return") {
      props.onConfirm?.()
      dialog.clear()
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
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.primary}
          onMouseUp={() => {
            props.onConfirm?.()
            dialog.clear()
          }}
        >
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}

DialogAlert.show = (dialog: DialogContext, title: string, message: string): Promise<void> => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
      () => (
        <DialogAlert
          title={title}
          message={message}
          onConfirm={() => {
            resolve()
          }}
        />
      ),
      () => {
        resolve()
      },
    )
  })
}
