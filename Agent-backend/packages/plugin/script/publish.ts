#!/usr/bin/env bun
import { fileURLToPath } from "url"

import { Script } from "@orbit.build/script"
import { $ } from "bun"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

await $`bun tsc`
const pkg = (await import("../package.json").then((m) => m.default)) as Record<string, unknown> & {
  exports: Record<string, string>
}
const original = JSON.parse(JSON.stringify(pkg)) as typeof pkg
const transformedExports: Record<string, { import: string; types: string }> = {}
for (const [key, value] of Object.entries(pkg.exports)) {
  const file = value.replace("./src/", "./dist/").replace(".ts", "")
  transformedExports[key] = {
    import: file + ".js",
    types: file + ".d.ts",
  }
}
const publishPkg = { ...pkg, exports: transformedExports }
await Bun.write("package.json", JSON.stringify(publishPkg, null, 2))
await $`bun pm pack && npm publish *.tgz --tag ${Script.channel} --access public`
await Bun.write("package.json", JSON.stringify(original, null, 2))
