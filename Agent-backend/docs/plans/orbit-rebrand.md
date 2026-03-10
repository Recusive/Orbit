# Orbit Rebrand Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand all user-facing "opencode"/"OpenCode" strings to "Orbit"/"orbit" while keeping internal code (env vars, flags, package imports) unchanged for upstream mergeability.

**Architecture:** Surgical string replacements across ~40 files. No structural changes. Internal constants (`Flag.OPENCODE_*`, `@opencode-ai/*` imports, env vars) remain untouched. Only what the user sees changes. This is a fork — no backward compatibility needed for existing opencode installations. All contracts (auth username, GitHub triggers, branch prefixes, reader/writer paths) must move together.

**Tech Stack:** TypeScript, SolidJS TUI components, text prompt files, JSON theme files

---

## Rules

**Rename to Orbit/orbit:**

- Display name: "OpenCode" → "Orbit"
- CLI script name: "opencode" → "orbit"
- Config directory: `.opencode/` → `.orbit/`
- Config files: `opencode.json` → `orbit.json`, `opencode.jsonc` → `orbit.jsonc`
- Database file: `opencode.db` → `orbit.db`
- Agent identity in prompts
- Terminal titles, tips, error messages
- GitHub workflow name and trigger commands
- Server descriptions, mDNS names
- HTML page titles (Codex auth pages)
- ACP agent name
- Worktree branch prefix: `opencode/` → `orbit/`
- Shell config markers: `# opencode` → `# orbit`
- Theme file: `opencode.json` → `orbit.json`

**Keep as-is (upstream compatibility):**

- All `Flag.OPENCODE_*` constants and env vars (including `OPENCODE_SERVER_PASSWORD` warning text)
- All `@opencode-ai/*` package imports
- All `opencode.ai` URLs (real infrastructure)
- "OpenCode Zen" and "OpenCode Go" — shared upstream infra
- Provider ID `"opencode"` — tied to Zen/Go
- HTTP headers (`x-opencode-*`, User-Agent)
- `process.env.OPENCODE` / `process.env.OPENCODE_PID`
- Plugin npm package names (`opencode-anthropic-auth`)
- VS Code extension ID (`sst-dev.opencode`)
- `OPENCODE_MIGRATIONS` declared global
- Internal variable names and code comments referencing implementation details
- `*.opencode.ai` CORS pattern
- GitHub Action path (`anomalyco/opencode/github@latest`)
- `opencode-agent[bot]` GitHub bot name
- `.well-known/opencode` API path
- `$schema` URLs pointing to `opencode.ai`
- Docker image name (`ghcr.io/anomalyco/opencode`)

---

## Chunk 1: Core Identity & Data Paths

### Task 1: App name constant (`global/index.ts`)

**Files:**

- Modify: `packages/opencode/src/global/index.ts:7`

- [ ] **Step 1: Change app constant**

```typescript
// Line 7: change from
const app = "opencode"
// to
const app = "orbit"
```

This cascades to XDG paths: `~/.local/share/orbit/`, `~/.config/orbit/`, etc.

- [ ] **Step 2: Update comment on line 16**

```typescript
// Line 16: change from
// Allow override via OPENCODE_TEST_HOME for test isolation
// to (KEEP - this is about the env var, which stays)
```

No change needed — comment references the env var which stays.

---

### Task 2: Database filename (`storage/db.ts`)

**Files:**

- Modify: `packages/opencode/src/storage/db.ts:34,36`

- [ ] **Step 1: Change db filenames**

```typescript
// Line 34: change "opencode.db" → "orbit.db"
return path.join(Global.Path.data, "orbit.db")

// Line 36: change "opencode-" → "orbit-"
return path.join(Global.Path.data, `orbit-${safe}.db`)
```

---

### Task 3: CLI entry point (`index.ts`)

**Files:**

- Modify: `packages/opencode/src/index.ts:56,86,91`

- [ ] **Step 1: Change scriptName**

```typescript
// Line 56: change
.scriptName("orbit")
```

- [ ] **Step 2: Change log prefix**

```typescript
// Line 86: change
Log.Default.info("orbit", {
```

- [ ] **Step 3: Change migration marker**

