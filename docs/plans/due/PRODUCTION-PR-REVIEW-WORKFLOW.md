# Production PR Review Workflow

## Summary

- Yes, this is buildable with the current SDK and the current Orbit architecture.
- Use one long-lived streaming `query()` session per review run, then auto-drive four sequential passes in the same session without user intervention, followed by host-side synthesis into `master.md`.
- SDK systems used:
  - streaming `query()`
  - session capture/resume/fork
  - `outputFormat` structured JSON
  - read-only built-in tools during review: `Read`, `Glob`, `Grep`, `Bash`, `BashOutput`, `TodoWrite`, `Task`, `AskUserQuestion`
  - `systemPrompt: { preset: 'claude_code' }` with loaded `CLAUDE.md`
  - hooks plus `canUseTool`
  - file checkpointing plus `rewindFiles()` for the later apply phase
- Review runs stay read-only. The agent does not write review artifacts. The host writes `.orbit/reviews/pr-<number>/<headSha>/review1.md` through `review4.md`, plus `master.md` and matching JSON/state files.
- The user prompt is appended to a fixed review contract. The existing prompt artifact in [review-pr.ts](/agent-bridge/src/agent/definitions/prompts/review-pr.ts) should be reused as the base contract, but it needs a real renderer because its `{{#if ...}}` blocks are not supported by the current slash-command expansion path.
- `Apply` forks the completed review into a separate editable apply session on the same branch. The review session remains immutable.

---

## Key Changes

### 1. Dedicated Review Module

Add a dedicated review module instead of growing the existing session manager further. Split responsibilities into:

- **PR context discovery**: resolve PR number, title, base/head SHA, diff, and changed files using `gh pr view` and `gh pr diff`, with `git` fallback only for local context discovery.
- **Prompt builder**: render the fixed PR review contract, inject PR context, and append the user prompt.
- **Artifact store**: write `review1.md` to `review4.md`, `master.md`, JSON companions, and `state.json`.
- **Merge engine**: deduplicate findings by stable fingerprint, merge severity/evidence across passes, and render the final master report.

### 2. Review Session Mode

Add a new `review` session mode to the existing session-mode system in [session-mode.ts](/agent-bridge/src/agent/session/session-mode.ts). Tool set:

- **Allowed**: `Read`, `Glob`, `Grep`, `Bash`, `BashOutput`, `TodoWrite`, `Task`, `AskUserQuestion`
- **Disallowed**: `Write`, `Edit`, `NotebookEdit`, and destructive Bash file mutation
- Optional specialist subagents only in pass 4, and only read-only

### 3. Host-Driven Four-Pass State Machine

- **Pass 1**: full baseline review
- **Pass 2**: reread pass 1 and emit only net-new missed findings
- **Pass 3**: adversarial edge-case and integration sweep, net-new only
- **Pass 4**: final verification sweep, net-new only
- **Synthesis**: host merges all four pass JSON outputs into `master.json` and `master.md`
- Always create all four review files; if a pass finds nothing new, write an explicit empty-pass report
- After each pass completes, the host immediately queues the next pass into the same streaming session so the run does not stop

### 4. Structured-Output Schemas

- **`PrReviewPassResult`**: pass metadata, `newFindings[]`, `duplicateFindings[]`, summary, next focus
- **`PrReviewFinding`**: fingerprint, severity, category, file, line range, problem, why it matters, fix, evidence, confidence
- **`PrReviewMaster`**: merged findings, counts, top fixes, merge recommendation, `foundInPasses[]`
- Keep markdown rendering host-side for deterministic filenames and stable formatting

### 5. Run Persistence and Stale-Run Detection

- Store run id, PR number, repo path, base/head SHA, review session id, current pass, artifact paths, timestamps, and cumulative usage/cost in `state.json`
- On app restart, reload in-progress runs and resume the same SDK session if the reviewed `headSha` still matches the current branch head
- If `headSha` changed, mark the run stale and require re-review

### 6. UI Integration

In [SourceControlTab.tsx](/apps/agent/src/components/git/source-control/SourceControlTab.tsx):

