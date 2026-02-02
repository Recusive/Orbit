# Linear Feedback Integration Plan

Wire up the existing Feedback settings page so users can **Report a Bug** or **Request a Feature**, creating Linear issues directly from the app.

> **Audit Status:** APPROVE WITH CHANGES — all critical and recommended fixes from both audits incorporated below.

---

## Architecture

```
FeedbackSettings.tsx (accordion cards)
  ├── Click "Report a Bug"    → card expands down, reveals inline form
  └── Click "Request a Feature" → card expands down, reveals inline form
                                        │
                                   UX: Accordion behavior
                                   - ChevronRight rotates to ChevronDown on expand
                                   - Only one card expanded at a time (clicking the other collapses the first)
                                   - Clicking an expanded card's header collapses it
                                   - Smooth height animation (CSS transition or framer-motion)
                                        │
                                   Form fields (inside expanded card):
                                   - Title (Input, required, max 256 chars)
                                   - Description (Textarea, required, max 10k chars)
                                   - Email (Input, optional, basic @ + . validation in Rust)
                                   - Screenshot (paste/drop zone — bug card only)
                                   - [Submit] button at bottom of expanded area
                                   - System info collected in Rust at submit time
                                        │
                                invoke('submit_feedback', { ... })
                                        │
                              ┌─────────┴──────────┐
                              │  Rust: feedback.rs  │
                              │  POST Linear API    │
                              │  (reqwest + GraphQL) │
                              │                     │
                              │  API key:           │
                              │  option_env!()      │
                              │  (compile-time,     │
                              │   same as Sentry)   │
                              │                     │
                              │  Payload built with │
                              │  serde_json::json!  │
                              │  (NEVER format!())  │
                              └─────────────────────┘
                                        │
                              Linear Issue Created
                              - Team: hardcoded constant
                              - Label: "Bug" or "Feature Request" (hardcoded UUIDs)
                              - Description includes system info + screenshot
                              - Returns issue URL for toast link
```

---

## Audit Fixes Applied

### Audit 1

| #   | Severity       | Issue                                     | Resolution                                                                               |
| --- | -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | 🔴 Critical    | Env var API key fails in production       | → Compile-time `option_env!("LINEAR_API_KEY").unwrap_or("")`, same pattern as Sentry DSN |
| C2  | 🔴 Critical    | No input sanitization/limits              | → Email validation in Rust, title capped at 256 chars, description at 10k chars          |
| C3  | 🔴 Critical    | Unbounded screenshot base64 over IPC      | → Frontend compresses to 1920×1080 JPEG (0.8 quality), Rust enforces 5MB hard limit      |
| R1  | 🟡 Recommended | Return type doesn't match codebase        | → `FeedbackResult` with `issue_url` (not `issue_id`), Sentry `.capture()` pattern        |
| R2  | 🟡 Recommended | Unnecessary `get_system_info` command     | → Removed. Rust collects system info at submission time                                  |
| R4  | 🟡 Recommended | Dialog should follow modal folder pattern | → Changed to inline form within FeedbackSettings (see Audit 2 C1)                        |
| R5  | 🟡 Recommended | No rate limiting                          | → 30s frontend cooldown + 60s Rust-side managed state cooldown                           |
| R6  | 🟡 Recommended | Label IDs as user config                  | → Hardcoded as constants (team-controlled workspace)                                     |

### Audit 2

| #   | Severity        | Issue                                                    | Resolution                                                                                                                                                                                                                             |
| --- | --------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 🔴 Critical     | Separate dialog creates modal-on-modal UX                | → **Accordion pattern**: each card expands down to reveal its form inline. No separate dialog or view transition. Chevron rotates, only one card expanded at a time.                                                                   |
| C2  | 🔴 Critical     | Return type wrapped in `Result<>` doesn't match codebase | → Return `FeedbackResult` directly (not `Result<FeedbackResult, String>`). Matches `store_api_key`, `retrieve_api_key` pattern in credentials.rs.                                                                                      |
| C3  | 🔴 Critical     | GraphQL injection risk if using `format!()`              | → **Mandatory: use `serde_json::json!()` macro** for all GraphQL payload construction. NEVER `format!()` for variable interpolation.                                                                                                   |
| R2  | 🟡 Recommended  | `regex` crate not in Cargo.toml for email validation     | → Use basic string validation (`contains('@')`, `contains('.')`, length checks) instead of regex. No new dependency needed.                                                                                                            |
| R3  | 🟡 Recommended  | FeedbackState needs explicit definition                  | → Defined below with `Mutex<Option<Instant>>`, registered via `.manage()`, accessed via `State<'_, FeedbackState>`                                                                                                                     |
| R4  | 🟡 Recommended  | `navigator.platform` is deprecated                       | → **Remove all frontend system info collection**. Collect OS/arch/version entirely in Rust via `std::env::consts` + `env!("CARGO_PKG_VERSION")`. Frontend only shows app version via `@tauri-apps/api/app` `getVersion()` for display. |
| R5  | 🟡 Recommended  | Screenshot upload failure kills entire submission        | → If screenshot upload fails, **still create the issue** without the screenshot. Log upload failure to Sentry.                                                                                                                         |
| R6  | 🟡 Recommended  | Missing clippy allow attribute                           | → Add `#![allow(clippy::needless_pass_by_value, reason = "Tauri commands receive owned types from JSON deserialization")]` to feedback.rs                                                                                              |
| N1  | 🟢 Nice-to-have | Use `FeedbackType` enum instead of String                | → ✅ Adopted. `#[derive(Deserialize)] enum FeedbackType { Bug, Feature }` for compile-time safety                                                                                                                                      |
| N3  | 🟢 Nice-to-have | Add feedback type to Sentry context                      | → Use `capture_command_error_with_context()` from sentry_utils.rs                                                                                                                                                                      |
| N4  | 🟢 Nice-to-have | `.len()` counts bytes not chars                          | → Use `.chars().count()` for description length validation                                                                                                                                                                             |