```typescript
// Line 91: change "opencode.db" → "orbit.db"
const marker = path.join(Global.Path.data, "orbit.db")
```

---

### Task 4: Config paths (`config/paths.ts`)

**Files:**

- Modify: `packages/opencode/src/config/paths.ts:28,36`

- [ ] **Step 1: Change directory targets**

```typescript
// Line 28: change
targets: [".orbit"],

// Line 36: change
targets: [".orbit"],
```

---

### Task 5: Config loading (`config/config.ts`)

**Files:**

- Modify: `packages/opencode/src/config/config.ts` (multiple lines)

- [ ] **Step 1: Change managed config paths (lines ~49, 51, 53)**

```typescript
;`/Library/Application Support/orbit`
path.join(process.env.ProgramData || "C:\\ProgramData", "orbit")`/etc/orbit`
```

- [ ] **Step 2: Change config file name in projectFiles call (line ~126)**

```typescript
for (const file of await ConfigPaths.projectFiles("orbit", Instance.directory, Instance.worktree))
```

- [ ] **Step 3: Change .opencode directory checks (line ~145)**

```typescript
if (dir.endsWith(".orbit") || dir === Flag.OPENCODE_CONFIG_DIR)
```

- [ ] **Step 4: Change config file names (line ~146)**

```typescript
for (const file of ["orbit.jsonc", "orbit.json"])
```

- [ ] **Step 5: Change config file names at line ~186**

```typescript
for (const file of ["orbit.jsonc", "orbit.json"])
```

- [ ] **Step 6: Change global config file paths (lines ~1184-1185)**

```typescript
mergeDeep(await loadFile(path.join(Global.Path.config, "orbit.json")))
mergeDeep(await loadFile(path.join(Global.Path.config, "orbit.jsonc")))
```

- [ ] **Step 7: Change config candidates (line ~1299)**

```typescript
const candidates = ["orbit.jsonc", "orbit.json", "config.json"].map((file) =>
```

NOTE: Keep all `opencode.ai` URLs, `$schema` URLs, `.well-known/opencode` paths, and comments about env vars as-is.

---

### Task 5b: TUI config migration (`config/migrate-tui-config.ts`)

**Files:**

- Modify: `packages/opencode/src/config/migrate-tui-config.ts:140-146`

- [ ] **Step 1: Change config file references in opencodeFiles()**

```typescript
// Line 140
: await ConfigPaths.projectFiles("orbit", Instance.directory, Instance.worktree)
// Line 141
const files = [...project, ...ConfigPaths.fileInDirectory(Global.Path.config, "orbit")]
// Line 143
files.push(...ConfigPaths.fileInDirectory(dir, "orbit"))
// Line 146
files.push(...ConfigPaths.fileInDirectory(input.managed, "orbit"))
```

---

### Task 6: TUI config (`config/tui.ts`)

**Files:**

- Modify: `packages/opencode/src/config/tui.ts:57`

- [ ] **Step 1: Change directory check**

```typescript
if (!dir.endsWith(".orbit") && dir !== Flag.OPENCODE_CONFIG_DIR) continue
```

---

### Task 7: MCP config paths and user-facing strings (`cli/cmd/mcp.ts`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/mcp.ts:88,165,385,388,397,484`

- [ ] **Step 1: Change ROOT config candidates (line ~385)**

CRITICAL: The root candidates must also change, not just the subdirectory candidates.

```typescript
// Line ~385: change root candidates from opencode.json/opencode.jsonc to orbit.json/orbit.jsonc
const candidates = [path.join(baseDir, "orbit.jsonc"), path.join(baseDir, "orbit.json")]
```

- [ ] **Step 2: Change subdirectory candidates (line ~388)**

```typescript
candidates.push(path.join(baseDir, ".orbit", "orbit.jsonc"), path.join(baseDir, ".orbit", "orbit.json"))
```

- [ ] **Step 3: Change default path comment (line ~397)**

```typescript
// default to orbit.jsonc in the base directory
```

- [ ] **Step 4: Change user-facing help/hint strings**

