import * as prompts from "@clack/prompts"
import { Effect, Option } from "effect"

export const intro = (msg: string): Effect.Effect<void> =>
  Effect.sync(() => {
    prompts.intro(msg)
  })
export const outro = (msg: string): Effect.Effect<void> =>
  Effect.sync(() => {
    prompts.outro(msg)
  })

export const log = {
  info: (msg: string): Effect.Effect<void> =>
    Effect.sync(() => {
      prompts.log.info(msg)
    }),
}

export const select = <Value>(
  opts: Parameters<typeof prompts.select<Value>>[0],
): Effect.Effect<Option.Option<Value>, unknown> =>
  Effect.tryPromise(() => prompts.select(opts)).pipe(
    Effect.map((result) => {
      if (prompts.isCancel(result)) return Option.none<Value>()
      return Option.some(result)
    }),
  )

interface Spinner {
  start: (msg: string) => Effect.Effect<void>
  stop: (msg: string, code?: number) => Effect.Effect<void>
}

export const spinner = (): Spinner => {
  const s = prompts.spinner()
  return {
    start: (msg: string) =>
      Effect.sync(() => {
        s.start(msg)
      }),
    stop: (msg: string, code?: number) =>
      Effect.sync(() => {
        s.stop(msg, code)
      }),
  }
}
