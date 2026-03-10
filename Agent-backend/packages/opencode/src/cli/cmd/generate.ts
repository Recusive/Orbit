import { Server } from "../../server/server"

import type { CommandModule } from "yargs"

export const GenerateCommand = {
  command: "generate",
  handler: async () => {
    const specs = await Server.openapi()
    for (const item of Object.values(specs.paths as Record<string, Record<string, unknown>>)) {
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method] as Record<string, unknown> | undefined
        if (operation?.operationId === undefined) continue
        const opId = operation.operationId as string
        operation["x-codeSamples"] = [
          {
            lang: "js",
            source: [
              `import { createOrbitClient } from "@opencode-ai/sdk`,
              ``,
              `const client = createOrbitClient()`,
              `await client.${opId}({`,
              `  ...`,
              `})`,
            ].join("\n"),
          },
        ]
      }
    }
    const json = JSON.stringify(specs, null, 2)

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  },
} satisfies CommandModule