```typescript
// Line 88: change "Add servers with: opencode mcp add" → "Add servers with: orbit mcp add"
// Line 165: change "Add a remote server in opencode.json:" → "Add a remote server in orbit.json:"
// Line 484: change placeholder "e.g., opencode x @modelcontextprotocol/..." → "e.g., orbit x @modelcontextprotocol/..."
```

NOTE: Keep `clientInfo: { name: "opencode-debug" }` at lines 665/706 as-is — internal debug tool name, not user-facing.

---

### Task 8: Commit

- [ ] **Step 1: Commit core identity changes**

```bash
git add -A && git commit -m "feat: rebrand core identity and data paths from opencode to orbit"
```

---

## Chunk 2: TUI Display Text

### Task 9: Terminal title (`tui/app.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/app.tsx` (lines 268, 275, 281, 578, 685, 747, 802)

- [ ] **Step 1: Change terminal titles (lines 268, 275)**

```typescript
renderer.setTerminalTitle("Orbit") // line 268
renderer.setTerminalTitle("Orbit") // line 275
```

- [ ] **Step 2: Change abbreviated title (line 281)**

```typescript
renderer.setTerminalTitle(`OB | ${title}`) // line 281
```

- [ ] **Step 3: Change update toast (line 747)**

```typescript
message: `Orbit v${evt.properties.version} is available. Run 'orbit upgrade' to update manually.`,
```

- [ ] **Step 4: Change openrouter warning (line 685)**

Keep "OpenCode Zen" as-is — this is upstream infra the user said to keep.

- [ ] **Step 5: Keep docs URL (line 578)**

Keep `https://opencode.ai/docs` as-is — upstream URL.

- [ ] **Step 6: Keep GitHub issue URL (line 802)**

Keep `https://github.com/anomalyco/opencode/issues/new` as-is — upstream URL.

---

### Task 10: Tips (`tui/component/tips.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/component/tips.tsx`

- [ ] **Step 1: Rename all user-facing opencode references in TIPS array**

Changes needed (line numbers):

- Line 57: `opencode.ai` → keep (URL)
- Line 83: `opencode.json` → `orbit.json`
- Line 84: `~/.config/opencode/tui.json` → `~/.config/orbit/tui.json`
- Line 90: `"OpenCode auto-handles..."` → `"Orbit auto-handles..."`
- Line 91: `.opencode/command/` → `.orbit/command/`
- Line 94: `.opencode/agent/` → `.orbit/agent/`
- Line 99: `"OpenCode auto-formats..."` → `"Orbit auto-formats..."`
- Line 102: `"OpenCode uses LSP..."` → `"Orbit uses LSP..."`
- Line 103: `.opencode/tools/` → `.orbit/tools/`
- Line 105: `.opencode/plugin/` → `.orbit/plugin/`
- Line 107: `"...prevent OpenCode from..."` → `"...prevent Orbit from..."`
- Line 108: `opencode run` → `orbit run`
- Line 109: `opencode --continue` → `orbit --continue`
- Line 110: `opencode run -f file.ts` → `orbit run -f file.ts`
- Line 112: `opencode serve` → `orbit serve`, `"OpenCode"` → `"Orbit"`
- Line 113: `opencode run --attach` → `orbit run --attach`
- Line 114: `opencode upgrade` → `orbit upgrade`
- Line 115: `opencode auth list` → `orbit auth list`
- Line 116: `opencode agent create` → `orbit agent create`
- Line 117: `/opencode` → `/orbit`
- Line 118: `opencode github install` → `orbit github install`
- Line 119: `/opencode fix this` → `/orbit fix this`
- Line 122: `.opencode/themes/` → `.orbit/themes/`
- Line 138: `opencode debug config` → `orbit debug config`
- Line 145: Keep docker image path as-is (upstream)
- Line 146: Keep "OpenCode Zen" as-is (upstream infra)

---

### Task 11: Dialog status (`tui/component/dialog-status.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx:82`

- [ ] **Step 1: Change MCP auth message**

```typescript
Needs authentication (run: orbit mcp auth {key})
```

---

### Task 12: Dialog provider (`tui/component/dialog-provider.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx`

Keep all "OpenCode Zen" and "OpenCode Go" references as-is — user explicitly said these are shared upstream infra.

No changes needed.

