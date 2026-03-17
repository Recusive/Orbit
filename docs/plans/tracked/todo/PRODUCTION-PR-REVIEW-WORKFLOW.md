# Production PR Review Workflow

## Summary

- Buildable with the current SDK and Orbit architecture.
- Use one long-lived streaming `query()` session per review run. The `MessageQueue` async iterator pattern (agent.ts:1234-1254) keeps `query()` alive between passes. The host queues each subsequent pass via `sendMessage()` / `messageQueue.add()` — each turn emits a `result` with `structured_output`, then the session continues.
- SDK systems used:
  - streaming `query()` with `MessageQueue` async iterator
  - session fork (`resume` + `forkSession: true`) for apply workflow
  - `outputFormat` structured JSON (set once per session in `_createOptions()`, shared across all 4 passes)
  - read-only built-in tools during review: `Read`, `Glob`, `Grep`, `Bash`, `BashOutput`, `TodoWrite`, `Task`, `AskUserQuestion`, `WebSearch`, `WebFetch`
  - `systemPrompt: { preset: 'claude_code' }` with `settingSources: ['user', 'project', 'local']` for CLAUDE.md loading
  - `PreToolUse` hooks for read-only enforcement (auto-approve safe tools, deny Write/Edit, filter destructive Bash)
  - file checkpointing (`forkSession: true` enables it) plus `rewindFiles()` for the apply phase
- Review runs stay read-only. The agent does not write review artifacts. The host (agent-bridge TypeScript) writes `.orbit/reviews/pr-<number>/<headSha>/review1.md` through `review4.md`, plus `master.md` and matching JSON/state files.
- The user prompt is appended to a fixed review contract. The existing prompt artifact in `agent-bridge/src/agent/definitions/prompts/review-pr.ts` is reused as the base contract. A minimal regex-based template renderer (~20 lines) handles the `{{#if ...}}` / `{{else}}` / `{{/if}}` conditionals and `{{VAR:default}}` substitutions — the current slash-command expander (agent.ts:1428-1444) only supports `{{VAR:default}}`, not conditionals.
- `Apply` forks the completed review into a separate editable apply session on the same branch. The review session remains immutable.

---

## Key Changes

### 1. Dedicated Review Module

New module at `agent-bridge/src/review/`:

```
agent-bridge/src/review/
  index.ts                    # barrel exports
  review-orchestrator.ts      # 4-pass state machine
  review-artifact-store.ts    # .orbit/reviews/ file I/O
  review-prompt-builder.ts    # prompt construction + template renderer
  review-merge-engine.ts      # dedup and merge findings across passes
  review-context-discovery.ts # PR metadata via gh/git
  review-bash-filter.ts       # read-only Bash enforcement
  schemas.ts                  # Zod schemas for structured output
  types.ts                    # PrContext, ReviewState, ReviewRunState
```

Split responsibilities:

- **PR context discovery**: resolve PR number, title, base/head SHA, diff, and changed files using `gh pr view` and `gh pr diff` (via `child_process.execSync`, before session creation), with `git` fallback for local context.
- **Prompt builder**: render the review contract via minimal template renderer, inject PR context, construct per-pass prompts with previous findings.
- **Artifact store**: write `review1.json`..`review4.json`, `review1.md`..`review4.md`, `master.json`, `master.md`, and `state.json` to `.orbit/reviews/pr-<number>/<headSha>/`.
- **Merge engine**: deduplicate findings by stable fingerprint (SHA-256 of file + lineRange + normalizedProblem), merge severity/evidence across passes, render final master report.

### 2. Review Session Mode

Add `'review'` to `OrbitSessionMode` in `agent-bridge/src/agent/session/session-mode.ts`:

```typescript
export type OrbitSessionMode = 'chat' | 'agent' | 'review';
```

Tool set for review mode:

