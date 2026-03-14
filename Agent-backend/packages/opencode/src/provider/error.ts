import { STATUS_CODES } from "http"

import type { APICallError } from "ai"

import { iife } from "@/util/iife"

interface ParsedJsonBody {
  type?: string
  message?: unknown
  error?:
    | {
        code?: string
        message?: unknown
      }
    | string
}

export namespace ProviderError {
  // Adapted from overflow detection patterns in:
  // https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
  const OVERFLOW_PATTERNS = [
    /prompt is too long/i, // Anthropic
    /input is too long for requested model/i, // Amazon Bedrock
    /exceeds the context window/i, // OpenAI (Completions + Responses API message text)
    /input token count.*exceeds the maximum/i, // Google (Gemini)
    /maximum prompt length is \d+/i, // xAI (Grok)
    /reduce the length of the messages/i, // Groq
    /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek
    /exceeds the limit of \d+/i, // GitHub Copilot
    /exceeds the available context size/i, // llama.cpp server
    /greater than the context length/i, // LM Studio
    /context window exceeds limit/i, // MiniMax
    /exceeded model token limit/i, // Kimi For Coding, Moonshot
    /context[_ ]length[_ ]exceeded/i, // Generic fallback
    /request entity too large/i, // HTTP 413
  ]

  function isOpenAiErrorRetryable(e: APICallError): boolean {
    const status = e.statusCode
    if (status === undefined) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  // Providers not reliably handled in this function:
  // - z.ai: can accept overflow silently (needs token-count/context-window checks)
  function isOverflow(message: string): boolean {
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true

    // Providers/status patterns handled outside of regex list:
    // - Cerebras: often returns "400 (no body)" / "413 (no body)"
    // - Mistral: often returns "400 (no body)" / "413 (no body)"
    return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message)
  }

  function error(providerID: string, error: APICallError): string {
    if (providerID.includes("github-copilot") && error.statusCode === 403) {
      return "Please reauthenticate with the copilot provider to ensure your credentials work properly with Orbit."
    }

    return error.message
  }

  function message(providerID: string, e: APICallError): string {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode !== undefined && e.statusCode !== 0) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      const transformed = error(providerID, e)
      if (transformed !== msg) {
        return transformed
      }
      if (!e.responseBody || (e.statusCode !== undefined && e.statusCode !== 0 && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody) as ParsedJsonBody
        // try to extract common error message fields
        const bodyMessage = typeof body.message === "string" ? body.message : undefined
        const bodyError = typeof body.error === "string" ? body.error : undefined
        const errorVal = body.error
        const bodyErrorMessage =
          typeof errorVal === "object" && "message" in errorVal && typeof errorVal.message === "string"
            ? errorVal.message
            : undefined
        const errMsg = bodyMessage ?? bodyError ?? bodyErrorMessage
        if (errMsg !== undefined) {
          return `${msg}: ${errMsg}`
        }
      } catch {
        // JSON parse failed, fall through
      }

      // If responseBody is HTML (e.g. from a gateway or proxy error page),
      // provide a human-readable message instead of dumping raw markup
      if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
        if (e.statusCode === 401) {
          return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired — try running `orbit auth login <your provider URL>` to re-authenticate."
        }
        if (e.statusCode === 403) {
          return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource — check your account and provider settings."
        }
        return msg
      }

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown): Record<string, unknown> | undefined {
    if (typeof input === "string") {
      try {
        const result: unknown = JSON.parse(input)
        if (result !== null && typeof result === "object") return result as Record<string, unknown>
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input as Record<string, unknown>
    }
    return undefined
  }

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: false
        responseBody: string
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = json(input)
    if (body === undefined) return undefined

    const responseBody = JSON.stringify(body)
    if (body.type !== "error") return undefined

    const errorObj = body.error as { code?: string; message?: unknown } | undefined
    const errorCode = errorObj?.code

    if (errorCode === "context_length_exceeded") {
      return {
        type: "context_overflow",
        message: "Input exceeds context window of this model",
        responseBody,
      }
    }
    if (errorCode === "insufficient_quota") {
      return {
        type: "api_error",
        message: "Quota exceeded. Check your plan and billing details.",
        isRetryable: false,
        responseBody,
      }
    }
    if (errorCode === "usage_not_included") {
      return {
        type: "api_error",
        message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
        isRetryable: false,
        responseBody,
      }
    }
    if (errorCode === "invalid_prompt") {
      return {
        type: "api_error",
        message: typeof errorObj?.message === "string" ? errorObj.message : "Invalid prompt.",
        isRetryable: false,
        responseBody,
      }
    }

    return undefined
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  export function parseAPICallError(input: { providerID: string; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    if (isOverflow(m) || input.error.statusCode === 413) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const metadata = input.error.url ? { url: input.error.url } : undefined
    return {
      type: "api_error",
      message: m,
      statusCode: input.error.statusCode,
      isRetryable: input.providerID.startsWith("openai")
        ? isOpenAiErrorRetryable(input.error)
        : input.error.isRetryable,
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata,
    }
  }
}
