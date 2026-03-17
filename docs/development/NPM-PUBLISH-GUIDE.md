# Publishing @orbit.build Packages to npm

## Overview

Two packages are published to npm under the `@orbit.build` scope:

| Package               | Source                           | Purpose                                                      |
| --------------------- | -------------------------------- | ------------------------------------------------------------ |
| `@orbit.build/sdk`    | `Agent-backend/packages/sdk/js/` | Auto-generated API client (fetch wrapper + TypeScript types) |
| `@orbit.build/plugin` | `Agent-backend/packages/plugin/` | Plugin extension API (types + Zod tool factory)              |

**Publish order matters** — SDK first, then plugin (plugin depends on SDK).

## npm Account

- **Scope:** `@orbit.build` (org on npmjs.com)
- **Account:** `orbit-ai` (email: hello@recursive.ac)
- **2FA:** Passkey-based (macOS Keychain) — requires browser auth for each publish
- **License:** `UNLICENSED` (proprietary, all rights reserved)
- **Access:** Public (users install via `bun install` from the registry)

## Publishing

### Prerequisites

```bash
# Verify you're logged in
npm whoami
# Should return: orbit-ai

# If not logged in:
npm login
```

### Step 1: Publish SDK

```bash
cd Agent-backend/packages/sdk/js
OPENCODE_VERSION=X.Y.Z bun ./script/publish.ts
```

The script will fail at `npm publish` (can't do browser auth non-interactively). Publish the tarball manually:

```bash
npm publish orbit.build-sdk-X.Y.Z.tgz --access public
```

npm opens browser → authenticate with passkey (Touch ID).

### Step 2: Publish Plugin

```bash
cd Agent-backend/packages/plugin
OPENCODE_VERSION=X.Y.Z bun ./script/publish.ts
```

Same pattern — publish the tarball manually:

```bash
npm publish orbit.build-plugin-X.Y.Z.tgz --access public
```

### Step 3: Restore package.json

The publish scripts transform `package.json` exports from source paths (`./src/*.ts`) to dist paths (`./dist/*.js`) before packing. If the script crashes before restoring, the `package.json` is left in a corrupted state. Restore manually:

**SDK** — exports should point to source:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./server": "./src/server.ts",
    "./v2": "./src/v2/index.ts",
    "./v2/client": "./src/v2/client.ts",
    "./v2/gen/client": "./src/v2/gen/client/index.ts",
    "./v2/server": "./src/v2/server.ts"
  }
}
```

**Plugin** — exports should point to source:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./tool": "./src/tool.ts"
  }
}
```

### Step 4: Verify

```bash
npm view @orbit.build/sdk version
npm view @orbit.build/plugin version
```

### Step 5: Clean up tarballs

```bash
rm Agent-backend/packages/sdk/js/orbit.build-sdk-*.tgz
rm Agent-backend/packages/plugin/orbit.build-plugin-*.tgz
```

## Version Strategy

- `OPENCODE_VERSION=X.Y.Z` — publishes that exact version with `latest` tag
- Without the env var, version is derived from git branch name (preview format: `0.0.0-branchname-timestamp`)
- If publishing a version lower than the current `latest`, npm rejects it. Use `--tag orbit` then reassign:
  ```bash
  npm publish *.tgz --access public --tag orbit
  npm dist-tag add @orbit.build/sdk@X.Y.Z latest
  ```

## What the Publish Scripts Do

Both `script/publish.ts` files follow the same pattern:

1. **Compile** TypeScript to `dist/` (`bun tsc`)
2. **Transform** `package.json` exports: `./src/*.ts` → `{ import: "./dist/*.js", types: "./dist/*.d.ts" }`
3. **Pack** tarball (`bun pm pack`)
4. **Publish** to npm (`npm publish *.tgz --tag <channel> --access public`)
5. **Restore** original `package.json` (source-pointing exports)

The SDK script uses recursive export transformation (handles nested v1/v2 structure). The plugin script uses flat transformation.

## Troubleshooting

| Issue                                       | Solution                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `E403 Two-factor authentication required`   | Must authenticate via browser. Run `npm publish *.tgz` from your terminal, not through a script  |
| `Cannot implicitly apply "latest" tag`      | A higher version already exists. Use `--tag orbit` then `npm dist-tag add`                       |
| `package.json` has `./dist/*.js.js` paths   | Publish script ran twice without restore. Replace exports with source paths above                |
| `EOTP` with browser URL                     | npm wants passkey auth. Press ENTER, authenticate in browser                                     |
| `npm unpublish` blocked                     | Use `--force` for last version. Note: blocks republishing same version for 24 hours              |
| `Tag name must not be a valid SemVer range` | Don't use `--tag latest`. Use a custom name like `--tag orbit` then reassign with `dist-tag add` |

## Production Install Path

The engine (`packages/opencode/src/config/config.ts`) writes `@orbit.build/plugin` into user `.orbit/package.json` files and runs `bun install`. The constant `PUBLIC_PLUGIN_PACKAGE` controls the package name. Legacy `@opencode-ai/plugin` entries are auto-migrated on next run.