- **Allowed**: `Read`, `Glob`, `Grep`, `Bash`, `BashOutput`, `TodoWrite`, `Task`, `AskUserQuestion`, `WebSearch`, `WebFetch`
- **Disallowed**: `Write`, `Edit`, `NotebookEdit` — enforced via `PreToolUse` hook that returns `permissionDecision: 'deny'`
- **Bash filtering**: `PreToolUse` hook inspects `tool_input.command`, splits on `&&`/`||`/`;`/`|`, checks each sub-command against a deny-list (`rm`, `mv`, `sed -i`, `git push/checkout/reset/commit`, `sudo`, etc.). Safe commands (`gh pr *`, `git log/diff/show/status`, `cat`, `ls`, `jq`, etc.) are auto-approved. Implementation in `review-bash-filter.ts`.
- Optional specialist subagents in pass 4, restricted to read-only tools via `agents` config + `tools` array

### 3. Host-Driven Four-Pass State Machine

State machine in `review-orchestrator.ts`: `idle -> discovering -> pass_1 -> pass_2 -> pass_3 -> pass_4 -> synthesizing -> completed | failed | cancelled`

**Pass flow:**

1. **Pass 1** (baseline): Rendered `REVIEW_PR_PROMPT` + PR context + user instructions + "Return structured JSON, report ALL findings"
2. **Pass 2** (missed): "Here is Pass 1: [serialized findings]. Reread PR. Report ONLY net-new missed findings. Add duplicate fingerprints to `duplicateFingerprints`."
3. **Pass 3** (adversarial): "Known findings: [fingerprints+summaries]. Adversarial sweep: edge cases, integration risks, race conditions, security. Net-new only."
4. **Pass 4** (verification): "Final verification. Known findings: [all fingerprints]. Cross-file interactions, implicit contracts. If nothing new, set `isEmpty: true`."
5. **Synthesis**: Host merges all four pass JSON outputs into `master.json` and `master.md`

**Multi-pass mechanics:**

- The orchestrator sends Pass 1 via `sessionManager.sendMessage(pass1Prompt, sessionId)` which calls `messageQueue.add()`
- The background consumer in `session-manager.ts` detects `result` messages with `structured_output` on review-mode sessions and calls `orchestrator.handlePassResult()`
- `handlePassResult` validates output against `PrReviewPassResultSchema`, writes artifact, then queues the next pass prompt — all within the same long-lived `query()` session
- Always create all four review files; if a pass finds nothing new, write an explicit empty-pass report

**Error recovery:**

- If a pass fails mid-stream: save state to `state.json`, emit `review:failed` with `failedAtPass`
- Frontend shows "Resume Review" -> resumes from last completed pass using cached `state.json`

**Cancellation:**

- `review:cancel` -> `sessionManager.interrupt(sessionId)` -> orchestrator transitions to `cancelled` state. The `MessageQueue` stops. No further passes are queued.

### 4. Structured-Output Schemas

Zod schemas in `agent-bridge/src/review/schemas.ts`, converted to JSON Schema for SDK's `outputFormat` (Zod 4 `.toJsonSchema()`). Set once in `_createOptions()` — all 4 passes share the same schema:

- **`PrReviewFinding`**: fingerprint, severity (`critical`|`warning`|`suggestion`), category, file, lineRange `{start, end}`, problem, whyItMatters, fix, evidence, confidence (0-100), passDiscovered
- **`PrReviewPassResult`**: passNumber, passType (`baseline`|`missed`|`adversarial`|`verification`), newFindings[], duplicateFingerprints[], summary, nextFocusAreas[], isEmpty
- **`PrReviewMaster`**: merged findings (with `foundInPasses[]`), criticalCount, warningCount, suggestionCount, topFixes, mergeRecommendation (`APPROVE`|`REQUEST_CHANGES`|`NEEDS_REWORK`), overallQualityScore (1-10), prTitle, prNumber, baseRef, headSha

Shared TypeScript types exported from `packages/shared-schemas/src/review/`.

### 5. Agent Core Integration

Add `review` branch to `_createOptions()` in `agent-bridge/src/agent/core/agent.ts` (alongside existing `chat`/`agent` branches at line ~592):

- Set `options.allowedTools` to review mode tool set
- Set `options.outputFormat` to `PrReviewPassResult` JSON schema
- Configure `PreToolUse` hooks: auto-approve read-only tools, deny Write/Edit/NotebookEdit, filter destructive Bash via `isDestructiveBashCommand()`
- Do NOT use `permissionMode: 'plan'` (it disables Bash entirely). Use hook-based enforcement instead.

