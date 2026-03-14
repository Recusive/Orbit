import { appendFile, writeFile } from "fs/promises"
import path from "path"

import { createStore, produce, unwrap } from "solid-js/store"

import { createSimpleContext } from "../../context/helper"

import type { PromptInfo } from "./history"

import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export interface StashEntry {
  input: string
  parts: PromptInfo["parts"]
  timestamp: number
}

const MAX_STASH_ENTRIES = 50

const _stashContext = createSimpleContext({
  name: "PromptStash",
  init: () => {
    const stashPath = path.join(Global.Path.state, "prompt-stash.jsonl")

    const [store, setStore] = createStore({
      entries: [] as StashEntry[],
    })

    void (async (): Promise<void> => {
      const text = await Filesystem.readText(stashPath).catch(() => "")
      const lines = text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as StashEntry
          } catch {
            return null
          }
        })
        .filter((line): line is StashEntry => line !== null)
        .slice(-MAX_STASH_ENTRIES)

      setStore("entries", lines)

      // Rewrite file with only valid entries to self-heal corruption
      if (lines.length > 0) {
        const content = lines.map((line) => JSON.stringify(line)).join("\n") + "\n"
        writeFile(stashPath, content).catch(() => {
          /* noop */
        })
      }
    })()

    return {
      list(): StashEntry[] {
        return store.entries
      },
      push(entry: Omit<StashEntry, "timestamp">): void {
        const stash = structuredClone(unwrap({ ...entry, timestamp: Date.now() }))
        const willTrim = store.entries.length + 1 > MAX_STASH_ENTRIES
        setStore(
          produce((draft) => {
            draft.entries.push(stash)
            if (draft.entries.length > MAX_STASH_ENTRIES) {
              draft.entries = draft.entries.slice(-MAX_STASH_ENTRIES)
            }
          }),
        )

        if (willTrim) {
          const content = store.entries.map((line) => JSON.stringify(line)).join("\n") + "\n"
          writeFile(stashPath, content).catch(() => {
            /* noop */
          })
          return
        }

        appendFile(stashPath, JSON.stringify(stash) + "\n").catch(() => {
          /* noop */
        })
      },
      pop(): StashEntry | undefined {
        if (store.entries.length === 0) return undefined
        const entry = store.entries[store.entries.length - 1]
        setStore(
          produce((draft) => {
            draft.entries.pop()
          }),
        )
        const content =
          store.entries.length > 0 ? store.entries.map((line) => JSON.stringify(line)).join("\n") + "\n" : ""
        writeFile(stashPath, content).catch(() => {
          /* noop */
        })
        return entry
      },
      remove(index: number): void {
        if (index < 0 || index >= store.entries.length) return
        setStore(
          produce((draft) => {
            draft.entries.splice(index, 1)
          }),
        )
        const content =
          store.entries.length > 0 ? store.entries.map((line) => JSON.stringify(line)).join("\n") + "\n" : ""
        writeFile(stashPath, content).catch(() => {
          /* noop */
        })
      },
    }
  },
})
export const usePromptStash = (): ReturnType<typeof _stashContext.use> => _stashContext.use()
export const PromptStashProvider = _stashContext.provider
