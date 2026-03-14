# Rename `@opencode-ai/*` → `@orbit.build/*` Packages

## Context

The Agent-backend engine auto-generates `.orbit/package.json` in every user project with `"@opencode-ai/plugin"` as a dependency. Users can see this on disk. The `@opencode-ai` branding leaks OpenCode's upstream identity — it should read `@orbit.build` to match the product name.

**npm scope**: `@orbit.build` org was just created on npmjs.com under the `orbit-ai` account. The org exists but has zero published packages. Before the rename can ship in a release:

1. **Log in to npm on the dev machine**: `npm login` (authenticate as the `orbit-ai` account)
2. **No extra npm config needed** — the org is on the free plan, which supports unlimited public packages. Publishing with `--access public` works immediately.
3. **Publish order matters** — SDK first, then plugin (plugin depends on SDK). See step 8.
4. **npm 2FA** — if the `orbit-ai` account has 2FA enabled, the publish commands will prompt for a one-time code. No special setup required, just have the authenticator app ready.

**Upstream divergence**: Three repo policy documents previously stated `@opencode-ai/*` imports should not be renamed for upstream mergeability (`orbit-rebrand.md`, `upstream-sync.md`, `UPSTREAM-SYNC-PROCESS.md`). This rename intentionally diverges — those documents are updated in this plan. The trade-off is ~300+ extra merge conflict points on future upstream syncs, accepted in exchange for clean product branding.

**Production install path**: `installDependencies()` in `config.ts` writes a dependency into user `.orbit/package.json` files and runs `bun install` from the npm registry (not the workspace). Both `@orbit.build/plugin` AND `@orbit.build/sdk` must be published to npm before any release — `plugin` depends on `sdk` (`plugin/package.json:19`), so a standalone plugin publish would fail to install.

**SDK in generated code**: `generate.ts:18` embeds `import { createOrbitClient } from "@opencode-ai/sdk"` into OpenAPI code samples. After the rename, these will read `@orbit.build/sdk`, so that package must also exist on npm for generated docs to be accurate.

---

## Rename Map

| Old                    | New                    |
| ---------------------- | ---------------------- |
| `@opencode-ai/plugin`  | `@orbit.build/plugin`  |
| `@opencode-ai/sdk`     | `@orbit.build/sdk`     |
| `@opencode-ai/util`    | `@orbit.build/util`    |
| `@opencode-ai/script`  | `@orbit.build/script`  |
| `@opencode-ai/app`     | `@orbit.build/app`     |
| `@opencode-ai/ui`      | `@orbit.build/ui`      |
| `@opencode-ai/desktop` | `@orbit.build/desktop` |

**Dual SDK note**: Two `package.json` files both declare `"name": "@opencode-ai/sdk"` — the root-level `packages/opencode-sdk/` (compiled runtime consumed by Orbit frontend) and `Agent-backend/packages/sdk/js/` (source + codegen consumed by Agent-backend workspace). They live in separate Bun workspaces, so no conflict. The rename handles both.

---

## Steps

### 1. Extract plugin package constant and add migration logic

In `Agent-backend/packages/opencode/src/config/config.ts`, replace the 4 hard-coded `"@opencode-ai/plugin"` string literals with a constant, add legacy cleanup, and add post-install verification:

```ts
// The public npm package name written into user .orbit/package.json files.
const PUBLIC_PLUGIN_PACKAGE = '@orbit.build/plugin';

// Legacy package names to clean up from existing user projects.
const LEGACY_PLUGIN_PACKAGES = ['@opencode-ai/plugin'];
```

Update `installDependencies()` to remove legacy deps and verify the install succeeded:

```ts
export async function installDependencies(dir: string): Promise<void> {
  const pkg = path.join(dir, 'package.json');
  const targetVersion = Installation.isLocal() ? '*' : Installation.VERSION;

  const json = await Filesystem.readJson<{ dependencies?: Record<string, string> }>(pkg).catch(
    () => ({
      dependencies: {},
    })
  );

  // Remove legacy package names
  for (const legacy of LEGACY_PLUGIN_PACKAGES) {
    delete json.dependencies?.[legacy];
  }

  json.dependencies = {
    ...json.dependencies,
    [PUBLIC_PLUGIN_PACKAGE]: targetVersion,
  };
  await Filesystem.writeJson(pkg, json);

  const gitignore = path.join(dir, '.gitignore');
  const hasGitIgnore = Filesystem.exists(gitignore);
  if (!hasGitIgnore)
    await Filesystem.write(
      gitignore,
      ['node_modules', 'package.json', 'bun.lock', '.gitignore'].join('\n')
    );

  await BunProc.run(['install', ...(proxied() || process.env.CI ? ['--no-cache'] : [])], {
    cwd: dir,
  }).catch((err: unknown) => {
    log.warn('failed to install dependencies', { dir, error: err });
  });

  // Verify the correct version was actually installed — don't let a silent failure
  // or a stale cached version leave the project in a false-success state.
  const pluginPkgPath = path.join(
    dir,
    'node_modules',
    ...PUBLIC_PLUGIN_PACKAGE.split('/'),
    'package.json'
  );
  const installedOk = await (async () => {
    if (!Filesystem.exists(pluginPkgPath)) return false;
    if (targetVersion === '*') return true; // Local dev — any version is fine
    const installed = await Filesystem.readJson<{ version?: string }>(pluginPkgPath).catch(
      () => null
    );
    if (!installed?.version) return false;
    if (targetVersion === 'latest') return true; // Version check handled by PackageRegistry.isOutdated
    return installed.version === targetVersion;
  })();

  if (!installedOk) {
    // Remove the dependency key so needsInstall() retries on next run
    delete json.dependencies?.[PUBLIC_PLUGIN_PACKAGE];
    await Filesystem.writeJson(pkg, json);
    log.warn('plugin install verification failed, will retry on next run', {
      dir,
      expected: pluginPkgPath,
      targetVersion,
    });
  }
}
```

Update `needsInstall()` to detect legacy deps, force migration, and verify on-disk presence:

```ts
export async function needsInstall(dir: string): Promise<boolean> {
  // ... existing writable check ...

  const nodeModules = path.join(dir, 'node_modules');
  if (!existsSync(nodeModules)) return true;

  const pkg = path.join(dir, 'package.json');
  const pkgExists = Filesystem.exists(pkg);
  if (!pkgExists) return true;

  const parsed = await Filesystem.readJson<{ dependencies?: Record<string, string> }>(pkg).catch(
    () => null
  );
  const dependencies = parsed?.dependencies ?? {};

  // Check current package name
  const depVersion = dependencies[PUBLIC_PLUGIN_PACKAGE];

  // If missing under current name, also check legacy names — if found under a legacy
  // name, force reinstall to trigger migration in installDependencies()
  if (!depVersion) return true;

  // Verify the correct version is actually installed on disk, not just declared
  const pluginPkgPath = path.join(
    dir,
    'node_modules',
    ...PUBLIC_PLUGIN_PACKAGE.split('/'),
    'package.json'
  );
  if (!Filesystem.exists(pluginPkgPath)) return true;

  const targetVersion = Installation.isLocal() ? 'latest' : Installation.VERSION;

  // For pinned versions, verify the installed version matches — a stale cached
  // version from a failed upgrade should trigger a reinstall
  if (targetVersion !== 'latest' && targetVersion !== '*') {
    const installed = await Filesystem.readJson<{ version?: string }>(pluginPkgPath).catch(
      () => null
    );
    if (installed?.version !== targetVersion) return true;
  }
  if (targetVersion === 'latest') {
    const isOutdated = await PackageRegistry.isOutdated(PUBLIC_PLUGIN_PACKAGE, depVersion, dir);
    if (!isOutdated) return false;
    log.info('Cached version is outdated, proceeding with install', {
      pkg: PUBLIC_PLUGIN_PACKAGE,
      cachedVersion: depVersion,
    });
    return true;
  }
  if (depVersion === targetVersion) return false;
  return true;
}
```

