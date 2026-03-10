import path from "path"

import { $ } from "bun"
import semver from "semver"

interface RootPackageJson {
  packageManager?: string
}

interface NpmRegistryResponse {
  version: string
}

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = (await Bun.file(rootPkgPath).json()) as RootPackageJson
const packageManagerField = rootPkg.packageManager
if (typeof packageManagerField !== "string") {
  throw new Error("packageManager field not found in root package.json")
}
const expectedBunVersion = packageManagerField.split("@")[1]

if (typeof expectedBunVersion !== "string" || expectedBunVersion === "") {
  throw new Error("Could not parse bun version from packageManager field")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  OPENCODE_CHANNEL: process.env.OPENCODE_CHANNEL,
  OPENCODE_BUMP: process.env.OPENCODE_BUMP,
  OPENCODE_VERSION: process.env.OPENCODE_VERSION,
  OPENCODE_RELEASE: process.env.OPENCODE_RELEASE,
}
const CHANNEL = await (async (): Promise<string> => {
  if (env.OPENCODE_CHANNEL) return env.OPENCODE_CHANNEL
  if (env.OPENCODE_BUMP) return "latest"
  if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async (): Promise<string> => {
  if (env.OPENCODE_VERSION) return env.OPENCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const data: NpmRegistryResponse = await fetch("https://registry.npmjs.org/opencode-ai/latest").then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    return res.json() as Promise<NpmRegistryResponse>
  })
  const parts = data.version.split(".").map((x: string) => Number(x) || 0)
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  const t = env.OPENCODE_BUMP?.toLowerCase()
  if (t === "major") return `${String(major + 1)}.0.0`
  if (t === "minor") return `${String(major)}.${String(minor + 1)}.0`
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`
})()

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((line) => line.trim()))
    .then((x) => x.filter((line) => line !== "" && !line.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel(): string {
    return CHANNEL
  },
  get version(): string {
    return VERSION
  },
  get preview(): boolean {
    return IS_PREVIEW
  },
  get release(): boolean {
    return env.OPENCODE_RELEASE !== undefined && env.OPENCODE_RELEASE !== ""
  },
  get team(): string[] {
    return team
  },
}
console.log(`opencode script`, JSON.stringify(Script, null, 2))
