import { EOL } from "os"
import path from "path"
import { pathToFileURL } from "url"

import { createOpencodeClient } from "@opencode-ai/sdk/v2"

import { Agent } from "../../agent/agent"
import { Flag } from "../../flag/flag"
import { Provider } from "../../provider/provider"
import { Server } from "../../server/server"
import { Filesystem } from "../../util/filesystem"
import { Locale } from "../../util/locale"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"

import { cmd } from "./cmd"

import type { PermissionNext } from "../../permission/next"
import type { BashTool } from "../../tool/bash"
import type { CodeSearchTool } from "../../tool/codesearch"
import type { EditTool } from "../../tool/edit"
import type { GlobTool } from "../../tool/glob"
import type { GrepTool } from "../../tool/grep"
import type { ListTool } from "../../tool/ls"
import type { ReadTool } from "../../tool/read"
import type { SkillTool } from "../../tool/skill"
import type { TaskTool } from "../../tool/task"
import type { TodoWriteTool } from "../../tool/todo"
import type { Tool } from "../../tool/tool"
import type { WebFetchTool } from "../../tool/webfetch"
import type { WebSearchTool } from "../../tool/websearch"
import type { WriteTool } from "../../tool/write"
import type { OpencodeClient, ToolPart } from "@opencode-ai/sdk/v2"
import type { Argv } from "yargs"

interface ToolProps<T extends Tool.Info> {
  input: Tool.InferParameters<T>
  metadata: Tool.InferMetadata<T>
  part: ToolPart
}

function props<T extends Tool.Info>(part: ToolPart): ToolProps<T> {
  const state = part.state
  return {
    input: state.input as Tool.InferParameters<T>,
    metadata: ("metadata" in state ? state.metadata : {}) as Tool.InferMetadata<T>,
    part,
  }
}

interface Inline {
  icon: string
  title: string
  description?: string
}

function inline(info: Inline): void {
  const suffix = info.description ? UI.Style.TEXT_DIM + ` ${info.description}` + UI.Style.TEXT_NORMAL : ""
  UI.println(UI.Style.TEXT_NORMAL + info.icon, UI.Style.TEXT_NORMAL + info.title + suffix)
}

function block(info: Inline, output?: string): void {
  UI.empty()
  inline(info)
  if (!output?.trim()) return
  UI.println(output)
  UI.empty()
}

function fallback(part: ToolPart): void {
  const state = part.state
  const input = "input" in state ? state.input : undefined
  const title =
    ("title" in state && state.title ? state.title : undefined) ??
    (input && typeof input === "object" && Object.keys(input).length > 0 ? JSON.stringify(input) : "Unknown")
  inline({
    icon: "⚙",
    title: `${part.tool} ${title}`,
  })
}

function glob(info: ToolProps<typeof GlobTool>): void {
  const root = info.input.path ?? ""
  const title = `Glob "${info.input.pattern}"`
  const suffix = root ? `in ${normalizePath(root)}` : ""
  const num = info.metadata.count
  const description = `${suffix}${suffix ? " · " : ""}${String(num)} ${num === 1 ? "match" : "matches"}`
  inline({
    icon: "✱",
    title,
    ...(description && { description }),
  })
}

function grep(info: ToolProps<typeof GrepTool>): void {
  const root = info.input.path ?? ""
  const title = `Grep "${info.input.pattern}"`
  const suffix = root ? `in ${normalizePath(root)}` : ""
  const num = info.metadata.matches
  const description = `${suffix}${suffix ? " · " : ""}${String(num)} ${num === 1 ? "match" : "matches"}`
  inline({
    icon: "✱",
    title,
    ...(description && { description }),
  })
}

function list(info: ToolProps<typeof ListTool>): void {
  const dir = info.input.path ? normalizePath(info.input.path) : ""
  inline({
    icon: "→",
    title: dir ? `List ${dir}` : "List",
  })
}

