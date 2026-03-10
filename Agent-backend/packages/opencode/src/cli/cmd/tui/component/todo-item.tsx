import { useTheme } from "../context/theme"

import type { JSX } from "solid-js"

export interface TodoItemProps {
  status: string
  content: string
}

export function TodoItem(props: TodoItemProps): JSX.Element {
  const { theme } = useTheme()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <box flexDirection="row" gap={0}>
      <text
        flexShrink={0}
        style={{
          fg: props.status === "in_progress" ? theme.warning : theme.textMuted,
        }}
      >
        [{props.status === "completed" ? "✓" : props.status === "in_progress" ? "•" : " "}]{" "}
      </text>
      <text
        flexGrow={1}
        wrapMode="word"
        style={{
          fg: props.status === "in_progress" ? theme.warning : theme.textMuted,
        }}
      >
        {props.content}
      </text>
    </box>
  )
}
