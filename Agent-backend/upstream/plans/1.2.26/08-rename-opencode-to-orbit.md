# Phase 8: Rename opencode -> Orbit

## How to Execute

**Find-and-replace in our fork — no upstream files to copy. This phase only edits our fork.**

```bash
cd Agent-backend/packages/opencode

# Audit current state
grep -rn "opencode" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

# Apply safe bulk patterns (see categories below)
# Then manually review context-dependent occurrences
```

## Summary

Rename all user-facing "opencode" strings to "Orbit" across the engine codebase (`packages/opencode/src/`). There are **212 occurrences across 58 files**. Each occurrence falls into one of five categories with different rename strategies. This plan categorizes every occurrence and defines safe find-and-replace patterns.

---

## Rename Categories

### Category 1: MUST Rename (User-Facing Strings)

These are strings that end users see in CLI output, error messages, help text, URLs shown to users, and User-Agent headers.

| File                                  | Line             | Current                                                                                       | Rename To                                                                         | Notes                                   |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| **CLI Help & Commands**               |                  |                                                                                               |                                                                                   |                                         |
| `cli/cmd/auth.ts` (-> `providers.ts`) | 344              | `opencode: 0` (priority key)                                                                  | `orbit: 0`                                                                        | Provider ID in priority map             |
| `cli/cmd/auth.ts`                     | 371              | `opencode: "recommended"` (hint)                                                              | `orbit: "recommended"`                                                            | Login hint text                         |
| `cli/cmd/auth.ts`                     | 447              | `if (provider === "opencode")`                                                                | `if (provider === "orbit")`                                                       | Provider check                          |
| `cli/cmd/auth.ts`                     | 448              | `"Create an api key at https://opencode.ai/auth"`                                             | `"Create an api key at https://orbit.dev/auth"`                                   | User-facing URL                         |
| `cli/cmd/auth.ts`                     | 297              | `${url}/.well-known/opencode`                                                                 | Keep (server-side well-known path)                                                | See Category 4                          |
| `cli/cmd/auth.ts`                     | 457              | `"...Read more: https://opencode.ai/docs/providers/..."`                                      | `"...Read more: https://orbit.dev/docs/providers/..."`                            | Doc URL                                 |
| `cli/cmd/github.ts`                   | 147              | `"opencode-agent[bot]"`                                                                       | `"orbit-agent[bot]"`                                                              | GitHub bot username                     |
| `cli/cmd/github.ts`                   | 149              | `".github/workflows/opencode.yml"`                                                            | `".github/workflows/orbit.yml"`                                                   | Workflow filename                       |
| `cli/cmd/github.ts`                   | 258              | `"https://opencode.ai/docs/github/#usage-examples"`                                           | `"https://orbit.dev/docs/github/#usage-examples"`                                 | Doc URL                                 |
| `cli/cmd/github.ts`                   | 340              | `"https://github.com/apps/opencode-agent"`                                                    | `"https://github.com/apps/orbit-agent"`                                           | GitHub App URL                          |
| `cli/cmd/github.ts`                   | 377              | `"https://api.opencode.ai/get_github_app_installation..."`                                    | `"https://api.orbit.dev/get_github_app_installation..."`                          | API URL                                 |
| `cli/cmd/github.ts`                   | 420              | `uses: anomalyco/opencode/github@latest`                                                      | `uses: anomalyco/orbit/github@latest`                                             | GitHub Action ref                       |
| `cli/cmd/pr.ts`                       | 95               | `// Check for opencode session link`                                                          | `// Check for orbit session link`                                                 | Comment                                 |
| `cli/cmd/pr.ts`                       | 125              | `// Launch opencode TUI`                                                                      | `// Launch orbit TUI`                                                             | Comment                                 |
| `cli/cmd/pr.ts`                       | 127-128          | `opencodeArgs`, `opencodeProcess`                                                             | `orbitArgs`, `orbitProcess`                                                       | Variable names (already spawns "orbit") |
| `cli/cmd/mcp.ts`                      | 667              | `name: "opencode-debug"`                                                                      | `name: "orbit-debug"`                                                             | MCP client name                         |
| `cli/cmd/mcp.ts`                      | 710              | `name: "opencode-debug"`                                                                      | `name: "orbit-debug"`                                                             | MCP client name                         |
| `cli/cmd/models.ts`                   | 67-68            | `a.startsWith("opencode")` / `b.startsWith("opencode")`                                       | `a.startsWith("orbit")` / `b.startsWith("orbit")`                                 | Sort priority                           |
| **Error Messages & User Text**        |                  |                                                                                               |                                                                                   |                                         |
| `session/retry.ts`                    | 74               | `"https://opencode.ai/zen"`                                                                   | `"https://orbit.dev/zen"`                                                         | Rate limit error URL                    |
| **User-Agent Headers**                |                  |                                                                                               |                                                                                   |                                         |
| `session/llm.ts`                      | 221              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `plugin/codex.ts`                     | 545              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `plugin/codex.ts`                     | 569              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `plugin/codex.ts`                     | 630              | `\`opencode/${Installation.VERSION} (${os.platform()}...)\``                                  | `\`orbit/${Installation.VERSION}...\``                                            | HTTP header                             |
| `plugin/copilot.ts`                   | 168              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `plugin/copilot.ts`                   | 246              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `plugin/copilot.ts`                   | 276              | `"User-Agent": \`opencode/${Installation.VERSION}\``                                          | `"User-Agent": \`orbit/${Installation.VERSION}\``                                 | HTTP header                             |
| `provider/provider.ts`                | 518              | `"User-Agent": \`opencode/${Installation.VERSION} gitlab...\``                                | `"User-Agent": \`orbit/${Installation.VERSION} gitlab...\``                       | HTTP header                             |
| `tool/webfetch.ts`                    | 70               | `"User-Agent": "opencode"`                                                                    | `"User-Agent": "orbit"`                                                           | HTTP header                             |
| **HTTP Headers (API identification)** |                  |                                                                                               |                                                                                   |                                         |
| `session/llm.ts`                      | 212              | `input.model.providerID.startsWith("opencode")`                                               | `.startsWith("orbit")`                                                            | Provider check                          |
| `session/llm.ts`                      | 214-217          | `"x-opencode-project"`, `"x-opencode-session"`, `"x-opencode-request"`, `"x-opencode-client"` | `"x-orbit-project"`, `"x-orbit-session"`, `"x-orbit-request"`, `"x-orbit-client"` | Custom headers                          |
| `provider/provider.ts`                | 402-403          | `"HTTP-Referer": "https://opencode.ai/"`, `"X-Title": "opencode"`                             | `"https://orbit.dev/"`, `"orbit"`                                                 | OpenRouter headers                      |
| `provider/provider.ts`                | 413-414          | Same pattern for ai-gateway                                                                   | Same rename                                                                       |                                         |
| `provider/provider.ts`                | 498-499          | Same pattern for additional provider                                                          | Same rename                                                                       |                                         |
| `provider/provider.ts`                | 639              | `"X-Cerebras-3rd-Party-Integration": "opencode"`                                              | `"orbit"`                                                                         | Cerebras header                         |
| `provider/provider.ts`                | 649-650          | OpenRouter headers (another instance)                                                         | Same rename                                                                       |                                         |
| **Uninstall Commands**                |                  |                                                                                               |                                                                                   |                                         |
| `cli/cmd/uninstall.ts`                | 141-147          | `"opencode-ai"`, `"opencode"` in uninstall commands                                           | `"orbit-ai"` or keep as-is                                                        | See Notes                               |
| `cli/cmd/uninstall.ts`                | 192-198, 205     | Same in actual command arrays                                                                 | Same                                                                              |                                         |
| **Installation & Upgrade**            |                  |                                                                                               |                                                                                   |                                         |
| `installation/index.ts`               | 127-135          | `"opencode"` in brew/scoop/choco detection                                                    | Keep for backward compat                                                          | These detect the installed package name |
| `installation/index.ts`               | 150              | `"opencode"` / `"opencode-ai"` package name                                                   | Keep                                                                              | Detection logic                         |
| `installation/index.ts`               | 167-171          | `"anomalyco/tap/opencode"`, `"opencode"`                                                      | Keep                                                                              | Brew formula names                      |
| `installation/index.ts`               | 183-189, 222-228 | `"opencode-ai@${target}"`, `"opencode"`                                                       | Keep for now                                                                      | Upgrade commands                        |
| `installation/index.ts`               | 250              | `"opencode/${CHANNEL}/${VERSION}/${Flag.OPENCODE_CLIENT}"`                                    | `"orbit/${CHANNEL}/..."`                                                          | USER_AGENT string                       |
| `installation/index.ts`               | 284              | `"https://formulae.brew.sh/api/formula/opencode.json"`                                        | Keep                                                                              | External API URL                        |
| `installation/index.ts`               | 303              | `"/opencode-ai/${channel}"`                                                                   | Keep                                                                              | npm registry path                       |
| `installation/index.ts`               | 316              | Chocolatey API URL with `opencode`                                                            | Keep                                                                              | External API URL                        |
| `installation/index.ts`               | 331              | Scoop bucket URL with `opencode.json`                                                         | Keep                                                                              | External API URL                        |
| `installation/index.ts`               | 344              | `"https://api.github.com/repos/anomalyco/opencode/releases/latest"`                           | Keep                                                                              | External API URL                        |

