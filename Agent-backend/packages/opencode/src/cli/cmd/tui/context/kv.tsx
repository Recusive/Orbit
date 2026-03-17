import path from "path"

import { createSignal  } from "solid-js"
import { createStore } from "solid-js/store"

import { createSimpleContext } from "./helper"


import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"



export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false)
    const [store, setStore] = createStore<Record<string, unknown>>()
    const filePath = path.join(Global.Path.state, "kv.json")

    Filesystem.readJson(filePath)
      .then((x) => {
        setStore(x as Record<string, unknown>)
      })
      .catch(() => { /* noop */ })
      .finally(() => {
        setReady(true)
      })

    const result = {
      get ready() {
        return ready()
      },
      get store() {
        return store
      },
      signal<T>(name: string, defaultValue: T): readonly [() => T, (next: T | ((prev: T) => T)) => void] {
        if (store[name] === undefined) setStore(name, defaultValue as unknown)
        return [
          function (): T {
            return result.get<T>(name)
          },
          function setter(next: T | ((prev: T) => T)): void {
            result.set(name, next)
          },
        ] as const
      },
      get<T = unknown>(key: string, defaultValue?: T): T {
        return (store[key] as T) ?? (defaultValue as T)
      },
      set(key: string, value: unknown): void {
        setStore(key, value)
        void Filesystem.writeJson(filePath, store)
      },
    }
    return result
  },
})
