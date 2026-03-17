import { pathToFileURL } from "bun"

import { createOpencodeClient, createOpencodeServer } from "@orbit.build/sdk"

const server = await createOpencodeServer()
const client = createOpencodeClient({ baseUrl: server.url })

const input = await Array.fromAsync(new Bun.Glob("packages/core/*.ts").scan())

const tasks: Promise<unknown>[] = []
for (const file of input) {
  // eslint-disable-next-line no-console -- example script: console output is intentional
  console.log("processing", file)
  const session = await client.session.create()
  tasks.push(
    client.session.prompt({
      path: { id: session.data.id },
      body: {
        parts: [
          {
            type: "file",
            mime: "text/plain",
            url: pathToFileURL(file).href,
          },
          {
            type: "text",
            text: `Write tests for every public function in this file.`,
          },
        ],
      },
    }),
  )
  // eslint-disable-next-line no-console -- example script: console output is intentional
  console.log("done", file)
}

await Promise.all(
  input.map(async (file) => {
    const session = await client.session.create()
    // eslint-disable-next-line no-console -- example script: console output is intentional
    console.log("processing", file)
    await client.session.prompt({
      path: { id: session.data.id },
      body: {
        parts: [
          {
            type: "file",
            mime: "text/plain",
            url: pathToFileURL(file).href,
          },
          {
            type: "text",
            text: `Write tests for every public function in this file.`,
          },
        ],
      },
    })
    // eslint-disable-next-line no-console -- example script: console output is intentional
    console.log("done", file)
  }),
)
