import { z } from "zod"

export interface ToolContext {
  sessionID: string
  messageID: string
  agent: string
  /**
   * Current project directory for this session.
   * Prefer this over process.cwd() when resolving relative paths.
   */
  directory: string
  /**
   * Project worktree root for this session.
   * Useful for generating stable relative paths (e.g. path.relative(worktree, absPath)).
   */
  worktree: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): void
  ask(input: AskInput): Promise<void>
}

interface AskInput {
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
}

interface ToolInput<Args extends z.ZodRawShape> {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>
}

export function tool<Args extends z.ZodRawShape>(input: ToolInput<Args>): ToolInput<Args> {
  return input
}
tool.schema = z

export type ToolDefinition = ReturnType<typeof tool>
