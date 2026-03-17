import type { z } from "zod"

interface ValidatedFn<T extends z.ZodType, Result> {
  (input: z.infer<T>): Result
  force: (input: z.infer<T>) => Result
  schema: T
}

export function fn<T extends z.ZodType, Result>(schema: T, cb: (input: z.infer<T>) => Result): ValidatedFn<T, Result> {
  const result = (input: z.infer<T>): Result => {
    const parsed = schema.parse(input) as z.infer<T>
    return cb(parsed)
  }
  result.force = (input: z.infer<T>): Result => cb(input)
  result.schema = schema
  return result
}
