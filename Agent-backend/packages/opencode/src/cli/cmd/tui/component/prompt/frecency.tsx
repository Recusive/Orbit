import { appendFile, writeFile } from "fs/promises"
import path from "path"

import { createStore } from "solid-js/store"

import { createSimpleContext } from "../../context/helper"

import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

function calculateFrecency(entry?: { frequency: number; lastOpen: number }): number {
  if (!entry) return 0
  const daysSince = (Date.now() - entry.lastOpen) / 86400000 // ms per day
  const weight = 1 / (1 + daysSince)
  return entry.frequency * weight
}

const MAX_FRECENCY_ENTRIES = 1000

const _frecencyContext = createSimpleContext({
  name: "Frecency",
  init: (): {
    getFrecency: (filePath: string) => number
    updateFrecency: (filePath: string) => void
    data: () => Record<string, { frequency: number; lastOpen: number }>
  } => {
    const frecencyPath = path.join(Global.Path.state, "frecency.jsonl")

    const [store, setStore] = createStore({
      data: {} as Record<string, { frequency: number; lastOpen: number }>,
    })

    void (async (): Promise<void> => {
      const text = await Filesystem.readText(frecencyPath).catch(() => "")
      const lines = text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { path: string; frequency: number; lastOpen: number }
          } catch {
            return null
          }
        })
        .filter((line): line is { path: string; frequency: number; lastOpen: number } => line !== null)

      const latest = lines.reduce<Record<string, { path: string; frequency: number; lastOpen: number }>>(
        (acc, entry) => {
          acc[entry.path] = entry
          return acc
        },
        {},
      )

      const sorted = Object.values(latest)
        .sort((a, b) => b.lastOpen - a.lastOpen)
        .slice(0, MAX_FRECENCY_ENTRIES)

      setStore(
        "data",
        Object.fromEntries(
          sorted.map((entry) => [entry.path, { frequency: entry.frequency, lastOpen: entry.lastOpen }]),
        ),
      )

      if (sorted.length > 0) {
        const content = sorted.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
        writeFile(frecencyPath, content).catch(() => {
          /* noop */
        })
      }
    })()

    function updateFrecency(filePath: string): void {
      const absolutePath = path.resolve(process.cwd(), filePath)
      const newEntry = {
        frequency: store.data[absolutePath].frequency + 1,
        lastOpen: Date.now(),
      }
      setStore("data", absolutePath, newEntry)
      appendFile(frecencyPath, JSON.stringify({ path: absolutePath, ...newEntry }) + "\n").catch(() => {
        /* noop */
      })

      if (Object.keys(store.data).length > MAX_FRECENCY_ENTRIES) {
        const sorted = Object.entries(store.data)
          .sort(([, a], [, b]) => b.lastOpen - a.lastOpen)
          .slice(0, MAX_FRECENCY_ENTRIES)
        setStore("data", Object.fromEntries(sorted))
        const content = sorted.map(([p, entry]) => JSON.stringify({ path: p, ...entry })).join("\n") + "\n"
        writeFile(frecencyPath, content).catch(() => {
          /* noop */
        })
      }
    }

    return {
      getFrecency: (filePath: string) => calculateFrecency(store.data[path.resolve(process.cwd(), filePath)]),
      updateFrecency,
      data: () => store.data,
    }
  },
})
export const useFrecency = (): ReturnType<typeof _frecencyContext.use> => _frecencyContext.use()
export const FrecencyProvider = _frecencyContext.provider
