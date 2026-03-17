import z from "zod"

interface NamedErrorClass<Name extends string, Data extends z.core.$ZodType> {
  new (data: z.input<Data>, options?: ErrorOptions): NamedError & {
    readonly data: z.input<Data>
    readonly name: Name
  }
  readonly Schema: z.ZodObject<{ name: z.ZodLiteral<Name>; data: Data }>
  isInstance(input: unknown): boolean
}

export abstract class NamedError extends Error {
  abstract schema(): z.core.$ZodType
  abstract toObject(): { name: string; data: unknown }

  static create<Name extends string, Data extends z.core.$ZodType>(
    name: Name,
    data: Data,
  ): NamedErrorClass<Name, Data> {
    const schema = z
      .object({
        name: z.literal(name),
        data,
      })
      .meta({
        ref: name,
      })
    const result = class extends NamedError {
      public static readonly Schema = schema

      public override readonly name = name

      constructor(
        public readonly data: z.input<Data>,
        options?: ErrorOptions,
      ) {
        super(name, options)
        this.name = name
      }

      static isInstance(input: unknown): input is InstanceType<typeof result> {
        return typeof input === "object" && input !== null && "name" in input && input.name === name
      }

      schema(): z.core.$ZodType {
        return schema
      }

      toObject(): { name: string; data: z.input<Data> } {
        return {
          name: name,
          data: this.data,
        }
      }
    }
    Object.defineProperty(result, "name", { value: name })
    return result as unknown as NamedErrorClass<Name, Data>
  }

  public static readonly Unknown = NamedError.create(
    "UnknownError",
    z.object({
      message: z.string(),
    }),
  )
}