---

### Task 13: Theme file rename and references

**Files:**

- Rename: `packages/opencode/src/cli/cmd/tui/context/theme/opencode.json` → `orbit.json`
- Modify: `packages/opencode/src/cli/cmd/tui/context/theme.tsx:27,290,310,333,358,402`

- [ ] **Step 1: Rename the theme file**

```bash
git mv .../theme/opencode.json .../theme/orbit.json
```

- [ ] **Step 2: Update import (line 27)**

```typescript
import orbit from "./theme/orbit.json"
```

- [ ] **Step 3: Update DEFAULT_THEMES to export `orbit` with legacy alias**

In the DEFAULT_THEMES object, replace `opencode` with `orbit` and add legacy alias:

```typescript
orbit,
opencode: orbit,  // legacy alias for theme persistence
```

- [ ] **Step 4: Update default theme selection (line ~290)**

```typescript
active: (config.theme ?? kv.get("theme", "orbit")) as string,
```

- [ ] **Step 5: Update error fallback (line ~310)**

```typescript
setStore("active", "orbit")
```

- [ ] **Step 6: Update system theme failure fallback (line ~333)**

```typescript
draft.active = "orbit"
```

- [ ] **Step 7: Update computed fallback (line 358)**

```typescript
return resolveTheme(store.themes[store.active] ?? store.themes.orbit, store.mode)
```

- [ ] **Step 8: Update custom theme directory target (line 402)**

```typescript
targets: [".orbit"],
```

NOTE: The theme JSON files' `$schema` URLs pointing to `opencode.ai/theme.json` stay as-is.

---

### Task 13b: Sidebar getting-started copy (`tui/routes/session/sidebar.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx:295`

- [ ] **Step 1: Change getting-started text**

```typescript
// Line 295
<text fg={theme.textMuted}>Orbit includes free models so you can start immediately.</text>
```

---

### Task 13c: Permission dialog copy (`tui/routes/session/permission.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx:160,164,504`

- [ ] **Step 1: Change permission dialog strings**

```typescript
// Line 160
<TextBody title={"This will allow " + props.request.permission + " until Orbit is restarted."} />

// Line 164
<text fg={theme.textMuted}>This will allow the following patterns until Orbit is restarted</text>

// Line 504
<text fg={theme.textMuted}>Tell Orbit what to do differently</text>
```

---

### Task 13d: Thread help text (`tui/thread.ts`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/thread.ts:67,72`

- [ ] **Step 1: Change user-facing command descriptions**

```typescript
// Line 67
describe: "start orbit tui",

// Line 72
describe: "path to start orbit in",
```

---

### Task 13e: Session resume command (`tui/routes/session/index.tsx`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:275`

- [ ] **Step 1: Change user-facing CLI command in session footer**

```typescript
;`  ${weak("Continue")}${UI.Style.TEXT_NORMAL_BOLD}orbit -s ${session()?.id}${UI.Style.TEXT_NORMAL}`
```

---

### Task 14: Commit

- [ ] **Step 1: Commit TUI display changes**

```bash
git add -A && git commit -m "feat: rebrand TUI display text from opencode to orbit"
```

---

## Chunk 3: Agent Prompts

### Task 15: All prompt .txt files

**Files:**

- Modify: `packages/opencode/src/session/prompt/anthropic.txt:1,10,12`
- Modify: `packages/opencode/src/session/prompt/beast.txt:1`
- Modify: `packages/opencode/src/session/prompt/qwen.txt:1,8,9,11`
- Modify: `packages/opencode/src/session/prompt/codex_header.txt:1`
- Modify: `packages/opencode/src/session/prompt/copilot-gpt-5.txt:2`
- Modify: `packages/opencode/src/session/prompt/trinity.txt:1`
- Modify: `packages/opencode/src/session/prompt/gemini.txt:1`

- [ ] **Step 1: anthropic.txt**

```
Line 1: "You are Orbit, the best coding agent on the planet."
Line 10: keep GitHub URL as-is
Line 12: "When the user directly asks about Orbit (eg. "can Orbit do...", "does Orbit have..."), ... from Orbit docs."
  Keep the opencode.ai/docs URL.
```