### Category 2: SHOULD Rename (Internal but Visible in Logs/Debug)

| File                                       | Line        | Current                                                | Rename To                                |
| ------------------------------------------ | ----------- | ------------------------------------------------------ | ---------------------------------------- |
| `plugin/codex.ts`                          | 105         | `originator: "opencode"`                               | `originator: "orbit"`                    |
| `plugin/codex.ts`                          | 628         | `output.headers.originator = "opencode"`               | `= "orbit"`                              |
| `auth/index.ts`                            | 8           | `OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"`         | `"orbit-oauth-dummy-key"`                |
| `lsp/server.ts`                            | 1253        | `"opencode-jdtls-data"` (temp dir prefix)              | `"orbit-jdtls-data"`                     |
| `acp/agent.ts`                             | 538         | `id: "opencode-login"`                                 | `id: "orbit-login"`                      |
| `mcp/oauth-provider.ts`                    | 44          | `client_uri: "https://opencode.ai"`                    | `"https://orbit.dev"`                    |
| `server/server.ts`                         | 120-121     | `*.opencode.ai` CORS regex                             | Add `*.orbit.dev` pattern                |
| `server/server.ts`                         | 199-200     | `x-opencode-workspace`, `x-opencode-directory` headers | `x-orbit-workspace`, `x-orbit-directory` |
| `server/server.ts`                         | 565, 567    | `app.opencode.ai` proxy                                | `app.orbit.dev`                          |
| `control-plane/adaptors/worktree.ts`       | 42          | `"http://opencode.internal"`                           | `"http://orbit.internal"`                |
| `control-plane/adaptors/worktree.ts`       | 44          | `"x-opencode-directory"`                               | `"x-orbit-directory"`                    |
| `control-plane/workspace-server/server.ts` | 25-26       | `x-opencode-workspace`, `x-opencode-directory`         | `x-orbit-workspace`, `x-orbit-directory` |
| `cli/cmd/tui/worker.ts`                    | 64          | `"http://opencode.internal"`                           | `"http://orbit.internal"`                |
| `cli/cmd/run.ts`                           | 681         | `"http://opencode.internal"`                           | `"http://orbit.internal"`                |
| `cli/cmd/tui/util/clipboard.ts`            | (if exists) | `"opencode-clipboard.png"` temp file                   | `"orbit-clipboard.png"`                  |
| `mcp/index.ts`                             | 474         | `["opencode", "orbit"].includes(cmd)`                  | `["orbit"].includes(cmd)` or keep both   |
| `ide/index.ts`                             | 56          | `"sst-dev.opencode"` VS Code extension ID              | Keep (external extension name)           |

