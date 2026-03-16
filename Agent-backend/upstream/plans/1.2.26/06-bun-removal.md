# ✅ Phase 6: Bun Shell Removal

## How to Execute

**All files exist in our fork — apply upstream diffs. Our fork already did most of this work.**

```bash
cd Agent-backend/upstream/repo/clone
git diff v1.2.24..v1.2.26 -- packages/opencode/src/<path>
# Compare with our fork — many changes may already be applied
# Only apply hunks that our fork is missing
```

## Summary

Replace all `import { $ } from "bun"` (Bun shell) usage with `Process.run()` / `Process.text()` / `Process.lines()` from `@/util/process`. This removes the dependency on Bun's shell API, making the codebase portable to Node.js and other runtimes. Upstream also introduced a `git()` helper in `@/util/git` that wraps git commands with a consistent `GitResult` interface.

**Our fork already has** `Process.text()`, `Process.lines()`, `Process.TextResult`, `windowsHide`, and the `.catch()` error handling in `Process.run()` from a prior partial port. The `util/git.ts` helper also exists. The remaining work is converting the consumer files that still use `import { $ } from "bun"`.

## What We Have Today

Our fork (`packages/opencode/src/util/process.ts`) is already at upstream v1.2.26 parity:

- `Process.run()` with `.catch()` error handling and `windowsHide`
- `Process.text()` returning `TextResult` with `.text` string property
- `Process.lines()` returning split lines
- `Process.RunFailedError` class

Our fork (`packages/opencode/src/util/git.ts`) also already exists with the `GitResult` interface.

**However**, the following files still use `import { $ } from "bun"`:

```
src/session/prompt.ts     — import { $ } from "bun" (also fileURLToPath, pathToFileURL)
```

The other files that previously used `import { $ } from "bun"` have either already been ported or were ported in an earlier phase. The remaining `from "bun"` imports across the codebase are:

| File                                                | Import                                   | Status                        |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| `src/session/prompt.ts`                             | `import { $ } from "bun"`                | **MUST convert**              |
| `src/ide/index.ts`                                  | `import { spawn } from "bun"`            | Legitimate Bun API, not shell |
| `src/session/message-v2.ts`                         | `import type { SystemError } from "bun"` | Type import only              |
| `src/cli/cmd/tui/component/dialog-status.tsx`       | `import { fileURLToPath } from "bun"`    | Should use `from "url"`       |
| `src/cli/cmd/tui/component/prompt/autocomplete.tsx` | `import { pathToFileURL } from "bun"`    | Should use `from "url"`       |

## What Changes (Upstream v1.2.24 -> v1.2.26)

### API Migration Patterns

