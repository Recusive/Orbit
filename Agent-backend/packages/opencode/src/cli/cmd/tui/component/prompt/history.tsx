import { appendFile, writeFile } from "fs/promises"
import path from "path"

import { createStore, produce, unwrap } from "solid-js/store"

import { createSimpleContext } from "../../context/helper"

import type { AgentPart, FilePart, TextPart } from "@opencode-ai/sdk/v2"

import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export interface PromptInfo {
  input: string
  mode?: "normal" | "shell"
  parts: (
    | Omit<FilePart, "id" | "messageID" | "sessionID">
    | Omit<AgentPart, "id" | "messageID" | "sessionID">
    | (Omit<TextPart, "id" | "messageID" | "sessionID"> & {
        source?: {
          text: {
            start: number
            end: number
            value: string
          }
        }
      })
  )[]
}

const MAX_HISTORY_ENTRIES = 50

const _historyContext = createSimpleContext({
  name: "PromptHistory",
  init: () => {
    const historyPath = path.join(Global.Path.state, "prompt-history.jsonl")

    const [store, setStore] = createStore({
      index: 0,
      history: [] as PromptInfo[],
    })

    void (async (): Promise<void> => {
      const text = await Filesystem.readText(historyPath).catch(() => "")
      const lines = text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as PromptInfo
          } catch {
            return null
          }
        })
        .filter((line): line is PromptInfo => line !== null)
        .slice(-MAX_HISTORY_ENTRIES)

      setStore("history", lines)

      // Rewrite file with only valid entries to self-heal corruption
      if (lines.length > 0) {
        const content = lines.map((line) => JSON.stringify(line)).join("\n") + "\n"
        writeFile(historyPath, content).catch(() => { /* noop */ })
      }
    })()

    return {
      move(direction: 1 | -1, input: string): PromptInfo | undefined {
        if (store.history.length === 0) return undefined
        const current = store.history.at(store.index)
        if (!current) return undefined
        if (current.input !== input && input.length > 0) return undefined
        setStore(
          produce((draft) => {
            const next = store.index + direction
            if (Math.abs(next) > store.history.length) return
            if (next > 0) return
            draft.index = next
          }),
        )
        if (store.index === 0)
          return {
            input: "",
            parts: [],
          }
        return store.history.at(store.index)
      },
      append(item: PromptInfo): void {
        const entry = structuredClone(unwrap(item))
        const willTrim = store.history.length + 1 > MAX_HISTORY_ENTRIES
        setStore(
          produce((draft) => {
            draft.history.push(entry)
            if (draft.history.length > MAX_HISTORY_ENTRIES) {
              draft.history = draft.history.slice(-MAX_HISTORY_ENTRIES)
            }
            draft.index = 0
          }),
        )

        if (willTrim) {
          const content = store.history.map((line) => JSON.stringify(line)).join("\n") + "\n"
          writeFile(historyPath, content).catch(() => { /* noop */ })
          return
        }

        appendFile(historyPath, JSON.stringify(entry) + "\n").catch(() => { /* noop */ })
      },
    }
  },
})
export const usePromptHistory = (): ReturnType<typeof _historyContext.use> => _historyContext.use()
export const PromptHistoryProvider = _historyContext.provider
