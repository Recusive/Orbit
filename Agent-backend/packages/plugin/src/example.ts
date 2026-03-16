import { tool } from "./tool.js"

import type { Plugin } from "./index.js"

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