- [ ] **Step 2: beast.txt**

```
Line 1: "You are orbit, an agent..."
```

- [ ] **Step 3: qwen.txt**

```
Line 1: "You are orbit, an interactive CLI tool..."
Line 8: "/help: Get help with using orbit"
Line 9: keep GitHub URL as-is
Line 11: "...directly asks about orbit...from orbit docs at https://opencode.ai"
```

- [ ] **Step 4: codex_header.txt**

```
Line 1: "You are Orbit, the best coding agent on the planet."
```

- [ ] **Step 5: copilot-gpt-5.txt**

```
Line 2: "Your name is orbit"
```

- [ ] **Step 6: trinity.txt**

```
Line 1: "You are orbit, an interactive CLI tool..."
```

- [ ] **Step 7: gemini.txt**

```
Line 1: "You are orbit, an interactive CLI agent..."
```

---

### Task 16: Commit

- [ ] **Step 1: Commit prompt changes**

```bash
git add -A && git commit -m "feat: rebrand agent prompts from opencode to orbit"
```

---

## Chunk 4: CLI Commands & Server

### Task 17: serve.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/serve.ts:12,19`

- [ ] **Step 1: Change descriptions**

```typescript
// Line 12
describe: ("starts a headless orbit server",
  // Line 19
  console.log(`orbit server listening on http://${server.hostname}:${server.port}`))
```

NOTE: Keep OPENCODE_SERVER_PASSWORD warning as-is (env var name).

---

### Task 18: web.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/web.ts:34`

- [ ] **Step 1: Change description**

```typescript
describe: "start orbit server and open web interface",
```

---

### Task 20: uninstall.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/uninstall.ts:218,232,269,287,294,300,301`

- [ ] **Step 1: Change all .opencode references to .orbit**

```typescript
// Line 218
if (binDir.includes(".orbit"))
  // Line 232
  prompts.log.success("Thank you for using Orbit!")

// Line 269
if (content.includes("# orbit") || content.includes(".orbit/bin"))
  if (trimmed === "# orbit")
    // Line 287
    if (trimmed.includes(".orbit/bin") || trimmed.includes("fish_add_path"))
      // Line 294
      // Line 300
      (trimmed.startsWith("export PATH=") && trimmed.includes(".orbit/bin"))(
        // Line 301
        trimmed.startsWith("fish_add_path") && trimmed.includes(".orbit"),
      )
```

---

### Task 21: github.ts — workflow, triggers, branches, console output

**Files:**

- Modify: `packages/opencode/src/cli/cmd/github.ts` (multiple lines)

CRITICAL: Workflow generation AND runtime parsing must agree on trigger commands and branch prefixes.

- [ ] **Step 1: Change workflow YAML generation (lines 380-408)**

```yaml
name: orbit
jobs:
  orbit:
    if: |
      contains(github.event.comment.body, ' /oc') ||
      startsWith(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, ' /orbit') ||
      startsWith(github.event.comment.body, '/orbit')
    steps:
      - name: Run orbit
        uses: anomalyco/opencode/github@latest # keep upstream action
```

- [ ] **Step 2: Change runtime mention parsing (line 786)**

```typescript
const mentions = process.env["MENTIONS"] || "/orbit,/oc"
```

- [ ] **Step 3: Change GitHub-generated branch prefix (lines 1131, 1133)**

```typescript
return `orbit/${type}-${hex}-${timestamp}`
return `orbit/${type}${issueId}-${timestamp}`
```

- [ ] **Step 4: Change console output (lines 564, 933)**

```typescript
console.log("orbit session", session.id)
console.log("Sending message to orbit...")
```

- [ ] **Step 5: Change agent prompt references (lines 1468, 1606)**

```typescript
"- Git push and PR creation are handled AUTOMATICALLY by the orbit infrastructure after your response",
```

- [ ] **Step 6: Change share link text (line 1407)**

```typescript
const shareUrl = shareId ? `[orbit session](${shareBaseUrl}/s/${shareId})&nbsp;&nbsp;|&nbsp;&nbsp;` : ""
```