### Category 3: CANNOT Rename (External Package Names)

These are npm package names, external API identifiers, or third-party references that we do not control:

| File                    | Current                                                   | Reason                                       |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Multiple files          | `@opencode-ai/util/*` imports                             | npm package name                             |
| Multiple files          | `@opencode-ai/plugin` imports                             | npm package name                             |
| Multiple files          | `@opencode-ai/sdk` imports                                | npm package name (already rebranded exports) |
| `plugin/index.ts`       | `@gitlab/opencode-gitlab-auth`                            | External GitLab package                      |
| `plugin/index.ts`       | `"opencode-anthropic-auth@0.0.13"`                        | npm package name (BUILTIN array)             |
| `plugin/index.ts`       | `"opencode-openai-codex-auth"`, `"opencode-copilot-auth"` | npm package names in skip list               |
| `config/config.ts`      | `"@opencode-ai/plugin"` in dependency version checks      | npm package name                             |
| `ide/index.ts`          | `"sst-dev.opencode"`                                      | VS Code extension marketplace ID             |
| `installation/index.ts` | External API URLs (brew, npm, chocolatey, scoop, github)  | External service URLs                        |

### Category 4: CONTEXT-DEPENDENT (Backward Compatibility)

| File                           | Current                                                    | Decision                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Config file paths**          |                                                            |                                                                                                                                |
| `config/config.ts`             | `"opencode.json"`, `"opencode.jsonc"`                      | **Keep for now** -- config file names are a user-facing contract. Changing breaks existing projects. Consider supporting both. |
| `config/config.ts`             | `".opencode/"` directory                                   | **Keep for now** -- same reasoning.                                                                                            |
| `config/config.ts`             | `"$schema": "https://opencode.ai/config.json"`             | **Keep** -- schema URL must resolve.                                                                                           |
| `config/config.ts`             | `".well-known/opencode"` remote config path                | **Keep** -- server-side path.                                                                                                  |
| `config/config.ts`             | `"https://opencode.ai/docs/..."` doc URLs in `.describe()` | **Rename** to orbit.dev URLs                                                                                                   |
| `config/paths.ts`              | Data directory paths                                       | Check if already uses `orbit`                                                                                                  |
| `config/migrate-tui-config.ts` | `"https://opencode.ai/tui.json"` schema URL                | **Keep**                                                                                                                       |
| `config/migrate-tui-config.ts` | `opencodeFiles()` function name                            | **Rename** to `configFiles()`                                                                                                  |
| `config/tui.ts`                | `"opencode.json"` references in comments                   | Update comments                                                                                                                |
| **Provider IDs**               |                                                            |                                                                                                                                |
| `provider/provider.ts`         | 160: `async opencode(input)` (provider handler)            | **Rename** to `orbit`                                                                                                          |
| `provider/provider.ts`         | 166: `config.provider?.opencode.options`                   | **Rename**                                                                                                                     |
| `provider/provider.ts`         | 1307: `providerID.startsWith("opencode")`                  | **Rename**                                                                                                                     |
| `provider/models-snapshot.ts`  | 21018-21024: `"opencode"` provider definition              | **Rename** ID and API URL                                                                                                      |
| `tool/registry.ts`             | 157: `model.providerID === "opencode"`                     | **Rename**                                                                                                                     |
| **ACP Provider References**    |                                                            |                                                                                                                                |
| `acp/agent.ts`                 | 1613-1638: `"opencode"` provider lookups                   | **Rename**                                                                                                                     |
| `acp/agent.ts`                 | 1751, 1758: `opencode:` object keys                        | **Rename**                                                                                                                     |
| **Data directory**             |                                                            |                                                                                                                                |
| `project/project.ts`           | 109, 148: `.git/opencode` cache file                       | **Keep** -- cached project ID file, changing name would re-trigger ID generation                                               |