### 6. Run Persistence and Stale-Run Detection

- `ReviewArtifactStore.writeState()` saves `state.json` after every state transition
- On app restart: `ReviewManager` scans `.orbit/reviews/` for `state.json` files
  - In-progress run + `headSha` matches current `git rev-parse HEAD` -> resume from last completed pass
  - `headSha` changed -> mark run stale, require re-review

### 7. UI Integration

In `apps/agent/src/components/git/source-control/SourceControlTab.tsx`:

- Add `<ReviewPRButton />` component
- PR detection via new `usePrDetection()` hook -> calls `git_check_pr` Tauri command (new, in `src-tauri/src/commands/common/git.rs`, runs `gh pr view --json number,headRefOid`)
- Button states:
  - `hasPr && !activeRun` -> "Review PR"
  - `activeRun?.status === 'running'` -> Progress indicator (pass N/4, findings count)
  - `activeRun?.status === 'completed' && headSha matches` -> "Open Review"
  - `activeRun?.status === 'completed' && headSha changed` -> "Re-review PR"
- `ReviewProgressPanel` component: current pass, per-pass findings, cost, cancel button, artifact links, "Apply Fixes" button

Frontend review store (`apps/agent/src/stores/review/review-store.ts`): Zustand + immer + subscribeWithSelector. Tracks runs (by sessionId), activeRunSessionId, pass status, artifacts, stale state, linked apply session ID.

Review sessions appear in sidebar with a visual badge. Chat area renders streaming output normally — the structured output is consumed by the bridge-side orchestrator, not the frontend.

### 8. Apply Workflow

- `Apply` forks the completed review session into a new editable apply session
- Pre-apply validation: `git rev-parse HEAD` must match review's `headSha`, working tree must be clean
- Create session: `sessionManager.createSession(applySessionId, { sessionMode: 'agent', resumeSessionId: reviewSdkSessionId, forkSession: true, acceptEnabled: true })`
- Send apply prompt: "Implement fixes from master.json, CRITICAL and WARNING priority. Work in order."
- File checkpointing enabled via `forkSession: true` — uses existing `hardLinkFileBackups` pattern
- Apply session opens in chat for follow-up refinement
- `Rewind Apply` uses existing checkpoint/rewind plumbing (no new code)

### 9. Review-Specific App/Backend Interfaces

**IPC Protocol** (`agent-bridge/src/protocol/protocol.ts`):

New request types:

| Request            | Fields                                               |
| ------------------ | ---------------------------------------------------- |
| `review:start`     | sessionId, cwd, prNumber?, userInstructions?, model? |
| `review:cancel`    | sessionId                                            |
| `review:get_run`   | sessionId                                            |
| `review:list_runs` | cwd                                                  |
| `review:apply`     | sessionId                                            |

New event types:

| Event                     | Key Fields                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `review:status`           | sessionId, runId, currentPass, passStatus, findingsCount, usage, totalCostUsd                    |
| `review:pass_completed`   | sessionId, runId, passNumber, artifactPath, newFindingsCount, isEmpty                            |
| `review:artifact_written` | sessionId, runId, artifactType, path                                                             |
| `review:completed`        | sessionId, runId, masterJsonPath, masterMdPath, totalFindings, mergeRecommendation, totalCostUsd |
| `review:failed`           | sessionId, runId, error, failedAtPass                                                            |

**Rust backend** (`src-tauri/src/commands/agent/review.rs`):

| Command                | Signature                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| `review_start_pr_run`  | `(session_id, cwd, pr_number?, user_instructions?, model?) -> Result<()>` |
| `review_cancel_pr_run` | `(session_id) -> Result<()>`                                              |
| `review_get_pr_run`    | `(session_id) -> Result<Option<Value>>`                                   |
| `review_list_pr_runs`  | `(cwd) -> Result<Vec<Value>>`                                             |
| `review_apply_master`  | `(session_id) -> Result<()>`                                              |

Extend `SessionConfig.sessionMode` from `'chat' | 'agent'` to `'chat' | 'agent' | 'review'`.