---

## Files to Create

### 1. No new component file — form lives inside `FeedbackSettings.tsx`

**Accordion pattern:** Each card expands to reveal its form inline. No separate file needed.

- `expandedCard` state: `'bug' | 'feature' | null`
- Clicking a card header toggles expand/collapse (only one at a time)
- ChevronRight icon rotates 90° to ChevronDown when expanded (CSS `rotate-90` transition)
- Expanded area slides down with smooth height animation
- **Bug card expanded:** Title (Input), Description (Textarea), Email (Input, optional), Screenshot (paste/drop zone), Submit button
- **Feature card expanded:** Title (Input), Description (Textarea), Email (Input, optional), Submit button — no screenshot
- **Frontend validation:**
  - Title required, max 256 chars
  - Description required, max 10,000 chars
  - Email: basic check before sending (Rust does the real validation)
- **Screenshot handling (bug only):**
  - Paste handler (`onPaste`) + drop zone area
  - Compress via `<canvas>.toBlob('image/jpeg', 0.8)` with max 1920×1080
  - Store as base64 string in state, show thumbnail preview with remove button
- Loading state on submit (prevents double-submit)
- **30-second cooldown** after successful submission (button disabled with countdown)
- Success → Sonner toast with Linear issue link + collapse card
- Error → inline error message below submit button
- Each card manages its own form state (title, description, email, screenshot) — reset on collapse

### 2. `src-tauri/src/commands/common/feedback.rs` (NEW)

**Module-level attribute:**

```rust
#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]
```