function read(info: ToolProps<typeof ReadTool>): void {
  const file = normalizePath(info.input.filePath)
  const pairs = Object.entries(info.input).filter(([key, value]) => {
    if (key === "filePath") return false
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  })
  const description = pairs.length > 0
    ? `[${pairs.map(([key, value]) => `${key}=${String(value)}`).join(", ")}]`
    : undefined
  inline({
    icon: "→",
    title: `Read ${file}`,
    ...(description && { description }),
  })
}

function write(info: ToolProps<typeof WriteTool>): void {
  block(
    {
      icon: "←",
      title: `Write ${normalizePath(info.input.filePath)}`,
    },
    info.part.state.status === "completed" ? info.part.state.output : undefined,
  )
}

function webfetch(info: ToolProps<typeof WebFetchTool>): void {
  inline({
    icon: "%",
    title: `WebFetch ${info.input.url}`,
  })
}

function edit(info: ToolProps<typeof EditTool>): void {
  const title = normalizePath(info.input.filePath)
  const diff = info.metadata.diff
  block(
    {
      icon: "←",
      title: `Edit ${title}`,
    },
    diff,
  )
}

function codesearch(info: ToolProps<typeof CodeSearchTool>): void {
  inline({
    icon: "◇",
    title: `Exa Code Search "${info.input.query}"`,
  })
}

function websearch(info: ToolProps<typeof WebSearchTool>): void {
  inline({
    icon: "◈",
    title: `Exa Web Search "${info.input.query}"`,
  })
}

function task(info: ToolProps<typeof TaskTool>): void {
  const input = info.part.state.input
  const status = info.part.state.status
  const subagent =
    typeof input.subagent_type === "string" && input.subagent_type.trim().length > 0 ? input.subagent_type : "unknown"
  const agent = Locale.titlecase(subagent)
  const desc =
    typeof input.description === "string" && input.description.trim().length > 0 ? input.description : undefined
  const icon = status === "error" ? "✗" : status === "running" ? "•" : "✓"
  const name = desc ?? `${agent} Task`
  inline({
    icon,
    title: name,
    description: desc ? `${agent} Agent` : undefined,
  })
}

function skill(info: ToolProps<typeof SkillTool>): void {
  inline({
    icon: "→",
    title: `Skill "${info.input.name}"`,
  })
}

function bash(info: ToolProps<typeof BashTool>): void {
  const output = info.part.state.status === "completed" ? info.part.state.output.trim() : undefined
  block(
    {
      icon: "$",
      title: info.input.command,
    },
    output,
  )
}

function todo(info: ToolProps<typeof TodoWriteTool>): void {
  block(
    {
      icon: "#",
      title: "Todos",
    },
    info.input.todos.map((item) => `${item.status === "completed" ? "[x]" : "[ ]"} ${item.content}`).join("\n"),
  )
}

function normalizePath(input?: string): string {
  if (!input) return ""
  if (path.isAbsolute(input)) return path.relative(process.cwd(), input) || "."
  return input
}

