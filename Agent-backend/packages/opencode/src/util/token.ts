export namespace Token {
  const CHARS_PER_TOKEN = 4

  export function estimate(input: string): number {
    return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
  }
}