---

## File Manifest

### New Files (19)

| File                                                                         | Purpose                                 |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `agent-bridge/src/review/index.ts`                                           | Barrel exports                          |
| `agent-bridge/src/review/schemas.ts`                                         | Zod schemas for structured output       |
| `agent-bridge/src/review/types.ts`                                           | PrContext, ReviewState, ReviewRunState  |
| `agent-bridge/src/review/review-orchestrator.ts`                             | 4-pass state machine                    |
| `agent-bridge/src/review/review-artifact-store.ts`                           | .orbit/reviews/ file I/O                |
| `agent-bridge/src/review/review-prompt-builder.ts`                           | Prompt construction + template renderer |
| `agent-bridge/src/review/review-merge-engine.ts`                             | Finding dedup/merge                     |
| `agent-bridge/src/review/review-context-discovery.ts`                        | PR metadata via gh/git                  |
| `agent-bridge/src/review/review-bash-filter.ts`                              | Read-only Bash enforcement              |
| `packages/shared-schemas/src/review/review.ts`                               | Shared TypeScript types                 |
| `packages/shared-schemas/src/review/index.ts`                                | Barrel export                           |
| `src-tauri/src/commands/agent/review.rs`                                     | Tauri commands                          |
| `apps/agent/src/stores/review/review-store.ts`                               | Zustand store                           |
| `apps/agent/src/stores/review/index.ts`                                      | Barrel export                           |
| `apps/agent/src/lib/api/review.ts`                                           | Tauri invoke wrappers                   |
| `apps/agent/src/hooks/review/use-review-events.ts`                           | Event listeners                         |
| `apps/agent/src/hooks/review/use-pr-detection.ts`                            | PR detection hook                       |
| `apps/agent/src/components/git/source-control/components/ReviewPRButton.tsx` | Review PR button                        |
| `apps/agent/src/components/review/ReviewProgressPanel.tsx`                   | Progress panel                          |

### Modified Files (12)