export const RunCommand = cmd({
  command: "run [message..]",
  describe: "run orbit with a message",
  builder: (yargs: Argv) => {
    return yargs
      .positional("message", {
        describe: "message to send",
        type: "string",
        array: true,
        default: [],
      })
      .option("command", {
        describe: "the command to run, use message for args",
        type: "string",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        describe: "session id to continue",
        type: "string",
      })
      .option("fork", {
        describe: "fork the session before continuing (requires --continue or --session)",
        type: "boolean",
      })
      .option("share", {
        type: "boolean",
        describe: "share the session",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      })
      .option("format", {
        type: "string",
        choices: ["default", "json"],
        default: "default",
        describe: "format: default (formatted) or json (raw JSON events)",
      })
      .option("file", {
        alias: ["f"],
        type: "string",
        array: true,
        describe: "file(s) to attach to message",
      })
      .option("title", {
        type: "string",
        describe: "title for the session (uses truncated prompt if no value provided)",
      })
      .option("attach", {
        type: "string",
        describe: "attach to a running orbit server (e.g., http://localhost:4096)",
      })
      .option("password", {
        alias: ["p"],
        type: "string",
        describe: "basic auth password (defaults to OPENCODE_SERVER_PASSWORD)",
      })
      .option("dir", {
        type: "string",
        describe: "directory to run in, path on remote server if attaching",
      })
      .option("port", {
        type: "number",
        describe: "port for the local server (defaults to random port if no value provided)",
      })
      .option("variant", {
        type: "string",
        describe: "model variant (provider-specific reasoning effort, e.g., high, max, minimal)",
      })
      .option("thinking", {
        type: "boolean",
        describe: "show thinking blocks",
        default: false,
      })
  },
  handler: async (args) => {
    let message = [...args.message, ...(args["--"] ?? [])]
      .map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg))
      .join(" ")

    const directory = (() => {
      if (!args.dir) return undefined
      if (args.attach) return args.dir
      try {
        process.chdir(args.dir)
        return process.cwd()
      } catch {
        UI.error("Failed to change directory to " + args.dir)
        process.exit(1)
      }
    })()

    const files: { type: "file"; url: string; filename: string; mime: string }[] = []
    if (args.file) {
      const fileList = Array.isArray(args.file) ? args.file : [args.file]

      for (const filePath of fileList) {
        const resolvedPath = path.resolve(process.cwd(), filePath)
        if (!Filesystem.exists(resolvedPath)) {
          UI.error(`File not found: ${filePath}`)
          process.exit(1)
        }

        const mime = Filesystem.isDir(resolvedPath) ? "application/x-directory" : "text/plain"

        files.push({
          type: "file",
          url: pathToFileURL(resolvedPath).href,
          filename: path.basename(resolvedPath),
          mime,
        })
      }
    }

    if (!process.stdin.isTTY) message += "\n" + (await Bun.stdin.text())

    if (message.trim().length === 0 && !args.command) {
      UI.error("You must provide a message or a command")
      process.exit(1)
    }

    if (args.fork && !args.continue && !args.session) {
      UI.error("--fork requires --continue or --session")
      process.exit(1)
    }

    const rules: PermissionNext.Ruleset = [
      {
        permission: "question",
        action: "deny",
        pattern: "*",
      },
      {
        permission: "plan_enter",
        action: "deny",
        pattern: "*",
      },
      {
        permission: "plan_exit",
        action: "deny",
        pattern: "*",
      },
    ]

    function title(): string | undefined {
      if (args.title === undefined) return
      if (args.title !== "") return args.title
      return message.slice(0, 50) + (message.length > 50 ? "..." : "")
    }

    async function session(sdk: OpencodeClient): Promise<string | undefined> {
      const baseID = args.continue ? (await sdk.session.list()).data?.find((s) => !s.parentID)?.id : args.session

      if (baseID && args.fork) {
        const forked = await sdk.session.fork({ sessionID: baseID })
        return forked.data?.id
      }

      if (baseID) return baseID

      const name = title()
      const result = await sdk.session.create({ title: name, permission: rules })
      return result.data?.id
    }

    async function share(sdk: OpencodeClient, sessionID: string): Promise<void> {
      const cfg = await sdk.config.get()
      if (!cfg.data) return
      if (cfg.data.share !== "auto" && !Flag.OPENCODE_AUTO_SHARE && !args.share) return
      const res = await sdk.session.share({ sessionID }).catch((error: unknown) => {
        if (error instanceof Error && error.message.includes("disabled")) {
          UI.println(UI.Style.TEXT_DANGER_BOLD + "!  " + error.message)
        }
        return { error } as { error: unknown }
      })
      if (!("error" in res)) {
        const shareData = (res as { data?: { share?: { url?: string } } }).data
        if (shareData?.share?.url) {
          UI.println(UI.Style.TEXT_INFO_BOLD + "~  " + shareData.share.url)
        }
      }
    }

    async function execute(sdk: OpencodeClient): Promise<void> {
      function tool(part: ToolPart): void {
        try {
          if (part.tool === "bash") { bash(props<typeof BashTool>(part)); return; }
          if (part.tool === "glob") { glob(props<typeof GlobTool>(part)); return; }
          if (part.tool === "grep") { grep(props<typeof GrepTool>(part)); return; }
          if (part.tool === "list") { list(props<typeof ListTool>(part)); return; }
          if (part.tool === "read") { read(props<typeof ReadTool>(part)); return; }
          if (part.tool === "write") { write(props<typeof WriteTool>(part)); return; }
          if (part.tool === "webfetch") { webfetch(props<typeof WebFetchTool>(part)); return; }
          if (part.tool === "edit") { edit(props<typeof EditTool>(part)); return; }
          if (part.tool === "codesearch") { codesearch(props<typeof CodeSearchTool>(part)); return; }
          if (part.tool === "websearch") { websearch(props<typeof WebSearchTool>(part)); return; }
          if (part.tool === "task") { task(props<typeof TaskTool>(part)); return; }
          if (part.tool === "todowrite") { todo(props<typeof TodoWriteTool>(part)); return; }
          if (part.tool === "skill") { skill(props<typeof SkillTool>(part)); return; }
          fallback(part); return;
        } catch {
          fallback(part); return;
        }
      }

      function emit(type: string, data: Record<string, unknown>): boolean {
        if (args.format === "json") {
          process.stdout.write(JSON.stringify({ type, timestamp: Date.now(), sessionID, ...data }) + EOL)
          return true
        }
        return false
      }

      const events = await sdk.event.subscribe()
      let error: string | undefined

      async function loop(): Promise<void> {
        const toggles = new Map<string, boolean>()

        for await (const event of events.stream) {
          if (
            event.type === "message.updated" &&
            event.properties.info.role === "assistant" &&
            args.format !== "json" &&
            toggles.get("start") !== true
          ) {
            UI.empty()
            UI.println(`> ${event.properties.info.agent} · ${event.properties.info.modelID}`)
            UI.empty()
            toggles.set("start", true)
          }

          if (event.type === "message.part.updated") {
            const part = event.properties.part
            if (part.sessionID !== sessionID) continue

            if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error")) {
              if (emit("tool_use", { part })) continue
              if (part.state.status === "completed") {
                tool(part)
                continue
              }
              inline({
                icon: "✗",
                title: `${part.tool} failed`,
              })
              UI.error(part.state.error)
            }

            if (
              part.type === "tool" &&
              part.tool === "task" &&
              part.state.status === "running" &&
              args.format !== "json"
            ) {
              if (toggles.get(part.id) === true) continue
              task(props<typeof TaskTool>(part))
              toggles.set(part.id, true)
            }

            if (part.type === "step-start") {
              if (emit("step_start", { part })) continue
            }

            if (part.type === "step-finish") {
              if (emit("step_finish", { part })) continue
            }

            if (part.type === "text") {
              if (emit("text", { part })) continue
              const text = part.text.trim()
              if (!text) continue
              if (!process.stdout.isTTY) {
                process.stdout.write(text + EOL)
                continue
              }
              UI.empty()
              UI.println(text)
              UI.empty()
            }

            if (part.type === "reasoning" && args.thinking) {
              if (emit("reasoning", { part })) continue
              const text = part.text.trim()
              if (!text) continue
              const line = `Thinking: ${text}`
              if (process.stdout.isTTY) {
                UI.empty()
                UI.println(`${UI.Style.TEXT_DIM}\u001b[3m${line}\u001b[0m${UI.Style.TEXT_NORMAL}`)
                UI.empty()
                continue
              }
              process.stdout.write(line + EOL)
            }
          }

          if (event.type === "session.error") {
            const eventProps = event.properties
            if (eventProps.sessionID !== sessionID || !eventProps.error) continue
            let err: string = eventProps.error.name
            const errData = eventProps.error.data as Record<string, unknown>
            if ("message" in errData && typeof errData.message === "string") {
              err = errData.message
            }
            error = error !== undefined ? error + EOL + err : err
            if (emit("error", { error: eventProps.error })) continue
            UI.error(err)
          }

          if (
            event.type === "session.status" &&
            event.properties.sessionID === sessionID &&
            event.properties.status.type === "idle"
          ) {
            break
          }

          if (event.type === "permission.asked") {
            const permission = event.properties
            if (permission.sessionID !== sessionID) continue
            UI.println(
              UI.Style.TEXT_WARNING_BOLD + "!",
              UI.Style.TEXT_NORMAL +
                `permission requested: ${permission.permission} (${permission.patterns.join(", ")}); auto-rejecting`,
            )
            await sdk.permission.reply({
              requestID: permission.id,
              reply: "reject",
            })
          }
        }
      }

      // Validate agent if specified
      const agent = await (async (): Promise<string | undefined> => {
        if (!args.agent) return undefined

        // When attaching, validate against the running server instead of local Instance state.
        if (args.attach) {
          const modes = await sdk.app
            .agents(undefined, { throwOnError: true })
            .then((x) => x.data)
            .catch(() => undefined)

          if (!modes) {
            UI.println(
              UI.Style.TEXT_WARNING_BOLD + "!",
              UI.Style.TEXT_NORMAL,
              `failed to list agents from ${args.attach}. Falling back to default agent`,
            )
            return undefined
          }

          const matchedAgent = modes.find((a) => a.name === args.agent)
          if (!matchedAgent) {
            UI.println(
              UI.Style.TEXT_WARNING_BOLD + "!",
              UI.Style.TEXT_NORMAL,
              `agent "${args.agent}" not found. Falling back to default agent`,
            )
            return undefined
          }

          if (matchedAgent.mode === "subagent") {
            UI.println(
              UI.Style.TEXT_WARNING_BOLD + "!",
              UI.Style.TEXT_NORMAL,
              `agent "${args.agent}" is a subagent, not a primary agent. Falling back to default agent`,
            )
            return undefined
          }

          return args.agent
        }

        const entry = await Agent.get(args.agent)
        if (!entry) {
          UI.println(
            UI.Style.TEXT_WARNING_BOLD + "!",
            UI.Style.TEXT_NORMAL,
            `agent "${args.agent}" not found. Falling back to default agent`,
          )
          return undefined
        }
        if (entry.mode === "subagent") {
          UI.println(
            UI.Style.TEXT_WARNING_BOLD + "!",
            UI.Style.TEXT_NORMAL,
            `agent "${args.agent}" is a subagent, not a primary agent. Falling back to default agent`,
          )
          return undefined
        }
        return args.agent
      })()

      const sessionID = await session(sdk)
      if (!sessionID) {
        UI.error("Session not found")
        process.exit(1)
      }
      await share(sdk, sessionID)

      loop().catch((e: unknown) => {
        console.error(e)
        process.exit(1)
      })

      if (args.command) {
        await sdk.session.command({
          sessionID,
          agent,
          model: args.model,
          command: args.command,
          arguments: message,
          variant: args.variant,
        })
      } else {
        const model = args.model ? Provider.parseModel(args.model) : undefined
        await sdk.session.prompt({
          sessionID,
          agent,
          model,
          variant: args.variant,
          parts: [...files, { type: "text", text: message }],
        })
      }
    }

    if (args.attach) {
      const headers = (() => {
        const password = args.password ?? process.env.OPENCODE_SERVER_PASSWORD
        if (!password) return undefined
        const username = process.env.OPENCODE_SERVER_USERNAME ?? "orbit"
        const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
        return { Authorization: auth }
      })()
      const sdk = createOpencodeClient({ baseUrl: args.attach, directory, headers })
      await execute(sdk); return;
    }

    await bootstrap(process.cwd(), async () => {
      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return Server.Default().fetch(request)
      }) as typeof globalThis.fetch
      const sdk = createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })
      await execute(sdk)
    })
  },
})
