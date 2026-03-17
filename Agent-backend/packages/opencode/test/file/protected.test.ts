import { describe, expect, test } from "bun:test"

import { Protected } from "../../src/file/protected"

describe("file.protected", () => {
  test("returns platform-specific protected names", () => {
    const names = Protected.names()

    if (process.platform === "darwin") {
      expect(names.has("Library")).toBe(true)
      expect(names.has("Documents")).toBe(true)
      return
    }

    if (process.platform === "win32") {
      expect(names.has("AppData")).toBe(true)
      expect(names.has("Documents")).toBe(true)
      return
    }

    expect(Array.from(names)).toEqual([])
  })

  test("returns platform-specific protected paths", () => {
    const paths = Protected.paths()

    if (process.platform === "darwin") {
      expect(paths.some((item) => item.endsWith("/Library"))).toBe(true)
      return
    }

    if (process.platform === "win32") {
      expect(paths.some((item) => /AppData$/i.test(item))).toBe(true)
      return
    }

    expect(paths).toEqual([])
  })
})
