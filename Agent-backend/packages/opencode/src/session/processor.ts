import { SessionCompaction } from "./compaction"
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { SessionRetry } from "./retry"
import { SessionStatus } from "./status"
import { SessionSummary } from "./summary"

import { Session } from "."

import type { Provider } from "@/provider/provider"

import { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Identifier } from "@/id/id"
import { PermissionNext } from "@/permission/next"
import { Plugin } from "@/plugin"
import { Question } from "@/question"
import { Snapshot } from "@/snapshot"
import { Log } from "@/util/log"

export namespace SessionProcessor {
  const DOOM_LOOP_THRESHOLD = 3
  const log = Log.create({ service: "session.processor" })

  export type Info = Awaited<ReturnType<typeof create>>
  export type Result = Awaited<ReturnType<Info["process"]>>

  interface ToolOutput {
    output: string
    title: string
    metadata: unknown
    attachments?: MessageV2.FilePart[]
  }

  export function create(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: string
    model: Provider.Model
    abort: AbortSignal
  }): {
    readonly message: MessageV2.Assistant
    partFromToolCall(toolCallID: string): MessageV2.ToolPart | undefined
    process(streamInput: LLM.StreamInput): Promise<"compact" | "stop" | "continue">
  } {
    const toolcalls = new Map<string, MessageV2.ToolPart>()
    let snapshot: string | undefined
    let blocked = false
    let attempt = 0
    let needsCompaction = false

    const result = {
      get message() {
        return input.assistantMessage
      },
      partFromToolCall(toolCallID: string): MessageV2.ToolPart | undefined {
        return toolcalls.get(toolCallID)
      },
      async process(streamInput: LLM.StreamInput): Promise<"compact" | "stop" | "continue"> {
        log.info("process")
        needsCompaction = false
        const shouldBreak = (await Config.get()).experimental?.continue_loop_on_deny !== true
        for (;;) {
          try {
            let currentText: MessageV2.TextPart | undefined
            const reasoningMap = new Map<string, MessageV2.ReasoningPart>()
            const stream = await LLM.stream(streamInput)

            for await (const value of stream.fullStream) {
              input.abort.throwIfAborted()
              switch (value.type) {
                case "start":
                  SessionStatus.set(input.sessionID, { type: "busy" })
                  break

                case "reasoning-start": {
                  if (reasoningMap.has(value.id)) {
                    continue
                  }
                  const reasoningPart: MessageV2.ReasoningPart = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "reasoning",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  reasoningMap.set(value.id, reasoningPart)
                  Session.updatePart(reasoningPart)
                  break
                }

                case "reasoning-delta": {
                  const rpart = reasoningMap.get(value.id)
                  if (rpart) {
                    rpart.text += value.text
                    if (value.providerMetadata) rpart.metadata = value.providerMetadata
                    Session.updatePartDelta({
                      sessionID: rpart.sessionID,
                      messageID: rpart.messageID,
                      partID: rpart.id,
                      field: "text",
                      delta: value.text,
                    })
                  }
                  break
                }

                case "reasoning-end": {
                  const rpart = reasoningMap.get(value.id)
                  if (rpart) {
                    rpart.text = rpart.text.trimEnd()

                    rpart.time = {
                      ...rpart.time,
                      end: Date.now(),
                    }
                    if (value.providerMetadata) rpart.metadata = value.providerMetadata
                    Session.updatePart(rpart)
                    reasoningMap.delete(value.id)
                  }
                  break
                }

                case "tool-input-start": {
                  const existing = toolcalls.get(value.id)
                  const tpart = Session.updatePart({
                    id: existing?.id ?? Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "tool",
                    tool: value.toolName,
                    callID: value.id,
                    state: {
                      status: "pending",
                      input: {},
                      raw: "",
                    },
                  })
                  toolcalls.set(value.id, tpart as MessageV2.ToolPart)
                  break
                }

                case "tool-input-delta":
                  break

                case "tool-input-end":
                  break

                case "tool-call": {
                  const match = toolcalls.get(value.toolCallId)
                  if (match) {
                    const tcpart = Session.updatePart({
                      ...match,
                      tool: value.toolName,
                      state: {
                        status: "running",
                        input: value.input as Record<string, unknown>,
                        time: {
                          start: Date.now(),
                        },
                      },
                      metadata: value.providerMetadata,
                    })
                    toolcalls.set(value.toolCallId, tcpart as MessageV2.ToolPart)

                    const parts = MessageV2.parts(input.assistantMessage.id)
                    const lastThree = parts.slice(-DOOM_LOOP_THRESHOLD)

                    if (
                      lastThree.length === DOOM_LOOP_THRESHOLD &&
                      lastThree.every(
                        (p) =>
                          p.type === "tool" &&
                          p.tool === value.toolName &&
                          p.state.status !== "pending" &&
                          JSON.stringify(p.state.input) === JSON.stringify(value.input),
                      )
                    ) {
                      const agent = await Agent.get(input.assistantMessage.agent)
                      await PermissionNext.ask({
                        permission: "doom_loop",
                        patterns: [value.toolName],
                        sessionID: input.assistantMessage.sessionID,
                        metadata: {
                          tool: value.toolName,
                          input: value.input as unknown,
                        },
                        always: [value.toolName],
                        ruleset: agent?.permission ?? [],
                      })
                    }
                  }
                  break
                }
                case "tool-result": {
                  const match = toolcalls.get(value.toolCallId)
                  if (match?.state.status === "running") {
                    const out = value.output as ToolOutput
                    Session.updatePart({
                      ...match,
                      state: {
                        status: "completed",
                        input: (value.input as Record<string, unknown> | undefined) ?? match.state.input,
                        output: out.output,
                        metadata: out.metadata as Record<string, unknown>,
                        title: out.title,
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                        attachments: out.attachments,
                      },
                    })

                    toolcalls.delete(value.toolCallId)
                  }
                  break
                }

                case "tool-error": {
                  const match = toolcalls.get(value.toolCallId)
                  if (match?.state.status === "running") {
                    Session.updatePart({
                      ...match,
                      state: {
                        status: "error",
                        input: (value.input as Record<string, unknown> | undefined) ?? match.state.input,
                        error: value.error instanceof Error ? value.error.toString() : String(value.error),
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                      },
                    })

                    if (
                      value.error instanceof PermissionNext.RejectedError ||
                      value.error instanceof Question.RejectedError
                    ) {
                      blocked = shouldBreak
                    }
                    toolcalls.delete(value.toolCallId)
                  }
                  break
                }
                case "error":
                  throw value.error

                case "start-step": {
                  snapshot = await Snapshot.track()
                  Session.updatePart({
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.sessionID,
                    snapshot,
                    type: "step-start",
                  })
                  break
                }

                case "finish-step": {
                  const usage = Session.getUsage({
                    model: input.model,
                    usage: value.usage,
                    metadata: value.providerMetadata,
                  })
                  input.assistantMessage.finish = value.finishReason
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens
                  Session.updatePart({
                    id: Identifier.ascending("part"),
                    reason: value.finishReason,
                    snapshot: await Snapshot.track(),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "step-finish",
                    tokens: usage.tokens,
                    cost: usage.cost,
                  })
                  Session.updateMessage(input.assistantMessage)
                  if (snapshot) {
                    const patch = await Snapshot.patch(snapshot)
                    if (patch.files.length > 0) {
                      Session.updatePart({
                        id: Identifier.ascending("part"),
                        messageID: input.assistantMessage.id,
                        sessionID: input.sessionID,
                        type: "patch",
                        hash: patch.hash,
                        files: patch.files,
                      })
                    }
                    snapshot = undefined
                  }
                  void SessionSummary.summarize({
                    sessionID: input.sessionID,
                    messageID: input.assistantMessage.parentID,
                  })
                  if (
                    !input.assistantMessage.summary &&
                    (await SessionCompaction.isOverflow({ tokens: usage.tokens, model: input.model }))
                  ) {
                    needsCompaction = true
                  }
                  break
                }

                case "text-start":
                  currentText = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "text",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  Session.updatePart(currentText)
                  break

                case "text-delta":
                  if (currentText) {
                    currentText.text += value.text
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata
                    Session.updatePartDelta({
                      sessionID: currentText.sessionID,
                      messageID: currentText.messageID,
                      partID: currentText.id,
                      field: "text",
                      delta: value.text,
                    })
                  }
                  break

                case "text-end":
                  if (currentText) {
                    currentText.text = currentText.text.trimEnd()
                    const textOutput = await Plugin.trigger(
                      "experimental.text.complete",
                      {
                        sessionID: input.sessionID,
                        messageID: input.assistantMessage.id,
                        partID: currentText.id,
                      },
                      { text: currentText.text },
                    )
                    currentText.text = textOutput.text
                    currentText.time = {
                      start: Date.now(),
                      end: Date.now(),
                    }
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata
                    Session.updatePart(currentText)
                  }
                  currentText = undefined
                  break

                case "finish":
                  break

                case "file":
                case "raw":
                case "abort":
                case "source":
                  break

                default:
                  log.info("unhandled", {
                    type: (value as { type: string }).type,
                  })
                  continue
              }
              if (needsCompaction) break
            }
          } catch (e: unknown) {
            const errorObj = e instanceof Error ? e : new Error(String(e))
            log.error("process", {
              error: errorObj,
              stack: JSON.stringify(errorObj.stack),
            })
            const error = MessageV2.fromError(e, { providerID: input.model.providerID }) as NonNullable<
              MessageV2.Assistant["error"]
            >
            if (MessageV2.ContextOverflowError.isInstance(error)) {
              needsCompaction = true
              void Bus.publish(Session.Event.Error, {
                sessionID: input.sessionID,
                error,
              })
            } else {
              const retry = SessionRetry.retryable(error)
              if (retry !== undefined) {
                attempt++
                const delay = SessionRetry.delay(attempt, error.name === "APIError" ? error : undefined)
                SessionStatus.set(input.sessionID, {
                  type: "retry",
                  attempt,
                  message: retry,
                  next: Date.now() + delay,
                })
                await SessionRetry.sleep(delay, input.abort).catch(() => {
                  // Abort signal fired during retry sleep — loop will re-check
                })
                continue
              }
              input.assistantMessage.error = error
              void Bus.publish(Session.Event.Error, {
                sessionID: input.assistantMessage.sessionID,
                error: input.assistantMessage.error,
              })
              SessionStatus.set(input.sessionID, { type: "idle" })
            }
          }
          if (snapshot) {
            const patch = await Snapshot.patch(snapshot)
            if (patch.files.length > 0) {
              Session.updatePart({
                id: Identifier.ascending("part"),
                messageID: input.assistantMessage.id,
                sessionID: input.sessionID,
                type: "patch",
                hash: patch.hash,
                files: patch.files,
              })
            }
            snapshot = undefined
          }
          const p = MessageV2.parts(input.assistantMessage.id)
          for (const part of p) {
            if (part.type === "tool" && part.state.status !== "completed" && part.state.status !== "error") {
              Session.updatePart({
                ...part,
                state: {
                  ...part.state,
                  status: "error",
                  error: "Tool execution aborted",
                  time: {
                    start: Date.now(),
                    end: Date.now(),
                  },
                },
              })
            }
          }
          input.assistantMessage.time.completed = Date.now()
          Session.updateMessage(input.assistantMessage)
          if (needsCompaction) return "compact"
          if (blocked) return "stop"
          if (input.assistantMessage.error) return "stop"
          return "continue"
        }
      },
    }
    return result
  }
}
