import { createMemo } from "solid-js"

import { useKeybind } from "../context/keybind"

import type { Keybind } from "@/util/keybind"
import type { KeyBinding } from "@opentui/core"
import type { Accessor } from "solid-js"

const TEXTAREA_ACTIONS = [
  "submit",
  "newline",
  "move-left",
  "move-right",
  "move-up",
  "move-down",
  "select-left",
  "select-right",
  "select-up",
  "select-down",
  "line-home",
  "line-end",
  "select-line-home",
  "select-line-end",
  "visual-line-home",
  "visual-line-end",
  "select-visual-line-home",
  "select-visual-line-end",
  "buffer-home",
  "buffer-end",
  "select-buffer-home",
  "select-buffer-end",
  "delete-line",
  "delete-to-line-end",
  "delete-to-line-start",
  "backspace",
  "delete",
  "undo",
  "redo",
  "word-forward",
  "word-backward",
  "select-word-forward",
  "select-word-backward",
  "delete-word-forward",
  "delete-word-backward",
] as const

function mapTextareaKeybindings(
  keybinds: Record<string, Keybind.Info[]>,
  action: (typeof TEXTAREA_ACTIONS)[number],
): KeyBinding[] {
  const configKey = `input_${action.replace(/-/g, "_")}`
  const bindings = keybinds[configKey]
  return bindings.map((binding) => ({
    name: binding.name,
    ctrl: binding.ctrl,
    meta: binding.meta,
    shift: binding.shift,
    super: binding.super,
    action,
  }))
}

export function useTextareaKeybindings(): Accessor<KeyBinding[]> {
  const keybind = useKeybind()

  return createMemo(() => {
    const keybinds = keybind.all

    return [
      { name: "return", action: "submit" },
      { name: "return", meta: true, action: "newline" },
      ...TEXTAREA_ACTIONS.flatMap((action) => mapTextareaKeybindings(keybinds, action)),
    ] satisfies KeyBinding[]
  })
}