### 2. Rename SDK directory

```bash
git mv packages/opencode-sdk packages/orbit-sdk
```

### 3. Scope rename via vetted file list

Use a single search surface for both replacement and verification:

```bash
# Build the file list (one source of truth)
rg -l '@opencode-ai/' . \
  -g '*.{ts,tsx,js,jsx,mjs,cjs,d.ts,json,md,css}' \
  -g '!**/node_modules/**' \
  -g '!**/dist/**' \
  -g '!**/bun.lock*' \
  -g '!**/upstream/**' \
  -g '!reference/opencode-reference/**' \
  > /tmp/rename-targets.txt

# Review the list before replacing
cat /tmp/rename-targets.txt

# Apply the rename
xargs sed -i '' 's/@opencode-ai\//@orbit.build\//g' < /tmp/rename-targets.txt
```

**Why `rg -l` instead of `find`**: The original plan used `find ... -name "*.ts"` which missed the build-critical CSS import in `Agent-backend/packages/app/src/index.css` (`@import "@opencode-ai/ui/styles/tailwind"`). Using `rg -l` with a comprehensive glob list covers all file types.

**Excluded directories:**

- `upstream/` — read-only upstream reference copy; renaming breaks future diff/sync workflows (66 occurrences in 55 files)
- `reference/opencode-reference/` — separate git repo used as upstream reference; not active Orbit code
- `node_modules/`, `dist/` — generated/installed artifacts

**Covers (~800 occurrences across ~230 active files):**

- 10 `package.json` files (7 name fields + dependency entries)
- ~600 TypeScript imports across ~214 source files
- 1 CSS import (`Agent-backend/packages/app/src/index.css`)
- `turbo.json` task reference (`@opencode-ai/app#test`)
- 104 occurrences in `openapi.json`
- ~78 occurrences across documentation/CLAUDE.md files
- Vitest mock in `providers-settings.test.tsx`
- `Agent-backend/.opencode/package.json` (plugin config)
- Publish/build script references
- `generate.ts:18` SDK import in code samples

### 4. Regenerate SDK from renamed OpenAPI spec

```bash
cd Agent-backend && ./script/generate.ts
```

Regenerating ensures auto-generated code in `packages/sdk/js/src/gen/` stays in sync with `openapi.json` as its source of truth — otherwise the next `generate.ts` run would revert.

### 5. Update path references for renamed SDK directory

| File               | Lines   | Change                                                     |
| ------------------ | ------- | ---------------------------------------------------------- |
| `tsconfig.json`    | 47-49   | `./packages/opencode-sdk/...` → `./packages/orbit-sdk/...` |
| `vite.config.ts`   | 69-74   | `./packages/opencode-sdk/...` → `./packages/orbit-sdk/...` |
| `vitest.config.ts` | 127-132 | `./packages/opencode-sdk/...` → `./packages/orbit-sdk/...` |

Alias keys (`@opencode-ai/sdk` → `@orbit.build/sdk`) are handled by step 3's sed. Verify the path values manually.

### 6. Update upstream strategy documents

These documents must reflect the intentional fork divergence:

- `Agent-backend/docs/plans/orbit-rebrand.md` — remove `@opencode-ai/*` from "Keep as-is" section
- `Agent-backend/docs/plans/git/upstream-sync.md` — move `@opencode-ai/*` from "Leave as opencode" to "Rename to Orbit" column
- `Agent-backend/upstream/UPSTREAM-SYNC-PROCESS.md` — remove `@opencode-ai/plugin` and `@opencode-ai/sdk` from "CANNOT rename" row

### 7. Regenerate lock files

