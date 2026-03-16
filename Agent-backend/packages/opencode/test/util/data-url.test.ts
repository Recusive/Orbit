import { describe, expect, test } from "bun:test"

import { decodeDataUrl } from "../../src/util/data-url"

describe("util.data-url", () => {
  test("decodes base64 data urls", () => {
    expect(decodeDataUrl("data:text/plain;base64,SGVsbG8=")).toBe("Hello")
  })

  test("decodes percent-encoded data urls", () => {
    expect(decodeDataUrl("data:text/plain,hello%20world")).toBe("hello world")
  })

  test("returns empty string for invalid data urls", () => {
    expect(decodeDataUrl("not-a-data-url")).toBe("")
  })
})