| Old Pattern (Bun Shell)                      | New Pattern (Process API)                        |
| -------------------------------------------- | ------------------------------------------------ |
| `$\`cmd arg1 arg2\``                         | `Process.run(["cmd", "arg1", "arg2"])`           |
| `$\`cmd\`.text()`                            | `Process.text(["cmd"]).then(x => x.text)`        |
| `$\`cmd\`.quiet()`                           | (default -- Process doesn't log to stdout)       |
| `$\`cmd\`.nothrow()`                         | `Process.run(["cmd"], { nothrow: true })`        |
| `$\`cmd\`.cwd(dir)`                          | `Process.run(["cmd"], { cwd: dir })`             |
| `$\`cmd\`.env({...})`                        | `Process.run(["cmd"], { env: {...} })`           |
| `result.exitCode`                            | `result.code`                                    |
| `result.text()` (method)                     | `result.text` (property on TextResult)           |
| `$\`cmd\`.lines()`                           | `Process.lines(["cmd"])`                         |
| `for await (const line of $\`...\`.lines())` | `for (const line of await Process.lines([...]))` |
| `$\`cmd\`.arrayBuffer()`                     | `Process.run(["cmd"]).then(r => r.stdout)`       |
| `$.ShellError`                               | `Process.RunFailedError`                         |

### Git Commands

| Old Pattern                                    | New Pattern                                   |
| ---------------------------------------------- | --------------------------------------------- |
| `$\`git cmd args\`.quiet().nothrow().cwd(dir)` | `git(["cmd", "args"], { cwd: dir })`          |
| `result.exitCode`                              | `result.exitCode` (GitResult keeps this name) |
| `result.text()` (Bun shell method)             | `result.text()` (GitResult method)            |

### Other Bun Import Changes

| Old Pattern                           | New Pattern                           |
| ------------------------------------- | ------------------------------------- |
| `import { pathToFileURL } from "bun"` | `import { pathToFileURL } from "url"` |
| `import { fileURLToPath } from "bun"` | `import { fileURLToPath } from "url"` |
| `$\`realpath ${arg}\``                | `fs.realpath(path.resolve(cwd, arg))` |
| `$\`rm -f "${file}"\``                | `fs.rm(file, { force: true })`        |

### Windows Support

All `Process.spawn()` calls now include `windowsHide: process.platform === "win32"` to prevent console windows from flashing on Windows. This is already in our `process.ts`.

## Files to Modify

### Already Done (No Action Needed)

These files were converted in a prior port or already match upstream:

| File                                | Evidence                                    |
| ----------------------------------- | ------------------------------------------- |
| `src/util/process.ts`               | Already at v1.2.26 parity                   |
| `src/util/git.ts`                   | Already exists with GitResult interface     |
| `src/snapshot/index.ts`             | Converted in prior phase (uses Process/git) |
| `src/worktree/index.ts`             | Converted in prior phase (uses git helper)  |
| `src/tool/bash.ts`                  | Converted in prior phase (uses fs.realpath) |
| `src/cli/cmd/github.ts`             | Converted in prior phase (uses git/Process) |
| `src/cli/cmd/pr.ts`                 | Converted in prior phase (uses Process/git) |
| `src/cli/cmd/tui/util/clipboard.ts` | Converted in prior phase (uses Process/fs)  |
| `src/installation/index.ts`         | Converted in prior phase (uses Process)     |
| `src/project/vcs.ts`                | Converted in prior phase (uses git helper)  |
| `src/shell/shell.ts`                | Already has windowsHide                     |

### Still Needs Conversion

| #   | File                                                | What Changes                                                                                                                                                                         | Complexity |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `src/session/prompt.ts`                             | `import { $ } from "bun"` -- only the `$` import. The `pathToFileURL`/`fileURLToPath` are already split to `from "url"` in upstream. Check if `$` is actually used in function body. | Simple     |
| 2   | `src/cli/cmd/tui/component/dialog-status.tsx`       | `import { fileURLToPath } from "bun"` -> `from "url"`                                                                                                                                | Trivial    |
| 3   | `src/cli/cmd/tui/component/prompt/autocomplete.tsx` | `import { pathToFileURL } from "bun"` -> `from "url"`                                                                                                                                | Trivial    |

## Verification Steps

After all conversions:

```bash
# No more `import { $ } from "bun"` anywhere
cd packages/opencode
grep -rn 'import.*\$.*from "bun"' src/ --include="*.ts" --include="*.tsx"
# Expected: 0 results

# Legitimate bun imports are OK (type imports, spawn, etc.)
grep -rn 'from "bun"' src/ --include="*.ts" --include="*.tsx"
# Expected: Only type imports (SystemError) and bun-specific APIs (spawn in ide/index.ts)

# No fileURLToPath/pathToFileURL from "bun" (should be from "url")
grep -rn 'fileURLToPath.*from "bun"\|pathToFileURL.*from "bun"' src/ --include="*.ts" --include="*.tsx"
# Expected: 0 results

# Type check passes
bun run typecheck
```

## Order of Operations

1. `src/session/prompt.ts` -- remove `$` from bun import, move `pathToFileURL`/`fileURLToPath` to `from "url"` if not already done
2. `src/cli/cmd/tui/component/dialog-status.tsx` -- change import source
3. `src/cli/cmd/tui/component/prompt/autocomplete.tsx` -- change import source
4. Verify with grep and typecheck

## Rename Required

- `src/session/prompt.ts` line with `$\`opencode import ${sessionUrl}\``-- this calls the CLI binary. If we find any reference to the`opencode`CLI command in these files, rename to`orbit`.
- `src/cli/cmd/tui/util/clipboard.ts` -- already has `opencode-clipboard.png` temp file name. This is an internal temp file, low priority for rename but should be changed to `orbit-clipboard.png`.

## Risk Assessment

**Low risk.** Most files are already converted. The remaining changes are trivial import path changes. The `util/process.ts` and `util/git.ts` foundations are already solid in our fork.

## Notes

- The upstream diff also removes `Flag.OPENCODE_CLIENT === "acp"` guards in `snapshot/index.ts` cleanup/track functions. Verify our fork matches.
- `worktree/index.ts` upstream now imports `ProjectID` from `./schema` and uses typed IDs -- this is part of the broader branded-ID refactor (Phase 7), not strictly Bun removal.
- `github.ts` adds `gitText()`, `gitRun()`, `gitStatus()`, `commitChanges()` local helper functions that wrap the `git()` helper with error throwing. These are already in our fork if github.ts was ported.