| File                                                                | Change                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `agent-bridge/src/agent/session/session-mode.ts`                    | Add `'review'` mode + tools                                              |
| `agent-bridge/src/agent/core/agent.ts`                              | Add review branch in `_createOptions()` (~line 592)                      |
| `agent-bridge/src/agent/session/session-manager.ts`                 | Add review callback in result handler, update SessionConfig              |
| `agent-bridge/src/protocol/protocol.ts`                             | Add review:\* request/event types                                        |
| `agent-bridge/src/protocol/schemas.ts`                              | Add review Zod validation                                                |
| `agent-bridge/src/index.ts`                                         | Wire ReviewManager + review:\* handlers (pattern: canvas manager wiring) |
| `src-tauri/src/agent/protocol.rs`                                   | Add Review to SessionMode enum + structs                                 |
| `src-tauri/src/agent/bridge.rs`                                     | Serialize/deserialize review messages                                    |
| `src-tauri/src/commands/agent/mod.rs`                               | Add `pub mod review;`                                                    |
| `src-tauri/src/commands/common/git.rs`                              | Add `git_check_pr` command                                               |
| `src-tauri/src/lib.rs`                                              | Register new commands                                                    |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx` | Add ReviewPRButton                                                       |

### Existing Code to Reuse

| What                                       | Where                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| `REVIEW_PR_PROMPT`                         | `agent-bridge/src/agent/definitions/prompts/review-pr.ts` |
| `SessionManager.createSession/sendMessage` | `agent-bridge/src/agent/session/session-manager.ts`       |
| `MessageQueue` async iterator              | Same file (line ~1234)                                    |
| `_createOptions()` chat/agent branching    | `agent-bridge/src/agent/core/agent.ts` (line ~592)        |
| `getAllowedToolsForMode()`                 | `agent-bridge/src/agent/session/session-mode.ts`          |
| `Emitter` / `Disposable` pattern           | `agent-bridge/src/common/events/events.ts`                |
| Canvas manager wiring pattern              | `agent-bridge/src/index.ts`                               |
| `forkSessionAt` / `hardLinkFileBackups`    | `session-manager.ts` (apply workflow)                     |

---

## Test Plan

### Unit Tests

| Test File                                                     | Scope                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `agent-bridge/src/__tests__/review-bash-filter.test.ts`       | Deny/allow command patterns, pipes, subshells, quoting                            |
| `agent-bridge/src/__tests__/review-merge-engine.test.ts`      | Dedup by fingerprint, severity merge, empty-pass handling                         |
| `agent-bridge/src/__tests__/review-prompt-builder.test.ts`    | `{{#if}}` rendering, `{{VAR:default}}` substitution, per-pass prompt construction |
| `apps/agent/src/__tests__/stores/review/review-store.test.ts` | Store actions, stale detection                                                    |

### Frontend Integration Tests

- `Review PR` visibility with and without detected PR context
- Pass progress rendering, artifact links, stale badge, and `Open Review` / `Apply` actions
- Apply-session creation and rewind CTA wiring

### Agent-Bridge E2E Tests (Real SDK Sessions)

| Test File                                       | Scope                                                |
| ----------------------------------------------- | ---------------------------------------------------- |
| `agent-bridge/src/__tests__/review-e2e.test.ts` | Four-pass run, artifact creation, cancel, apply fork |

Coverage:

- Single-pass: verify structured output parses as `PrReviewPassResult`
- Four-pass run creates all artifacts (10 files: 4x JSON, 4x MD, master.json, master.md)
- Pass 2-4 only emit net-new findings or explicit empty-pass reports
- Interrupted run resumes from `state.json` and same session
- Apply flow forks the review session, creates checkpoint, makes edits, can rewind
- Head SHA mismatch blocks apply and forces fresh review

### Provider Integration Tests

- Local `gh` PR discovery path when `gh` is available
- Fallback behavior when `gh` is unavailable or no PR is open

### Test Infrastructure Rules

- Add integration tests under `agent-bridge/src/__tests__/`
- Use real Claude SDK sessions (no mocks) per repo testing philosophy
- Add `[warning] TESTED:` source comments to covered functions
- Rust serialization tests in `src-tauri/src/commands/agent/review.rs` via `#[cfg(test)]`

---

## Implementation Phases

| Phase | Scope                                                                                             | Dependencies |
| ----- | ------------------------------------------------------------------------------------------------- | ------------ |
| 1     | Types, schemas, protocol extension (session-mode.ts, protocol.ts, schemas.ts, protocol.rs)        | None         |
| 2     | Review module units: bash filter, prompt builder, merge engine, artifact store, context discovery | Phase 1      |
| 3     | Orchestrator + agent core integration + bridge wiring                                             | Phase 2      |
| 4     | Rust backend: protocol, bridge, commands, git_check_pr                                            | Phase 1      |
| 5     | Frontend: review store, API, event listeners                                                      | Phase 4      |
| 6     | Frontend UI: PR detection, ReviewPRButton, ReviewProgressPanel, sidebar badge                     | Phase 5      |
| 7     | Apply workflow: fork, validation, checkpoint, rewind                                              | Phases 3, 5  |
| 8     | Persistence and resume from state.json                                                            | Phase 7      |
| 9     | Testing: unit, integration, E2E                                                                   | All phases   |

---

## Assumptions and Defaults

- The base review contract stays fixed. The user prompt is appended and cannot replace the workflow contract.
- Artifact root is `.orbit/reviews/`, with per-PR and per-head-SHA subdirectories so reruns do not overwrite older review runs.
- The primary production path uses local `gh` and `git` because the current desktop product operates against a local repo. GitHub MCP/custom tools are not required for v1 because Apply edits the local branch and does not publish PR comments.
- Review artifacts are host-written in agent-bridge (TypeScript), not Rust and not by the agent — review sessions stay read-only and deterministic.
- The `Review PR` button calls the orchestrator directly. A slash command wrapper can be added later.
- `outputFormat` is set once per session in `_createOptions()`. All 4 passes share the `PrReviewPassResult` schema. This is correct because the SDK reads options once at session creation.
- `Apply` runs only when the working tree is clean and the branch head matches the reviewed `headSha`; otherwise the user must rerun review.
- Review sessions use the existing conversation sidebar with a visual badge — they are not a separate list.
