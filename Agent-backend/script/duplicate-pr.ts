#!/usr/bin/env bun

import path from "path"
import { parseArgs } from "util"

import { createOpencode } from "@opencode-ai/sdk"
import { pathToFileURL } from "bun"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      file: { type: "string", short: "f" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Usage: bun script/duplicate-pr.ts [options] <message>

Options:
  -f, --file <path>   File to attach to the prompt
  -h, --help          Show this help message

Examples:
  bun script/duplicate-pr.ts -f pr_info.txt "Check the attached file for PR details"
`)
    process.exit(0)
  }

  const message = positionals.join(" ")
  if (message === "") {
    console.error("Error: message is required")
    process.exit(1)
  }

  const opencode = await createOpencode({ port: 0 })

  try {
    const parts: ({ type: "text"; text: string } | { type: "file"; url: string; filename: string; mime: string })[] =
      []

    if (values.file !== undefined) {
      const resolved = path.resolve(process.cwd(), values.file)
      const file = Bun.file(resolved)
      if (!(await file.exists())) {
        console.error(`Error: file not found: ${values.file}`)
        process.exit(1)
      }
      parts.push({
        type: "file",
        url: pathToFileURL(resolved).href,
        filename: path.basename(resolved),
        mime: "text/plain",
      })
    }

    parts.push({ type: "text", text: message })

    const session = await opencode.client.session.create()
    const sessionId = session.data?.id
    if (sessionId === undefined) {
      throw new Error("Failed to create session")
    }
    const result = await opencode.client.session
      .prompt({
        path: { id: sessionId },
        body: {
          agent: "duplicate-pr",
          parts,
        },
        signal: AbortSignal.timeout(120_000),
      })
      .then((x) => x.data?.parts.find((y) => y.type === "text")?.text ?? "")

    console.log(result.trim())
  } finally {
    opencode.server.close()
  }
}

void main()
