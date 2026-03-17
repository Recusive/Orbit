# packages/plugin

> **Path:** `Agent-backend/packages/plugin/`

## Purpose

Plugin SDK (`@opencode-ai/plugin`) for extending OpenCode/Orbit with custom tools, hooks, and authentication providers. Defines the `Plugin` type, the `Hooks` interface (20+ hook points), and the `tool()` factory function for creating custom tools with Zod-validated arguments.

## Usage Status

| Product             | Status   | Notes                                                                                                     |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Plugins extend the agent with custom tools and hooks. The `Hooks` interface is the extension API surface. |
| Orbit CLI           | `active` | Same plugin system in CLI mode                                                                            |

## Key Files

| File             | Purpose                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`   | Plugin type, Hooks interface (20+ hook points), AuthHook type, PluginInput type |
| `src/tool.ts`    | `tool()` factory function + `ToolContext` type — creates Zod-validated tools    |
| `src/shell.ts`   | BunShell type for shell access in plugins                                       |
| `src/example.ts` | Example plugin implementation                                                   |

## Hook Points

| Hook                                   | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `event`                                | React to any server event                           |
| `config`                               | Modify configuration at load time                   |
| `tool`                                 | Register custom tools (keyed by name)               |
| `auth`                                 | Register authentication provider (OAuth or API key) |
| `chat.message`                         | Called when a new message is received               |
| `chat.params`                          | Modify LLM parameters (temperature, topP, topK)     |
| `chat.headers`                         | Add custom headers to LLM requests                  |
| `permission.ask`                       | Override permission decisions (ask/deny/allow)      |
| `command.execute.before`               | Intercept command execution                         |
| `tool.execute.before`                  | Modify tool args before execution                   |
| `tool.execute.after`                   | Post-process tool output                            |
| `tool.definition`                      | Modify tool descriptions/parameters sent to LLM     |
| `shell.env`                            | Inject environment variables into shell commands    |
| `experimental.chat.messages.transform` | Transform message history                           |
| `experimental.chat.system.transform`   | Transform system prompt                             |
| `experimental.session.compacting`      | Customize compaction prompt                         |
| `experimental.text.complete`           | Post-process text output                            |

## Tool Factory

```typescript
import { tool } from "@opencode-ai/plugin/tool"

const myTool = tool({
  description: "Does something useful",
  args: { path: tool.schema.string(), depth: tool.schema.number().optional() },
  async execute(args, context) {
    // args.path and args.depth are typed and validated
    // context provides sessionID, directory, worktree, abort signal
    return "result string"
  },
})
```

## Dependencies

- `@opencode-ai/sdk` — SDK types (Event, Message, Part, Provider, etc.)
- `zod` — Argument validation for custom tools

## Notes

- **`tool.schema` is just `z`** — the `tool()` function attaches Zod as `tool.schema` for convenience, so plugin authors don't need to import Zod separately.
- **Hooks use input/output pattern** — each hook receives an `input` (read-only context) and `output` (mutable object to modify). The plugin mutates `output` to affect behavior. This is the same pattern as Claude Code's hooks.
- **Auth hooks support OAuth and API key flows** — `AuthHook.methods` can be `"oauth"` (redirect URL + callback) or `"api"` (direct key entry). OAuth supports both auto-callback and manual code entry.