### Category 5: Comments and Documentation Strings

| File                           | Line    | Current                                                  | Action |
| ------------------------------ | ------- | -------------------------------------------------------- | ------ |
| `config/config.ts`             | 97-102  | Config loading order comments mentioning `opencode.json` | Update |
| `config/config.ts`             | 484     | `getPluginName("oh-my-opencode@2.4.3")` example          | Update |
| `config/config.ts`             | 502-504 | `opencode.json` references in doc comments               | Update |
| `config/config.ts`             | 511     | `"oh-my-opencode"` example                               | Update |
| `config/config.ts`             | 515     | `"oh-my-opencode@2.4.3"` example                         | Update |
| `config/tui.ts`                | 96      | "mirroring the old opencode.json shape"                  | Update |
| `config/migrate-tui-config.ts` | 40      | "Migrates tui-specific keys from opencode.json"          | Update |

---

## Strategy

### Safe Bulk Find-and-Replace Patterns

These patterns can be applied with `replace_all` safely:

| Pattern                                  | Replacement                            | Scope              | Count |
| ---------------------------------------- | -------------------------------------- | ------------------ | ----- |
| `"User-Agent": \`opencode/`              | `"User-Agent": \`orbit/`               | All `.ts` files    | ~8    |
| `"x-opencode-`                           | `"x-orbit-`                            | All `.ts` files    | ~7    |
| `opencode.internal`                      | `orbit.internal`                       | All `.ts` files    | ~3    |
| `opencode-agent` (GitHub bot/app)        | `orbit-agent`                          | `github.ts` only   | ~3    |
| `opencode.ai/docs/`                      | `orbit.dev/docs/`                      | All `.ts` files    | ~3    |
| `"X-Title": "opencode"`                  | `"X-Title": "orbit"`                   | `provider.ts` only | ~3    |
| `"HTTP-Referer": "https://opencode.ai/"` | `"HTTP-Referer": "https://orbit.dev/"` | `provider.ts` only | ~3    |

