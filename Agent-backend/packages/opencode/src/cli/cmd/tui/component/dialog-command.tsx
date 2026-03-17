import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "@tui/context/keybind"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createContext, createMemo, createSignal, onCleanup, useContext } from "solid-js"

import type { KeybindKey } from "@tui/context/keybind"
import type { DialogSelectOption, DialogSelectRef } from "@tui/ui/dialog-select"
import type { Accessor, JSX, ParentProps } from "solid-js"

type Context = ReturnType<typeof init>
const ctx = createContext<Context>()

export interface Slash {
  name: string
  aliases?: string[]
}

export type CommandOption = DialogSelectOption<string> & {
  keybind?: KeybindKey
  suggested?: boolean
  slash?: Slash
  hidden?: boolean
  enabled?: boolean
}

interface SlashEntry {
  display: string
  description: string
  aliases: string[] | undefined
  onSelect: () => void
}

function init(): {
  trigger: (name: string) => void
  slashes: () => SlashEntry[]
  keybinds: (enabled: boolean) => void
  suspended: () => boolean
  show: () => void
  register: (cb: () => CommandOption[]) => void
} {
  const [registrations, setRegistrations] = createSignal<Accessor<CommandOption[]>[]>([])
  const [suspendCount, setSuspendCount] = createSignal(0)
  const dialog = useDialog()
  const keybind = useKeybind()

  const entries = createMemo(() => {
    const all = registrations()
      .flatMap((x) => x())
      .filter(Boolean)
    return all.map((x) => ({
      ...x,
      footer: x.keybind ? keybind.print(x.keybind) : undefined,
    }))
  })

  const isEnabled = (option: CommandOption): boolean => option.enabled !== false
  const isVisible = (option: CommandOption): boolean => isEnabled(option) && !option.hidden

  const visibleOptions = createMemo(() => entries().filter((option) => isVisible(option)))
  const suggestedOptions = createMemo(() =>
    visibleOptions()
      .filter((option) => option.suggested)
      .map((option) => ({
        ...option,
        value: `suggested:${option.value}`,
        category: "Suggested",
      })),
  )
  const suspended = (): boolean => suspendCount() > 0

  useKeyboard((evt) => {
    if (suspended()) return
    if (dialog.stack.length > 0) return
    for (const option of entries()) {
      if (!isEnabled(option)) continue
      if (option.keybind && keybind.match(option.keybind, evt)) {
        evt.preventDefault()
        option.onSelect?.(dialog)
        return
      }
    }
  })

  const result = {
    trigger(name: string): void {
      for (const option of entries()) {
        if (option.value === name) {
          if (!isEnabled(option)) return
          option.onSelect?.(dialog)
          return
        }
      }
    },
    slashes(): SlashEntry[] {
      return visibleOptions().flatMap((option) => {
        const slash = option.slash
        if (!slash) return []
        return {
          display: "/" + slash.name,
          description: option.description ?? option.title,
          aliases: slash.aliases?.map((alias) => "/" + alias),
          onSelect: () => {
            result.trigger(option.value)
          },
        }
      })
    },
    keybinds(enabled: boolean): void {
      setSuspendCount((count) => count + (enabled ? -1 : 1))
    },
    suspended,
    show(): void {
      dialog.replace(() => <DialogCommand options={visibleOptions()} suggestedOptions={suggestedOptions()} />)
    },
    register(cb: () => CommandOption[]): void {
      const results = createMemo(cb)
      setRegistrations((arr) => [results, ...arr])
      onCleanup(() => {
        setRegistrations((arr) => arr.filter((x) => x !== results))
      })
    },
  }
  return result
}

export function useCommandDialog(): Context {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useCommandDialog must be used within a CommandProvider")
  }
  return value
}

export function CommandProvider(props: ParentProps): JSX.Element {
  const value = init()
  const dialog = useDialog()
  const keybind = useKeybind()

  useKeyboard((evt) => {
    if (value.suspended()) return
    if (dialog.stack.length > 0) return
    if (evt.defaultPrevented) return
    if (keybind.match("command_list", evt)) {
      evt.preventDefault()
      value.show()
      return
    }
  })

  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

function DialogCommand(props: { options: CommandOption[]; suggestedOptions: CommandOption[] }): JSX.Element {
  let ref: DialogSelectRef<string> | undefined
  const list = (): CommandOption[] => {
    if (ref?.filter) return props.options
    return [...props.suggestedOptions, ...props.options]
  }
  return <DialogSelect ref={(r) => (ref = r)} title="Commands" options={list()} />
}
