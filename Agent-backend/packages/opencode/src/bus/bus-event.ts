import z from "zod"

import type { ZodType } from "zod"

export namespace BusEvent {
  export type Definition = ReturnType<typeof define>

  const registry = new Map<string, Definition>()

  export function define<Type extends string, Properties extends ZodType>(
    type: Type,
    properties: Properties,
  ): {
    type: Type
    properties: Properties
  } {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }

  export function payloads(): z.core.$ZodDiscriminatedUnion {
    return z
      .discriminatedUnion(
        "type",
        registry
          .entries()
          .map(([type, def]) => {
            return z
              .object({
                type: z.literal(type),
                properties: def.properties,
              })
              .meta({
                ref: "Event" + "." + def.type,
              })
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod discriminatedUnion requires a mutable tuple type that cannot be expressed from Iterator
          .toArray() as any,
      )
      .meta({
        ref: "Event",
      })
  }
}