```bash
# Prefer incremental resolution first
bun install
cd Agent-backend && bun install

# Only delete lockfiles if Bun can't converge:
# rm bun.lock && bun install
# cd Agent-backend && rm bun.lock && bun install
```

### 8. Publish `@orbit.build/sdk` and `@orbit.build/plugin` to npm

Both packages must exist on npm before any release. The SDK must be published first because the plugin depends on it (`plugin/package.json:19: "@orbit.build/sdk": "workspace:*"`).

**Do NOT use raw `npm publish`.** Both packages have dedicated `script/publish.ts` scripts that compile TypeScript, rewrite `package.json` exports from `./src/*.ts` to `./dist/*.js` + `.d.ts`, pack the tarball, publish, then restore the original `package.json`. Without this, the published package would ship with `.ts` exports that can't be imported.

```bash
npm login

# SDK first (plugin depends on it)
cd Agent-backend/packages/sdk/js
bun ./script/publish.ts

# Plugin second
cd Agent-backend/packages/plugin
bun ./script/publish.ts

# Verify both exist
npm view @orbit.build/sdk
npm view @orbit.build/plugin
```

**What the publish scripts do** (`plugin/script/publish.ts`, `sdk/js/script/publish.ts`):

1. `bun tsc` — compile TypeScript to `dist/`
2. Rewrite `package.json` exports: `"./src/index.ts"` → `{ import: "./dist/index.js", types: "./dist/index.d.ts" }`
3. `bun pm pack` — create tarball from the rewritten package
4. `npm publish *.tgz --tag <channel> --access public`
5. Restore original `package.json` (so dev `./src/*.ts` exports come back)

### 9. Verify

```bash
# 1. No stale @opencode-ai/ references remain (excluding upstream)
rg '@opencode-ai/' . \
  -g '*.{ts,tsx,js,jsx,mjs,cjs,d.ts,json,md,css}' \
  -g '!**/node_modules/**' \
  -g '!**/dist/**' \
  -g '!**/upstream/**' \
  -g '!reference/opencode-reference/**' \
  -g '!**/bun.lock*'

# 2. No stale opencode-sdk directory references remain
rg 'opencode-sdk' . \
  -g '*.{ts,tsx,js,jsx,mjs,cjs,d.ts,json,md,css}' \
  -g '!**/node_modules/**' \
  -g '!**/dist/**' \
  -g '!**/upstream/**' \
  -g '!reference/opencode-reference/**' \
  -g '!**/bun.lock*'

# 3. TypeScript compiles
bun run typecheck
cd Agent-backend && bun turbo typecheck

# 4. Lint passes
bun run lint

# 5. Tests pass
bun run test
cd Agent-backend/packages/opencode && bun test --timeout 30000

# 6. Full build (sidecar binary + frontend)
bun run build:opencode
bun run build:frontend

# 7. Verify both packages exist on npm
npm view @orbit.build/sdk
npm view @orbit.build/plugin

# 8. Integration check: boot engine against temp project
#    - Triggers .orbit/package.json generation
#    - Assert dependency name is @orbit.build/plugin
#    - Assert bun install succeeds (plugin + sdk resolve from npm)
```

---

## DO NOT RENAME: npm Registry CLI Package Names

`Agent-backend/packages/opencode/src/installation/index.ts` and `src/cli/cmd/uninstall.ts` contain bare `opencode-ai` references (without `@` prefix) — these are REAL published npm package names that users have installed via `npm install -g opencode-ai`, `bun install -g opencode-ai`, etc.

The sed pattern `@opencode-ai/` correctly skips these (they lack the `@` prefix). **Do NOT broaden the sed pattern to catch `opencode-ai` without `@`** — these lines must keep the published package name until the CLI is republished under a new name.

Affected lines:

- `installation/index.ts`: 150, 183, 186, 189, 228, 303 — install method detection, upgrade commands, registry fetch
- `cli/cmd/uninstall.ts`: 141-147, 192-195 — uninstall instructions and commands
