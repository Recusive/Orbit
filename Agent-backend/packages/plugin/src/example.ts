import { tool } from "./tool"

import type { Plugin } from "./index"

export const ExamplePlugin: Plugin = () => {
  return Promise.resolve({
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string().describe("foo"),
        },
        execute(args) {
          return Promise.resolve(`Hello ${args.foo}!`)
        },
      }),
    },
  })
}