**Types:**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackType {
    Bug,
    Feature,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackResult {
    pub success: bool,
    pub issue_url: Option<String>,
    pub error: Option<String>,
}

pub struct FeedbackState {
    last_submission: Mutex<Option<Instant>>,
}
```

**Constants (compile-time):**

- `LINEAR_API_KEY`: `option_env!("LINEAR_API_KEY").unwrap_or("")`
- `LINEAR_TEAM_ID`: hardcoded UUID
- `BUG_LABEL_ID`: hardcoded UUID
- `FEATURE_LABEL_ID`: hardcoded UUID
- `ISSUE_CREATE_MUTATION`: static GraphQL query string

**`submit_feedback` command:**

```rust
#[tauri::command]
pub async fn submit_feedback(
    state: State<'_, FeedbackState>,
    feedback_type: FeedbackType,  // enum, not String
    title: String,
    description: String,
    email: Option<String>,
    screenshot: Option<String>,
) -> FeedbackResult {
    // Returns FeedbackResult directly — NOT Result<FeedbackResult, String>
    // Matches store_api_key/retrieve_api_key pattern from credentials.rs
}
```

**Implementation flow:**

1. Check `LINEAR_API_KEY` is not empty → user-friendly error if missing
2. Rate limit check via `FeedbackState` managed state (60s cooldown)
3. **Server-side validation:**
   - `title.chars().count() > 256` → error
   - `description.chars().count() > 10_000` → error
   - `screenshot.len() > 5_000_000` → error (bytes, not chars — base64 is ASCII)
   - Email validation: `contains('@')` and `contains('.')` and length > 5 (no regex crate needed)
4. Collect system info: `std::env::consts::OS`, `ARCH`, `env!("CARGO_PKG_VERSION")`
5. Append system info + email as markdown block to description
6. If screenshot provided: attempt Linear `fileUpload` → **on failure, continue without screenshot** (log to Sentry)
7. Build GraphQL payload with **`serde_json::json!()` only** (NEVER `format!()`)
8. POST to Linear GraphQL API with `issueCreate` mutation
9. On error: `capture_command_error_with_context("submit_feedback", &e, &[("feedback_type", ...)])`
10. Return `FeedbackResult { success, issue_url, error }`

---

## Files to Modify

### 3. `apps/agent/src/components/modals/settings/pages/FeedbackSettings.tsx` (MODIFY — main UI work)

- Add `expandedCard` state: `'bug' | 'feature' | null`
- Each card header gets `onClick` to toggle: `setExpandedCard(prev => prev === 'bug' ? null : 'bug')`
- ChevronRight gets `transition-transform duration-200` + conditional `rotate-90` class
- Below each card header, conditionally render the form fields with height animation
- Form state per card: `title`, `description`, `email`, `screenshot` (bug only), `isSubmitting`, `error`, `cooldownRemaining`
- Submit handler calls `invoke<FeedbackResult>('submit_feedback', { ... })`
- Import `Input` from `@/components/ui/input`, `Textarea` from `@/components/ui/textarea`, `Button` from `@/components/ui/button`
- Import `toast` from `sonner` for success notification

### 4. `src-tauri/src/commands/common/mod.rs` (MODIFY)

- Add `pub mod feedback;`

### 5. `src-tauri/src/lib.rs` (MODIFY)

- Add `feedback::submit_feedback` to `tauri::generate_handler![]`
- Add `.manage(FeedbackState::new())` to Tauri builder

---

## Linear API Details

**GraphQL endpoint:** `https://api.linear.app/graphql`
**Auth header:** `Authorization: Bearer {LINEAR_API_KEY}`

**Issue creation mutation:**

```graphql
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      url
    }
  }
}
```

**Payload construction (MANDATORY pattern):**

```rust
// SAFE: serde_json handles all escaping — no injection risk
let variables = serde_json::json!({
    "input": {
        "teamId": LINEAR_TEAM_ID,
        "title": title,
        "description": full_description,
        "labelIds": [label_id],
    }
});

let body = serde_json::json!({
    "query": ISSUE_CREATE_MUTATION,
    "variables": variables,
});
```

**Screenshot upload** (if provided):

- Use Linear's file upload API to get a presigned URL
- Upload the image bytes
- Include the URL in the issue description as `![screenshot](url)`
- **On upload failure:** still create issue without screenshot, log to Sentry

---

## Implementation Order

1. **Rust backend** — `feedback.rs` with types, FeedbackState, and `submit_feedback` command
2. **Register command** — mod.rs + lib.rs (command + managed state)
3. **FeedbackSettings accordion** — expand cards with form fields, submit handler, screenshot drop zone
4. **Test end-to-end** — submit both flows, verify Linear issues

---

## Build Setup Required

The Linear API key is embedded at **compile time** (same pattern as Sentry DSN):

```bash
# Set before building — gets baked into the binary via option_env!()
LINEAR_API_KEY=lin_api_xxxxx bunx tauri dev

# Or export for the session
export LINEAR_API_KEY=lin_api_xxxxx
bunx tauri dev
```

> **Security note:** Use a Linear API key with **write-only issue creation scope** to minimize risk. This has the same threat model as the Sentry DSN already hardcoded in `lib.rs:200`.

> **CI note:** Uses `option_env!()` (not `env!()`), so builds succeed without the secret. The key defaults to `""` and is checked at runtime — `submit_feedback` returns a user-friendly error ("Feedback unavailable in this build") if empty. Add `LINEAR_API_KEY` to GitHub Actions secrets for production builds.

**Constants to provide before implementation:**

- Linear team ID (UUID)
- Linear "Bug" label ID (UUID)
- Linear "Feature Request" label ID (UUID)

---

## Verification

1. Build with `LINEAR_API_KEY=... bunx tauri dev`
2. Open Settings → Provide Feedback
3. Click "Report a Bug" → card expands down revealing form, chevron rotates
4. Fill form → submit → check Linear board for new issue with Bug label
5. Click "Report a Bug" header again → card collapses, form resets
6. Click "Request a Feature" → that card expands (bug card stays collapsed), no screenshot field
7. Fill form → submit → check Linear board for Feature Request label
8. Verify system info appears in issue description markdown
9. Verify screenshot appears as embedded image (bug reports only)
10. Verify screenshot upload failure still creates issue (without image)
11. Verify rate limiting: submit twice quickly → second is blocked with message
12. Verify validation: empty title → inline error, invalid email → inline error
13. Verify success toast includes clickable Linear issue link
14. Verify empty `LINEAR_API_KEY` → user-friendly error, not crash
15. Run `bun run check` to verify no lint/type errors

---

## Future Enhancements (v2)

- **Offline queue:** Save to `~/.orbit/pending-feedback.json`, retry on next launch
- **Disabled state:** Gray out feedback cards with tooltip when API key missing (dev builds)
- **Steps to Reproduce:** Separate textarea field for bug reports
- **Category selector:** For feature requests (UI, Editor, Terminal, AI, etc.)