Keep: AGENT_USERNAME (`opencode-agent[bot]`), WORKFLOW_FILE path, GitHub App URL, API URLs, share base URLs, social card URLs, `/oc` shorthand, GitHub Action path.

---

### Task 22: Server auth + display (`server/server.ts`)

**Files:**

- Modify: `packages/opencode/src/server/server.ts:82,224,226,256,278,341,415,437,578,580`

CRITICAL: Default auth username must match in server AND all clients (run.ts, attach.ts, worker.ts).

- [ ] **Step 1: Change default username (line 82)**

```typescript
const username = Flag.OPENCODE_SERVER_USERNAME ?? "orbit"
```

- [ ] **Step 2: Change OpenAPI titles and descriptions**

```typescript
title: "orbit",
description: "orbit api",
```

(Both occurrences at lines 224/226 and 578/580)

- [ ] **Step 3: Change API endpoint descriptions**

Replace "OpenCode" with "Orbit" in all `description:` strings (lines 256, 278, 341, 415, 437).

Keep `*.opencode.ai` CORS pattern and `app.opencode.ai` proxy as-is.

---

### Task 22b: Client auth username — run.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/run.ts:223,281,564,659`

- [ ] **Step 1: Change help text**

```typescript
describe: "run orbit with a message",        // line 223
describe: "attach to a running orbit server (e.g., http://localhost:4096)",  // line 281
console.log("orbit session", session.id)      // line 564
```

- [ ] **Step 2: Change auth username default (line 659)**

```typescript
const username = process.env.OPENCODE_SERVER_USERNAME ?? "orbit"
```

---

### Task 22c: Client auth username — attach.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/attach.ts:11,66`

- [ ] **Step 1: Change help text (line 11)**

```typescript
describe: "attach to a running orbit server",
```

- [ ] **Step 2: Change auth username (line 66)**

CRITICAL: Do NOT hardcode `"orbit"`. Use the same env-backed pattern as `server.ts`, `run.ts`, and `worker.ts` so custom `OPENCODE_SERVER_USERNAME` is honored.

```typescript
const username = process.env.OPENCODE_SERVER_USERNAME ?? "orbit"
const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
```

---

### Task 22d: Client auth username — worker.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/tui/worker.ts:155`

- [ ] **Step 1: Change default username**

```typescript
const username = Flag.OPENCODE_SERVER_USERNAME ?? "orbit"
```

---

### Task 23: Server routes descriptions

**Files:**

- Modify: `packages/opencode/src/server/routes/global.ts:24,45,114,135`
- Modify: `packages/opencode/src/server/routes/project.ts:17,39`
- Modify: `packages/opencode/src/server/routes/config.ts:19,40`
- Modify: `packages/opencode/src/server/routes/pty.ts:16`
- Modify: `packages/opencode/src/server/routes/session.ts:28,96,189`
- Modify: `packages/opencode/src/server/routes/experimental.ts:195`

- [ ] **Step 1: Replace "OpenCode" with "Orbit" in all API description strings**

---

### Task 24: mDNS and network defaults

**Files:**

- Modify: `packages/opencode/src/server/mdns.ts:15,16`
- Modify: `packages/opencode/src/cli/network.ts:22,23`

- [ ] **Step 1: Change mDNS names**

```typescript
// mdns.ts
const host = domain ?? "orbit.local"
const name = `orbit-${port}`

// network.ts
describe: "custom domain name for mDNS service (default: orbit.local)",
default: "orbit.local",
```

---

### Task 24b: upgrade.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/upgrade.ts:8,30,48`

- [ ] **Step 1: Change help text and messages**

```typescript
describe: ("upgrade orbit to the latest or a specific version",
  prompts.log.error(`orbit is installed to ${process.execPath}...`))
prompts.log.warn(`orbit upgrade skipped: ${target} is already installed`)
```

---

### Task 24c: pr.ts

**Files:**

- Modify: `packages/opencode/src/cli/cmd/pr.ts:9,90,112,126`

- [ ] **Step 1: Change display text**

```typescript
describe: ("fetch and checkout a GitHub PR branch, then run orbit", UI.println(`Found orbit session: ${sessionUrl}`))
UI.println("Starting orbit...")
reject(new Error(`orbit exited with code ${code}`))
```

