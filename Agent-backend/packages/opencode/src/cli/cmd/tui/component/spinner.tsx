import { Show } from "solid-js"

import { useKV } from "../context/kv"
import { useTheme } from "../context/theme"

import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import "opentui-spinner/solid"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }): JSX.Element {
  const { theme } = useTheme()
  const kv = useKV()
  const color = (): RGBA => props.color ?? theme.textMuted
  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentui JSX types resolve to error/any
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>⋯ {props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={frames} interval={80} color={color()} />
        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentui JSX types */}
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}
