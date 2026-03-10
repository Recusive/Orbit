import { createContext, Show, useContext } from "solid-js"

import type { JSX, ParentProps } from "solid-js"

// SolidJS JSX with @opentui/solid produces types that typescript-eslint's strict
// rules flag as unsafe. This helper provides a type-safe boundary for JSX returns.
type SafeJSX = JSX.Element

export function createSimpleContext<T, Props extends Record<string, unknown>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}): {
  provider: (props: ParentProps<Props>) => SafeJSX
  use: () => T
} {
  const ctx = createContext<T>()

  return {
    provider: (props: ParentProps<Props>): SafeJSX => {
      const init = input.init(props)
      const initRecord = init as Record<string, unknown>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
      return (
        <Show when={initRecord.ready === undefined || initRecord.ready === true}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use(): T {
      const value = useContext(ctx)
      if (value === undefined) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
