import { EOL } from "os"
import { basename } from "path"

import { Agent } from "../../../agent/agent"
import { Identifier } from "../../../id/id"
import { PermissionNext } from "../../../permission/next"
import { Instance } from "../../../project/instance"
import { Provider } from "../../../provider/provider"
import { Session } from "../../../session"
import { ToolRegistry } from "../../../tool/registry"
import { iife } from "../../../util/iife"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

import type { MessageV2 } from "../../../session/message-v2"

type AvailableTool = Awaited<ReturnType<typeof ToolRegistry.tools>>[number]

export const AgentCommand = cmd({
  command: "agent <name>",
  describe: "show agent configuration details",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        demandOption: true,
        description: "Agent name",
      })
      .option("tool", {
        type: "string",
        description: "Tool id to execute",
      })
      .option("params", {
        type: "string",
        description: "Tool params as JSON or a JS object literal",
      }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const agentName = args.name
      const agent = await Agent.get(agentName)
      if (!agent) {
        process.stderr.write(
          `Agent ${agentName} not found, run '${basename(process.execPath)} agent list' to get an agent list` + EOL,
        )
        process.exit(1)
      }
      const availableTools = await getAvailableTools(agent)
      const resolvedTools = resolveTools(agent, availableTools)
      const toolID = args.tool
      if (toolID) {
        const tool = availableTools.find((item: AvailableTool) => item.id === toolID)
        if (!tool) {
          process.stderr.write(`Tool ${toolID} not found for agent ${agentName}` + EOL)
          process.exit(1)
        }
        if (!resolvedTools[toolID]) {
          process.stderr.write(`Tool ${toolID} is disabled for agent ${agentName}` + EOL)
          process.exit(1)
        }
        const params = parseToolParams(args.params)
        const ctx = await createToolContext(agent)
        const result = await tool.execute(params, ctx)
        process.stdout.write(JSON.stringify({ tool: toolID, input: params, result }, null, 2) + EOL)
        return
      }

      const output = {
        ...agent,
        tools: resolvedTools,
      }
      process.stdout.write(JSON.stringify(output, null, 2) + EOL)
    })
  },
})

async function getAvailableTools(agent: Agent.Info): Promise<AvailableTool[]> {
  const model = agent.model ?? (await Provider.defaultModel())
  return ToolRegistry.tools(model, agent)
}

function resolveTools(agent: Agent.Info, availableTools: AvailableTool[]): Record<string, boolean> {
  const disabled = PermissionNext.disabled(
    availableTools.map((tool: AvailableTool) => tool.id),
    agent.permission,
  )
  const resolved: Record<string, boolean> = {}
  for (const tool of availableTools) {
    const id = tool.id
    resolved[id] = !disabled.has(id)
  }
  return resolved
}

function parseToolParams(input?: string): Record<string, unknown> {
  if (!input) return {}
  const trimmed = input.trim()
  if (trimmed.length === 0) return {}

  const parsed: unknown = iife(() => {
    try {
      return JSON.parse(trimmed) as unknown
    } catch (jsonError: unknown) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional eval of user-provided JS object literal for CLI debugging
        return (new Function(`return (${trimmed})`) as () => unknown)()
      } catch (evalError: unknown) {
        throw new Error(
          `Failed to parse --params. Use JSON or a JS object literal. JSON error: ${String(jsonError)}. Eval error: ${String(evalError)}.`,
          { cause: evalError },
        )
      }
    }
  })

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool params must be an object.")
  }
  return parsed as Record<string, unknown>
}

async function createToolContext(agent: Agent.Info): Promise<{
  sessionID: string
  messageID: string
  callID: string
  agent: string
  abort: AbortSignal
  messages: never[]
  metadata: () => void
  ask: (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => Promise<void>
}> {
  const session = await Session.create({ title: `Debug tool run (${agent.name})` })
  const messageID = Identifier.ascending("message")
  const model = agent.model ?? (await Provider.defaultModel())
  const now = Date.now()
  const message: MessageV2.Assistant = {
    id: messageID,
    sessionID: session.id,
    role: "assistant",
    time: {
      created: now,
    },
    parentID: messageID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "debug",
    agent: agent.name,
    path: {
      cwd: Instance.directory,
      root: Instance.worktree,
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  }
  Session.updateMessage(message)

  const ruleset = PermissionNext.merge(agent.permission, session.permission ?? [])

  return {
    sessionID: session.id,
    messageID,
    callID: Identifier.ascending("part"),
    agent: agent.name,
    abort: new AbortController().signal,
    messages: [],
    metadata(): void {
      // no-op for debug context
    },
    async ask(req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void> {
      for (const pattern of req.patterns) {
        const rule = PermissionNext.evaluate(req.permission, pattern, ruleset)
        if (rule.action === "deny") {
          throw new PermissionNext.DeniedError(ruleset)
        }
      }
      await Promise.resolve()
    },
  }
}
