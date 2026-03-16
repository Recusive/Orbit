import { MouseButton, RGBA } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { Selection } from "@tui/util/selection"
import { batch, createContext, Show, useContext } from "solid-js"
import { createStore } from "solid-js/store"

import { useToast } from "./toast"

import type { Renderable } from "@opentui/core"
import type { JSX, ParentProps } from "solid-js"

import { Flag } from "@/flag/flag"

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large"
    onClose: () => void
  }>,
): JSX.Element {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  let dismiss = false

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
  return (
    <box
      onMouseDown={() => {
        dismiss = Boolean(renderer.getSelection())
      }}
      onMouseUp={() => {
        if (dismiss) {
          dismiss = false
          return
        }
        props.onClose()
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={(e) => {
          dismiss = false
          e.stopPropagation()
        }}
        width={props.size === "large" ? 80 : 60}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
      >
        {props.children}
      </box>
    </box>
  )
}

function init(): DialogContext {
  const [store, setStore] = createStore({
    stack: [] as {
      element: (() => JSX.Element) | JSX.Element
      onClose?: () => void
    }[],
    size: "medium" as "medium" | "large",
  })

  const renderer = useRenderer()

  useKeyboard((evt) => {
    if (store.stack.length === 0) return
    if (evt.defaultPrevented) return
    if ((evt.name === "escape" || (evt.ctrl && evt.name === "c")) && renderer.getSelection()) return
    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      const current = store.stack.at(-1)
      if (current) current.onClose?.()
      setStore("stack", store.stack.slice(0, -1))
      evt.preventDefault()
      evt.stopPropagation()
      refocus()
    }
  })

  let focus: Renderable | null
  function refocus(): void {
    setTimeout(() => {
      if (!focus) return
      if (focus.isDestroyed) return
      function find(item: Renderable): boolean {
        for (const child of item.getChildren()) {
          if (child === focus) return true
          if (find(child)) return true
        }
        return false
      }
      const found = find(renderer.root)
      if (!found) return
      focus.focus()
    }, 1)
  }

  return {
    clear() {
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      batch(() => {
        setStore("size", "medium")
        setStore("stack", [])
      })
      refocus()
    },
    replace(input: (() => JSX.Element) | JSX.Element, onClose?: () => void) {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        focus?.blur()
      }
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      setStore("size", "medium")
      setStore("stack", [
        {
          element: input,
          onClose,
        },
      ])
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large") {
      setStore("size", size)
    },
  }
}

export interface DialogContext {
  clear: () => void
  replace: (input: (() => JSX.Element) | JSX.Element, onClose?: () => void) => void
  readonly stack: { element: (() => JSX.Element) | JSX.Element; onClose?: () => void }[]
  readonly size: "medium" | "large"
  setSize: (size: "medium" | "large") => void
}

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps): JSX.Element {
  const value = init()
  const renderer = useRenderer()
  const toast = useToast()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
  return (
    <ctx.Provider value={value}>
      {props.children}
      <box
        position="absolute"
        onMouseDown={(evt) => {
          if (!Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
          if (evt.button !== (MouseButton.RIGHT as number)) return

          if (!Selection.copy(renderer, toast)) return
          evt.preventDefault()
          evt.stopPropagation()
        }}
        onMouseUp={
          !Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? () => Selection.copy(renderer, toast) : undefined
        }
      >
        <Show when={value.stack.length}>
          <Dialog
            onClose={() => {
              value.clear()
            }}
            size={value.size}
          >
            {(() => {
              const element = value.stack.at(-1)?.element
              return typeof element === "function" ? element() : element
            })()}
          </Dialog>
        </Show>
      </box>
    </ctx.Provider>
  )
}

export function useDialog(): DialogContext {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
