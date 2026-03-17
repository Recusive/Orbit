import { TextAttributes } from "@opentui/core"
import { useLocal } from "@tui/context/local"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { DialogSelect   } from "@tui/ui/dialog-select"
import { map, pipe, entries, sortBy } from "remeda"
import { createMemo, createSignal } from "solid-js"

import { useTheme } from "../context/theme"

import type {DialogSelectRef, DialogSelectOption} from "@tui/ui/dialog-select";
import type { JSX } from "solid-js"

import { Keybind } from "@/util/keybind"


function Status(props: { enabled: boolean; loading: boolean }): JSX.Element {
  const { theme } = useTheme()
  if (props.loading) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
    return <span style={{ fg: theme.textMuted }}>⋯ Loading</span>
  }
  if (props.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

export function DialogMcp(): JSX.Element {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<string | null>(null)

  const options = createMemo(() => {
    // Track sync data and loading state to trigger re-render when they change
    const mcpData = sync.data.mcp
    const loadingMcp = loading()

    return pipe(
      mcpData,
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => ({
        value: name,
        title: name,
        description: status.status === "failed" ? "failed" : status.status,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentui JSX types
        footer: <Status enabled={local.mcp.isEnabled(name)} loading={loadingMcp === name} />,
        category: undefined,
      })),
    )
  })

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        // Prevent toggling while an operation is already in progress
        if (loading() !== null) return

        setLoading(option.value)
        try {
          await local.mcp.toggle(option.value)
          // Refresh MCP status from server
          const status = await sdk.client.mcp.status()
          if (status.data) {
            sync.set("mcp", status.data)
          } else {
            console.error("Failed to refresh MCP status: no data returned")
          }
        } catch (error) {
          console.error("Failed to toggle MCP:", error)
        } finally {
          setLoading(null)
        }
      },
    },
  ])

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <DialogSelect
      ref={setRef}
      title="MCPs"
      options={options()}
      keybind={keybinds()}
      onSelect={(_option) => {
        // Don't close on select, only on escape
      }}
    />
  )
}