### Patterns Requiring Manual Review

| Pattern                      | Why Manual                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `"opencode"` as provider ID  | Must update provider handler, config references, and models-snapshot consistently |
| `@opencode-ai/` imports      | CANNOT rename (npm packages)                                                      |
| `opencode.json` config files | Backward compatibility -- need dual support                                       |
| `.opencode/` directory       | Backward compatibility                                                            |
| `opencode.ai` domain URLs    | Some are external APIs (keep), some are doc links (rename)                        |
| `OPENCODE_` env var prefixes | Phase 8 scope but large blast radius (50+ occurrences in flag.ts alone)           |

### Environment Variable / Flag Rename Decision

The `OPENCODE_*` environment variables in `flag/flag.ts` (30+ flags) present a backward compatibility challenge:

**Option A: Full rename to `ORBIT_*`**

- Pros: Clean branding
- Cons: Breaks all existing users' env vars, CI configs, docs

**Option B: Support both with `ORBIT_*` preferred**

- Pattern: `const ORBIT_EXPERIMENTAL = truthy("ORBIT_EXPERIMENTAL") || truthy("OPENCODE_EXPERIMENTAL")`
- Pros: Non-breaking migration
- Cons: Doubles the flag definitions

**Option C: Defer**

- Keep `OPENCODE_*` for now
- Rename in a future major version
- Pros: Zero risk
- Cons: Inconsistent branding

**Recommendation:** Option C (defer). Flag names are not user-facing in the UI -- they are set by developers in shell configs. Renaming them gains little and risks breaking existing setups. Address in a future version with Option B.

---

## Files Changed (Complete List)

### MUST Rename (28 files)

| File                                       | Category                             | Occurrences |
| ------------------------------------------ | ------------------------------------ | ----------- |
| `session/llm.ts`                           | Headers, provider check              | 6           |
| `session/retry.ts`                         | Error URL                            | 1           |
| `provider/provider.ts`                     | Headers, provider handler, URLs      | 15          |
| `provider/models-snapshot.ts`              | Provider definition                  | 6           |
| `plugin/codex.ts`                          | User-Agent, originator               | 6           |
| `plugin/copilot.ts`                        | User-Agent                           | 3           |
| `cli/cmd/auth.ts` (providers.ts)           | Priority, hints, URLs                | 7           |
| `cli/cmd/github.ts`                        | Bot name, URLs, workflow             | 11          |
| `cli/cmd/pr.ts`                            | Comments, variable names             | 6           |
| `cli/cmd/mcp.ts`                           | Client names                         | 2           |
| `cli/cmd/models.ts`                        | Sort priority                        | 2           |
| `cli/cmd/uninstall.ts`                     | Package names (partial -- see notes) | 15          |
| `tool/webfetch.ts`                         | User-Agent                           | 1           |
| `tool/registry.ts`                         | Provider check                       | 1           |
| `installation/index.ts`                    | USER_AGENT, some package refs        | ~5          |
| `acp/agent.ts`                             | Provider IDs, login ID               | 10          |
| `auth/index.ts`                            | OAuth dummy key                      | 1           |
| `lsp/server.ts`                            | Temp dir prefix                      | 1           |
| `mcp/oauth-provider.ts`                    | Client URI                           | 1           |
| `mcp/index.ts`                             | BUN_BE_BUN check                     | 1           |
| `server/server.ts`                         | CORS, headers, proxy                 | 7           |
| `control-plane/adaptors/worktree.ts`       | Internal URL, header                 | 2           |
| `control-plane/workspace-server/server.ts` | Headers                              | 2           |
| `cli/cmd/tui/worker.ts`                    | Internal URL                         | 1           |
| `cli/cmd/run.ts`                           | Internal URL                         | 1           |
| `cli/cmd/tui/util/clipboard.ts`            | Temp file name                       | 1           |
| `config/config.ts`                         | Doc URLs in .describe()              | 3           |
| `config/migrate-tui-config.ts`             | Function name, comments              | 3           |

