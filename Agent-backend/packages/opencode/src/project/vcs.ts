import z from "zod"

import { Instance } from "./instance"

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { FileWatcher } from "@/file/watcher"
import { git } from "@/util/git"
import { Log } from "@/util/log"

const log = Log.create({ service: "vcs" })

export namespace Vcs {
  export const Event = {
    BranchUpdated: BusEvent.define(
      "vcs.branch.updated",
      z.object({
        branch: z.string().optional(),
      }),
    ),
  }

  export const Info = z
    .object({
      branch: z.string(),
    })
    .meta({
      ref: "VcsInfo",
    })
  export type Info = z.infer<typeof Info>

  async function currentBranch(): Promise<string | undefined> {
    const result = await git(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: Instance.worktree,
    })
    if (result.exitCode !== 0) return undefined
    const text = result.text().trim()
    if (!text) return undefined
    return text
  }

  interface VcsState {
    branch(): string | undefined
    unsubscribe: (() => void) | undefined
  }

  const state = Instance.state(
    async (): Promise<VcsState> => {
      if (Instance.project.vcs !== "git") {
        return { branch: (): string | undefined => undefined, unsubscribe: undefined }
      }
      let current = await currentBranch()
      log.info("initialized", { branch: current })

      const unsubscribe = Bus.subscribe(FileWatcher.Event.Updated, (evt) => {
        if (evt.properties.file.endsWith("HEAD")) return
        void currentBranch().then((next) => {
          if (next !== current) {
            log.info("branch changed", { from: current, to: next })
            current = next
            void Bus.publish(Event.BranchUpdated, { branch: next })
          }
        })
      })

      return {
        branch: (): string | undefined => current,
        unsubscribe,
      }
    },
    (state): Promise<void> => {
      state.unsubscribe?.()
      return Promise.resolve()
    },
  )

  export async function init(): Promise<void> {
    await state()
  }

  export async function branch(): Promise<string | undefined> {
    const s = await state()
    return s.branch()
  }
}