- Show `Review PR` when the current branch has an open PR
- Click flow: collect the appended review instructions, start a dedicated review run, and show pass progress plus artifact links
- Once a run exists for the current `headSha`, change CTA to `Open Review`
- If `headSha` changes, surface `Re-review PR`

### 7. Apply Workflow

- `Apply` forks the completed review session into a new editable apply session tied to the same `headSha`
- Create a safe checkpoint before the first edit
- Switch the apply session to editable mode only after explicit approval
- Use `acceptEdits` for file edits, but keep hooks that block Bash commands that write to disk so all code mutations stay checkpointable
- Drive implementation from `master.json`, not `master.md`
- After apply starts, open the apply session in chat for follow-up refinement
- Expose `Rewind Apply` through the existing rewind/checkpoint plumbing

### 8. Review-Specific App/Backend Interfaces

New frontend review store for runs, active run, pass status, artifacts, stale state, and linked review/apply session ids.

**New commands/events:**

| Command/Event             | Direction           |
| ------------------------- | ------------------- |
| `review_start_pr_run`     | Frontend -> Backend |
| `review_cancel_pr_run`    | Frontend -> Backend |
| `review_get_pr_run`       | Frontend -> Backend |
| `review_list_pr_runs`     | Frontend -> Backend |
| `review_apply_master`     | Frontend -> Backend |
| `review:status`           | Backend -> Frontend |
| `review:pass_completed`   | Backend -> Frontend |
| `review:artifact_written` | Backend -> Frontend |
| `review:completed`        | Backend -> Frontend |
| `review:failed`           | Backend -> Frontend |

Extend `SessionConfig.sessionMode` from `'chat' | 'agent'` to `'chat' | 'agent' | 'review'`.

---

## Test Plan

### Unit Tests

- Prompt rendering for PR number, base branch, and appended user prompt
- Fingerprinting and dedup/merge logic across `review1` to `review4`
- Stale-run detection when `headSha` changes
- Artifact path generation and local ignore behavior
- Review state-machine transitions, including empty-pass handling

### Frontend Integration Tests

- `Review PR` visibility with and without detected PR context
- Pass progress rendering, artifact links, stale badge, and `Open Review` / `Apply` actions
- Apply-session creation and rewind CTA wiring

### Agent-Bridge E2E Tests (Real SDK Sessions)

- Four-pass run creates all five markdown files plus JSON/state files
- Pass 2 to 4 only emit net-new findings or explicit empty-pass reports
- Interrupted run resumes from `state.json` and the same session id
- Apply flow forks the review session, creates a checkpoint, makes edits, and can rewind
- Head SHA mismatch blocks apply and forces a fresh review

### Provider Integration Tests

- Local `gh` PR discovery path when `gh` is available
- Fallback behavior when `gh` is unavailable or no PR is open

### Test Infrastructure Rules

- Add local integration tests under `agent-bridge/src/__tests__/`
- Use real Claude SDK sessions for end-to-end review/apply coverage
- Add the required `[warning] TESTED` source comments to functions covered by new integration tests

---

## Assumptions and Defaults

- The base review contract stays fixed. The user prompt is appended and cannot replace the workflow contract.
- Artifact root is `.orbit/reviews/`, with per-PR and per-head-SHA subdirectories so reruns do not overwrite older review runs.
- The primary production path uses local `gh` and `git` because the current desktop product operates against a local repo. GitHub MCP/custom tools are not required for v1 because Apply edits the local branch and does not publish PR comments.
- Review artifacts are host-written, not agent-written, so review sessions stay read-only and deterministic.
- The current default slash-command system is not the primary integration path:
  - `DEFAULT_COMMANDS` is empty today
  - The current command expander does not support the `{{#if PR_NUMBER}}` syntax already present in the PR review prompt
  - The `Review PR` button should call the new orchestrator directly, with a slash command added later only as a thin wrapper over the same service
- `Apply` runs only when the working tree and branch still match the reviewed `headSha`; otherwise the user must rerun review.
