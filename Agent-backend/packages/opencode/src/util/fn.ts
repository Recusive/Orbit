import type { z } from "zod"

export function fn<T extends z.ZodType, Result>(
  schema: T,
  cb: (input: z.infer<T>) => Result,
): ((input: z.infer<T>) => Result) & { force: (input: z.infer<T>) => Result; schema: T } {
  const result = (input: z.infer<T>): Result => {
    let parsed: z.infer<T>
    try {
      parsed = schema.parse(input) as z.infer<T>
    } catch (e) {
      console.trace("schema validation failure stack trace:") // eslint-disable-line no-console -- Zod validation diagnostics
      throw e
    }

    return cb(parsed)
  }
  result.force = (input: z.infer<T>) => cb(input)
  result.schema = schema
  return result
}