---

### Task 25: Provider error messages (`provider/error.ts`)

**Files:**

- Modify: `packages/opencode/src/provider/error.ts:45,84`

- [ ] **Step 1: Change error messages**

```typescript
return "Please reauthenticate with the copilot provider to ensure your credentials work properly with Orbit."

return "Unauthorized: ... try running `orbit auth login <your provider URL>` to re-authenticate."
```

---

### Task 26: Retry messages (`session/retry.ts`)

Keep as-is — references opencode.ai/zen URL (upstream infra).

---

### Task 27: Commit

- [ ] **Step 1: Commit CLI and server changes**

```bash
git add -A && git commit -m "feat: rebrand CLI commands and server display from opencode to orbit"
```

---

## Chunk 5: Misc Source Files

### Task 28: Worktree branch prefix (`worktree/index.ts`)

**Files:**

- Modify: `packages/opencode/src/worktree/index.ts:272`

- [ ] **Step 1: Change branch prefix**

```typescript
const branch = `orbit/${name}`
```

---

### Task 29: Agent plan paths (`agent/agent.ts`)

**Files:**

- Modify: `packages/opencode/src/agent/agent.ts:106`

- [ ] **Step 1: Change .opencode path**

```typescript
[path.join(".orbit", "plans", "*.md")]: "allow",
```

---

### Task 30: Session plan path (`session/index.ts`)

**Files:**

- Modify: `packages/opencode/src/session/index.ts:335`

- [ ] **Step 1: Change .opencode path**

```typescript
? path.join(Instance.worktree, ".orbit", "plans")
```

---

### Task 31: Ripgrep filter (`file/ripgrep.ts`)

**Files:**

- Modify: `packages/opencode/src/file/ripgrep.ts:294`

- [ ] **Step 1: Change .opencode exclusion**

```typescript
if (file.includes(".orbit")) continue
```

---

### Task 32: Installation path check (`installation/index.ts`)

**Files:**

- Modify: `packages/opencode/src/installation/index.ts:94`

- [ ] **Step 1: Change .opencode path check**

```typescript
if (process.execPath.includes(path.join(".orbit", "bin"))) return "curl"
```

---

### Task 33: Skill scanning (`skill/skill.ts`)

**Files:**

- Modify: `packages/opencode/src/skill/skill.ts:122` (comment only)

- [ ] **Step 1: Update comment**

```typescript
// Scan .orbit/skill/ directories
```

NOTE: The actual scanning uses `Config.directories()` which already changed in Task 4/5.

---

### Task 34: Codex auth HTML pages (`plugin/codex.ts`)

**Files:**

- Modify: `packages/opencode/src/plugin/codex.ts:149,180,191`

- [ ] **Step 1: Change HTML titles and text**

```html
<!-- Line 149 -->
<title>Orbit - Codex Authorization Successful</title>

<!-- Line 180 -->
<p>You can close this window and return to Orbit.</p>

<!-- Line 191 -->
<title>Orbit - Codex Authorization Failed</title>
```

---

### Task 35: Agent writer path (`cli/cmd/agent.ts`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/agent.ts:102`

CRITICAL: Must match the reader path in config/paths.ts (`.orbit`).

- [ ] **Step 1: Change project agent directory**

```typescript
scope === "global" ? Global.Path.config : path.join(Instance.worktree, ".orbit"),
```

---

### Task 36: ACP agent info (`acp/agent.ts`)

**Files:**

- Modify: `packages/opencode/src/acp/agent.ts:522,523,531,533,558`

- [ ] **Step 1: Change user-facing display strings**

```typescript
description: "Run `orbit auth login` in the terminal",
name: "Login with orbit",
command: "orbit",
label: "Orbit Login",
name: "Orbit",  // agentInfo.name
```

Keep provider ID `"opencode"` references in logic checks (lines 1566-1591).

---

### Task 37: OAuth callback HTML (`mcp/oauth-callback.ts`)

**Files:**

- Modify: `packages/opencode/src/mcp/oauth-callback.ts:10,21,30`

- [ ] **Step 1: Change HTML titles and text**

