# ✅ Phase 12: Package Import Rewrite (@opencode-ai → @orbit.build)

## How to Execute

**After copying ANY file from upstream, run this find-and-replace on the copied file:**

```bash
# Safe bulk replace — run on every newly copied file
sed -i '' 's/@opencode-ai\/plugin/@orbit.build\/plugin/g' <file>
sed -i '' 's/@opencode-ai\/sdk/@orbit.build\/sdk/g' <file>
sed -i '' 's/@opencode-ai\/util/@orbit.build\/util/g' <file>
```

Or apply to all files at once after a batch copy:

```bash
cd Agent-backend/packages/opencode/src
grep -rl "@opencode-ai/" . --include="*.ts" | xargs sed -i '' \
  -e 's/@opencode-ai\/plugin/@orbit.build\/plugin/g' \
  -e 's/@opencode-ai\/sdk/@orbit.build\/sdk/g' \
  -e 's/@opencode-ai\/util/@orbit.build\/util/g'
```

## Summary

Every file copied from upstream uses `@opencode-ai/*` package imports. Our fork already renamed these packages to `@orbit.build/*`, published them to npm, and built legacy migration into `config.ts`. Without this rewrite, copied files won't compile.

## Reference Documents

- **Completed rename plan:** `docs/plans/tracked/done/rename-opencode-ai-to-orbit.md` — the full ~800-occurrence rename across ~230 files
- **Publish guide:** `docs/development/NPM-PUBLISH-GUIDE.md` — how to publish `@orbit.build/sdk` and `@orbit.build/plugin` to npm
- **Root CLAUDE.md:** `<npm_packages>` section documents the `@orbit.build` scope, account (`orbit-ai`), and publish order

## What We Have Today

The fork completed the package rename. Both packages are published and live on npm:

| Upstream              | Our Fork              | npm       | Version |
| --------------------- | --------------------- | --------- | ------- |
| `@opencode-ai/plugin` | `@orbit.build/plugin` | Published | v0.0.5  |
| `@opencode-ai/sdk`    | `@orbit.build/sdk`    | Published | v0.0.5  |
| `@opencode-ai/util`   | `@orbit.build/util`   | Workspace | —       |
| `@opencode-ai/script` | `@orbit.build/script` | Workspace | —       |

**Legacy migration is built in:**

```typescript
// config/config.ts
const PUBLIC_PLUGIN_PACKAGE = "@orbit.build/plugin"
const LEGACY_PLUGIN_PACKAGE_SCOPE = "@opencode-ai" // Keeps — auto-migrates old user installs
```

**Publish workflow** uses custom `script/publish.ts` (compile → transform exports → pack → publish). SDK first, then plugin (dependency order). Touch ID 2FA via browser.

**SDK codegen** already outputs `@orbit.build/sdk`:

```typescript
// generate.ts:18
;`import { createOrbitClient } from "@orbit.build/sdk"`
```

## What Changes

### New imports from v1.2.26 that need rewriting

| File (copied from upstream)    | Import                            | Rewrite To                        |
| ------------------------------ | --------------------------------- | --------------------------------- |
| `src/provider/auth-service.ts` | `from "@opencode-ai/plugin"`      | `from "@orbit.build/plugin"`      |
| `src/provider/auth-service.ts` | `from "@opencode-ai/util/error"`  | `from "@orbit.build/util/error"`  |
| `src/installation/index.ts`    | `from "@opencode-ai/util/module"` | `from "@orbit.build/util/module"` |
| Any other copied file          | `@opencode-ai/*`                  | `@orbit.build/*`                  |

### Existing `@opencode-ai` references to keep

| File                  | Reference                                      | Why Keep                                     |
| --------------------- | ---------------------------------------------- | -------------------------------------------- |
| `config/config.ts:46` | `LEGACY_PLUGIN_PACKAGE_SCOPE = "@opencode-ai"` | Backward compat — migrates old user installs |

## When to Apply

**This is NOT a standalone phase — it runs AS PART of every other phase.**

Every time you copy a file from upstream (Phases 1, 3, 4, 5, 10, 11), immediately rewrite the imports before running typecheck. Think of it as step 2 in the copy workflow:

1. `git show v1.2.26:<path> > our/fork/<path>`
2. **Rewrite `@opencode-ai/` → `@orbit.build/`**
3. Rename user-facing `opencode` → `orbit` strings
4. `bun run typecheck`

## Breaking Changes

None — this maintains the existing rename. Failing to do it breaks compilation.

## Verification

```bash
# Should return ONLY the legacy compat line in config.ts
cd Agent-backend/packages/opencode
grep -rn "@opencode-ai" src/ --include="*.ts"
# Expected: 1 result (config.ts LEGACY_PLUGIN_PACKAGE_SCOPE)
```

## Files Changed

Every file copied from upstream in Phases 1, 3, 4, 5, 5B, 7, 10, 11. Not a fixed list — depends on what's copied.
