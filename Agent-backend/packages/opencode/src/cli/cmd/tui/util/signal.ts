import { debounce } from "@solid-primitives/scheduled"
import { createSignal } from "solid-js"

import type { Scheduled } from "@solid-primitives/scheduled"
import type { Accessor } from "solid-js"

export function createDebouncedSignal<T>(value: T, ms: number): [Accessor<T>, Scheduled<[value: T]>] {
  const [get, set] = createSignal(value)
  return [get, debounce((v: T) => set(() => v), ms)]
}
