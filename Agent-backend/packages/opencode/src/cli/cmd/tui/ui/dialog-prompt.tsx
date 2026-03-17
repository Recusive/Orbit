import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { onMount } from "solid-js"

import { useTheme } from "../context/theme"

import { useDialog } from "./dialog"

import type { DialogContext } from "./dialog"
import type { TextareaRenderable } from "@opentui/core"
import type { JSX } from "solid-js"

export interface DialogPromptProps {
  title: string
  description?: () => JSX.Element
  placeholder?: string
  value?: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps): JSX.Element {
  const dialog = useDialog()
  const { theme } = useTheme()
  let textarea: TextareaRenderable

  useKeyboard((evt) => {
    if (evt.name === "return") {
      props.onConfirm?.(textarea.plainText)
    }
  })

  onMount(() => {
    dialog.setSize("medium")
    setTimeout(() => {
      if (textarea.isDestroyed) return
      textarea.focus()
    }, 1)
    textarea.gotoLineEnd()
  })

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
      <box gap={1}>
        {props.description}
        <textarea
          onSubmit={() => {
            props.onConfirm?.(textarea.plainText)
          }}
          height={3}
          keyBindings={[{ name: "return", action: "submit" }]}
          ref={(val: TextareaRenderable) => (textarea = val)}
          initialValue={props.value}
          placeholder={props.placeholder ?? "Enter text"}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.text}
        />
      </box>
      <box paddingBottom={1} gap={1} flexDirection="row">
        <text fg={theme.text}>
          enter <span style={{ fg: theme.textMuted }}>submit</span>
        </text>
      </box>
    </box>
  )
}

DialogPrompt.show = (
  dialog: DialogContext,
  title: string,
  options?: Omit<DialogPromptProps, "title">,
): Promise<string | null> => {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title={title}
          {...options}
          onConfirm={(value) => {
            resolve(value)
          }}
          onCancel={() => {
            resolve(null)
          }}
        />
      ),
      () => {
        resolve(null)
      },
    )
  })
}
