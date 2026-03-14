import { MessageV2 } from "./message-v2"

import type { NamedError } from "@orbit.build/util/error"

import { iife } from "@/util/iife"

export namespace SessionRetry {
  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_BACKOFF_FACTOR = 2
  export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
  export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout

  export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortHandler = (): void => {
        clearTimeout(timeout)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timeout = setTimeout(
        () => {
          signal.removeEventListener("abort", abortHandler)
          resolve()
        },
        Math.min(ms, RETRY_MAX_DELAY),
      )
      signal.addEventListener("abort", abortHandler, { once: true })
    })
  }

  export function delay(attempt: number, error?: MessageV2.APIError): number {
    if (error) {
      const headers = error.data.responseHeaders
      if (headers) {
        const retryAfterMs = headers["retry-after-ms"]
        if (retryAfterMs) {
          const parsedMs = Number.parseFloat(retryAfterMs)
          if (!Number.isNaN(parsedMs)) {
            return parsedMs
          }
        }

        const retryAfter = headers["retry-after"]
        if (retryAfter) {
          const parsedSeconds = Number.parseFloat(retryAfter)
          if (!Number.isNaN(parsedSeconds)) {
            // convert seconds to milliseconds
            return Math.ceil(parsedSeconds * 1000)
          }
          // Try parsing as HTTP date format
          const parsed = Date.parse(retryAfter) - Date.now()
          if (!Number.isNaN(parsed) && parsed > 0) {
            return Math.ceil(parsed)
          }
        }

        return RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
      }
    }

    return Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS)
  }

  export function retryable(error: ReturnType<NamedError["toObject"]>): string | undefined {
    // context overflow errors should not be retried
    if (MessageV2.ContextOverflowError.isInstance(error)) return undefined
    if (MessageV2.APIError.isInstance(error)) {
      const apiData = error.data as {
        message: string
        isRetryable: boolean
        responseBody?: string
      }
      if (!apiData.isRetryable) return undefined
      if (typeof apiData.responseBody === "string" && apiData.responseBody.includes("FreeUsageLimitError"))
        return `Free usage exceeded, add credits https://opencode.ai/zen`
      return apiData.message.includes("Overloaded") ? "Provider is overloaded" : apiData.message
    }

    const json = iife((): Record<string, unknown> | undefined => {
      try {
        if (typeof error.data === "object" && error.data !== null && "message" in error.data) {
          const msg = (error.data as { message: unknown }).message
          if (typeof msg === "string") {
            const parsed: unknown = JSON.parse(msg)
            if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>
          }
        }
        return undefined
      } catch {
        return undefined
      }
    })
    try {
      if (!json) return undefined
      const code = typeof json.code === "string" ? json.code : ""

      const errorField = json.error
      if (
        json.type === "error" &&
        typeof errorField === "object" &&
        errorField !== null &&
        "type" in errorField &&
        (errorField as Record<string, unknown>).type === "too_many_requests"
      ) {
        return "Too Many Requests"
      }
      if (code.includes("exhausted") || code.includes("unavailable")) {
        return "Provider is overloaded"
      }
      if (
        json.type === "error" &&
        typeof errorField === "object" &&
        errorField !== null &&
        "code" in errorField &&
        typeof (errorField as Record<string, unknown>).code === "string" &&
        ((errorField as Record<string, unknown>).code as string).includes("rate_limit")
      ) {
        return "Rate Limited"
      }
      return JSON.stringify(json)
    } catch {
      return undefined
    }
  }
}