### CANNOT Rename (Skip These)

| File                    | Pattern                                        | Reason               |
| ----------------------- | ---------------------------------------------- | -------------------- |
| 15+ files               | `@opencode-ai/*` imports                       | npm packages         |
| `plugin/index.ts`       | `@gitlab/opencode-gitlab-auth`                 | External package     |
| `plugin/index.ts`       | `"opencode-anthropic-auth"` etc.               | npm package names    |
| `ide/index.ts`          | `"sst-dev.opencode"`                           | VS Code extension ID |
| `installation/index.ts` | External API URLs                              | Third-party services |
| `config/config.ts`      | `"opencode.json"` file names                   | Backward compat      |
| `config/config.ts`      | `".opencode/"` directory                       | Backward compat      |
| `config/config.ts`      | `"https://opencode.ai/config.json"` schema URL | Must resolve         |
| `project/project.ts`    | `.git/opencode` cache file                     | Backward compat      |

---

## Verification

```bash
cd Agent-backend/packages/opencode

# Count remaining "opencode" in user-facing positions
# (should only be package imports, config file names, and external URLs)
grep -rn '"opencode"' src/ --include="*.ts" --include="*.tsx" | grep -v '@opencode-ai' | grep -v 'opencode.json' | grep -v '.opencode/' | grep -v 'node_modules'

# Verify no broken imports
bun run typecheck

# Verify "orbit" appears in key places
grep -rn '"orbit"' src/ --include="*.ts" | head -20

# Provider ID renamed
grep -rn 'providerID.*"opencode"' src/ --include="*.ts"
# Expected: 0 results (should be "orbit")

# User-Agent renamed
grep -rn 'User-Agent.*opencode' src/ --include="*.ts"
# Expected: 0 results (should be "orbit")

# Custom headers renamed
grep -rn 'x-opencode-' src/ --include="*.ts"
# Expected: 0 results (should be "x-orbit-")
```

## Notes

- **`uninstall.ts`**: The uninstall commands reference `opencode-ai` (npm) and `opencode` (brew/scoop/choco). These are the actual installed package names and CANNOT be renamed unless we publish under new names. For the CLI binary (which is already `orbit`), the uninstall flow should detect the installation method and use the correct package name.
- **`installation/index.ts`**: External URLs for version checking (brew formula, npm registry, chocolatey, scoop, GitHub releases) all use `opencode` in their paths. These are third-party hosted and cannot be changed unless we create new listings.
- **`models-snapshot.ts`**: The `"opencode"` provider entry at line ~21018 is a snapshot of models.dev data. The upstream provider ID is `"opencode"` in the models.dev registry. We need to either: (a) map it to `"orbit"` at runtime, or (b) add `"orbit"` as an alias.
- **CORS regex**: `server/server.ts` line 121 has `/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/`. Add `orbit.dev` pattern alongside, don't remove the opencode one (backward compat).
- **Dual-support pattern for headers**: The server reads `x-opencode-workspace` headers from clients. If existing desktop app versions send `x-opencode-*`, we need to support both during transition. Pattern: `c.req.header("x-orbit-workspace") ?? c.req.header("x-opencode-workspace")`.