```html
<title>Orbit - Authorization Successful</title>
<p>You can close this window and return to Orbit.</p>
<title>Orbit - Authorization Failed</title>
```

---

### Task 38: OAuth provider client name (`mcp/oauth-provider.ts`)

**Files:**

- Modify: `packages/opencode/src/mcp/oauth-provider.ts:41`

- [ ] **Step 1: Change client display name**

```typescript
client_name: "Orbit",
```

Keep `client_uri: "https://opencode.ai"` as-is.

---

### Task 39: MCP SDK client name and auth message (`mcp/index.ts`)

**Files:**

- Modify: `packages/opencode/src/mcp/index.ts:387,429,472`

- [ ] **Step 1: Change SDK client name and auth message**

```typescript
// Lines 387, 472
name: "orbit",

// Line 429
message: `Server "${key}" requires authentication. Run: orbit mcp auth ${key}`
```

---

### Task 40: IDE extension (`ide/index.ts`)

Keep as-is — `sst-dev.opencode` is an external VS Code extension ID.

---

### Task 41: Commit

- [ ] **Step 1: Commit misc source file changes**

```bash
git add -A && git commit -m "feat: rebrand misc source files from opencode to orbit"
```

---

## Chunk 6: Packaging & Binary

### Task 42: package.json bin alias

**Files:**

- Modify: `packages/opencode/package.json:21-23`

- [ ] **Step 1: Add orbit binary alias**

```json
"bin": {
  "opencode": "./bin/opencode",
  "orbit": "./bin/opencode"
},
```

This ensures both `opencode` (upstream compat) and `orbit` (user-facing) work as CLI commands.

---

### Task 43: Launcher cache path (`bin/opencode`)

**Files:**

- Modify: `packages/opencode/bin/opencode:29,53,54,172`

- [ ] **Step 1: Change cache binary path (line 29)**

```javascript
const cached = path.join(scriptDir, ".orbit")
```

- [ ] **Step 2: Change platform binary names (lines 53-54)**

```javascript
const base = "opencode-" + platform + "-" + arch // KEEP - npm package names
const binary = platform === "windows" ? "opencode.exe" : "opencode" // KEEP - upstream binary names
```

Keep lines 53-54 as-is — these reference npm platform package names which stay upstream.

- [ ] **Step 3: Change error message (line 172)**

```javascript
"It seems that your package manager failed to install the right version of the orbit CLI for your platform. ..."
```

---

### Task 44: Postinstall cache path (`script/postinstall.mjs`)

**Files:**

- Modify: `packages/opencode/script/postinstall.mjs:92,112,121`

- [ ] **Step 1: Change console messages**

```javascript
// Line 92
console.log(`orbit binary symlinked: ${targetPath} -> ${sourcePath}`)

// Line 112
const target = path.join(__dirname, "bin", ".orbit")

// Line 121
console.error("Failed to setup orbit binary:", error.message)
```

Keep npm package name references (`opencode-${platform}-${arch}`) as-is.

---

### Task 45: Commit

- [ ] **Step 1: Commit packaging changes**

```bash
git add -A && git commit -m "feat: add orbit binary alias and update packaging"
```

---

## Summary

**Total files modified:** ~40 source files + 1 theme file rename + packaging files
**Total files left unchanged:** All env vars, flags, package imports, URLs, internal code
**Upstream merge risk:** Low — changes concentrated in display strings and path constants

**Consistency checks (all must match):**

- Server auth default: `"orbit"` in `server.ts`, `run.ts`, `attach.ts`, `worker.ts`
- GitHub triggers: workflow generates `/orbit` + `/oc`, runtime parses `/orbit,/oc`
- Branch prefix: `orbit/` in `worktree/index.ts` AND `github.ts`
- Config paths: `.orbit` in readers (`paths.ts`, `config.ts`, `tui.ts`) AND writers (`agent.ts`, `mcp.ts`)
- Config files: `orbit.json`/`orbit.jsonc` in `config.ts`, `mcp.ts` (root AND subdirectory candidates), `migrate-tui-config.ts`, tips
- Theme: renamed to `orbit` with `opencode` legacy alias, all defaults/fallbacks use `"orbit"`
- Binary: `orbit` alias added in `package.json` bin field
