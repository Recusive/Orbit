import z from "zod"

import { SessionID } from "../session/schema"
import { Todo } from "../session/todo"

import DESCRIPTION_WRITE from "./todowrite.txt"
import { Tool } from "./tool"

export const TodoWriteTool = Tool.define("todowrite", {
  description: DESCRIPTION_WRITE,
  parameters: z.object({
    todos: z.array(z.object(Todo.Info.shape)).describe("The updated todo list"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "todowrite",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    Todo.update({
      sessionID: SessionID.make(ctx.sessionID),
      todos: params.todos,
    })
    return {
      title: `${String(params.todos.filter((x) => x.status !== "completed").length)} todos`,
      output: JSON.stringify(params.todos, null, 2),
      metadata: {
        todos: params.todos,
      },
    }
  },
})

export const TodoReadTool = Tool.define("todoread", {
  description: "Use this tool to read your todo list",
  parameters: z.object({}),
  async execute(_params, ctx) {
    await ctx.ask({
      permission: "todoread",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const todos = Todo.get(SessionID.make(ctx.sessionID))
    return {
      title: `${String(todos.filter((x) => x.status !== "completed").length)} todos`,
      metadata: {
        todos,
      },
      output: JSON.stringify(todos, null, 2),
    }
  },
})
