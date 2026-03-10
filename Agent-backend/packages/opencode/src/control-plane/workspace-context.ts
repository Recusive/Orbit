import { Context } from "../util/context"

interface WorkspaceCtx {
  workspaceID?: string
}

const context = Context.create<WorkspaceCtx>("workspace")

export const WorkspaceContext = {
  provide<R>(input: { workspaceID?: string; fn: () => R }): R {
    return context.provide({ workspaceID: input.workspaceID }, () => {
      return input.fn()
    })
  },

  get workspaceID(): string | undefined {
    try {
      return context.use().workspaceID
    } catch {
      return undefined
    }
  },
}
