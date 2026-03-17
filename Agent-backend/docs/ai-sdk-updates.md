# AI SDK Dependency Upgrade Report

> Generated: March 9, 2026
> Scope: Minor and patch upgrades only (no major version bumps)
> Source: `packages/opencode/package.json` + root `package.json` catalog

---

## Summary

- **23 AI SDK-related dependencies** audited
- **20 have available upgrades** (minor/patch)
- **3 are already at latest** within their major version

### Priority Upgrades

| Priority | Package           | Reason                                                      |
| -------- | ----------------- | ----------------------------------------------------------- |
| HIGH     | `ai`              | 3 security fixes (SSRF prevention, memory growth)           |
| HIGH     | `@ai-sdk/openai`  | Code interpreter, web_search tool, image gen tool           |
| HIGH     | `@ai-sdk/xai`     | Video support, logprobs, new model IDs, image improvements  |
| MEDIUM   | `@ai-sdk/gateway` | Image model support, new model IDs, BYOK, auth improvements |
| LOW      | All others        | Dependency bumps only                                       |

---

## Detailed Upgrade Table

| Package                       | Current | Latest (same major) | Delta | Risk    |
| ----------------------------- | ------- | ------------------- | ----- | ------- |
| `ai`                          | 5.0.124 | **5.0.151**         | +27   | Low     |
| `@ai-sdk/anthropic`           | 2.0.65  | **2.0.70**          | +5    | Low     |
| `@ai-sdk/openai`              | 2.0.89  | **2.0.98**          | +9    | Low     |
| `@ai-sdk/amazon-bedrock`      | 3.0.82  | **3.0.87**          | +5    | Low     |
| `@ai-sdk/azure`               | 2.0.91  | **2.0.100**         | +9    | Low     |
| `@ai-sdk/cerebras`            | 1.0.36  | **1.0.39**          | +3    | Low     |
| `@ai-sdk/cohere`              | 2.0.22  | **2.0.24**          | +2    | Low     |
| `@ai-sdk/deepinfra`           | 1.0.36  | **1.0.37**          | +1    | Low     |
| `@ai-sdk/gateway`             | 2.0.30  | **2.0.56**          | +26   | Low-Med |
| `@ai-sdk/google`              | 2.0.54  | **2.0.60**          | +6    | Low     |
| `@ai-sdk/google-vertex`       | 3.0.106 | **3.0.116**         | +10   | Low     |
| `@ai-sdk/groq`                | 2.0.34  | **2.0.36**          | +2    | Low     |
| `@ai-sdk/mistral`             | 2.0.27  | **2.0.29**          | +2    | Low     |
| `@ai-sdk/openai-compatible`   | 1.0.32  | **1.0.34**          | +2    | Low     |
| `@ai-sdk/perplexity`          | 2.0.23  | **2.0.25**          | +2    | Low     |
| `@ai-sdk/provider`            | 2.0.1   | 2.0.1               | 0     | N/A     |
| `@ai-sdk/provider-utils`      | 3.0.21  | **3.0.22**          | +1    | Low     |
| `@ai-sdk/togetherai`          | 1.0.34  | **1.0.37**          | +3    | Low     |
| `@ai-sdk/vercel`              | 1.0.33  | **1.0.35**          | +2    | Low     |
| `@ai-sdk/xai`                 | 2.0.51  | **2.0.62**          | +11   | Low     |
| `@openrouter/ai-sdk-provider` | 1.5.4   | 1.5.4               | 0     | N/A     |
| `@gitlab/gitlab-ai-provider`  | 3.6.0   | **3.6.1**           | +1    | Low     |
| `ai-gateway-provider`         | 2.3.1   | 2.3.1               | 0     | N/A     |

---

## Per-Package Changelog Details

### `ai` (5.0.124 -> 5.0.151)

The core Vercel AI SDK package. 27 patch releases behind.

**Notable changes:**

- **5.0.130** - Security: prevent unbounded memory growth in download functions. `download()` and `downloadBlob()` now enforce a default 2 GiB size limit. Downloads exceeding the limit are aborted with `DownloadError`. Added `createDownload({ maxBytes })` factory and `download` option on `transcribe()` / `experimental_generateVideo()`.
- **5.0.146** - Security: SSRF prevention in downloads. Added URL validation to `download` to reject private/internal IP addresses, localhost, and non-HTTP protocols before fetching.
- **5.0.149** - Security: SSRF redirect bypass fix. `download` now validates the final URL after following HTTP redirects, preventing SSRF bypass via open redirects to internal addresses.
- All other versions: transitive dependency updates to `@ai-sdk/gateway` and `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md
> npm: https://www.npmjs.com/package/ai

---

### `@ai-sdk/openai` (2.0.89 -> 2.0.98)

9 patch releases with significant feature additions.

| Version | Change                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------- |
| 2.0.90  | Rework file search tool; remove provider-executed tools from chat completions model                 |
| 2.0.91  | Add `maxToolCalls` provider option; image generation tool support                                   |
| 2.0.92  | Dependency update                                                                                   |
| 2.0.93  | Code interpreter tool calls and results                                                             |
| 2.0.94  | Fix: send sources action as include; fix code interpreter tool in `doGenerate`                      |
| 2.0.95  | Add JSDoc for openai tools                                                                          |
| 2.0.96  | Fix: only send tool calls finish reason for non-provider-executed tools; add `web_search` tool      |
| 2.0.97  | Fix: timestamp granularities support for openai transcription                                       |
| 2.0.98  | Fix: include filename & fileExtension to avoid `experimental_transcribe` failures with valid Buffer |

> Changelog: https://github.com/vercel/ai/blob/main/packages/openai/CHANGELOG.md

---

### `@ai-sdk/xai` (2.0.51 -> 2.0.62)

11 patch releases with notable new features.

| Version | Change                                                                      |
| ------- | --------------------------------------------------------------------------- |
| 2.0.52  | Add dedicated XaiImageModel with JSON-based image editing                   |
| 2.0.53  | Normalize provider-specific model options type names, ensure exports        |
| 2.0.54  | Add Responses API `file_search` streaming support                           |
| 2.0.56  | Fix: handle inconsistent cached token reporting                             |
| 2.0.57  | Add video support                                                           |
| 2.0.58  | Add `grok-imagine-image-pro` and `grok-2-image-1212` model IDs              |
| 2.0.59  | Add `resolution` provider option (`"1k"` or `"2k"`) for image models        |
| 2.0.61  | Add `logprobs` and `topLogprobs` support in chat/responses provider options |
| 2.0.62  | Remove obsolete model IDs for Anthropic, Google, OpenAI, xAI                |
| Others  | Dependency bumps                                                            |

> Changelog: https://github.com/vercel/ai/blob/main/packages/xai/CHANGELOG.md

---

### `@ai-sdk/gateway` (2.0.30 -> 2.0.56)

26 patch releases -- the largest delta. Significant feature additions.

**Key changes:**

- Image model support (server-side image request splitting, per-provider `maxImagesPerCall`, image editing)
- New model IDs: GPT-5 pro, GPT-5-codex, GPT-5.2, Gemini 3 Flash, Sonnet 4.5, DeepSeek V3.1/V3.2, Qwen models, Imagen 4 Ultra, and more
- Provider options: `models` for model routing, `user` and `tags`, `only` option, zero data retention, request-scoped BYOK
- Auth improvements: better error messages, OIDC refresh with `@vercel/oidc`
- React Native fix: added `react-native` export condition
- Lazy schema loading for performance
- Expose raw finish reason
- Provider version header

> **Note:** Some sub-dependency bumps within this range update `@ai-sdk/provider` to 3.x and `@ai-sdk/provider-utils` to 4.x internally. Since you're already on 2.0.30, moving to 2.0.56 should be compatible, but verify peer dependencies align.

> Changelog: https://github.com/vercel/ai/blob/main/packages/gateway/CHANGELOG.md

---

### `@ai-sdk/anthropic` (2.0.65 -> 2.0.70)

5 patch releases. All are dependency bumps to `@ai-sdk/provider-utils`. No Anthropic-specific code changes.

> Changelog: https://github.com/vercel/ai/blob/main/packages/anthropic/CHANGELOG.md

---

### `@ai-sdk/amazon-bedrock` (3.0.82 -> 3.0.87)

5 patch releases. All dependency bumps. The `ai-v5` dist-tag points to `3.0.87`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/amazon-bedrock/CHANGELOG.md

---

### `@ai-sdk/azure` (2.0.91 -> 2.0.100)

9 patch releases. All dependency bumps to `@ai-sdk/openai`, `@ai-sdk/provider-utils`, and `@ai-sdk/provider`. No Azure-specific changes.

> Changelog: https://github.com/vercel/ai/blob/main/packages/azure/CHANGELOG.md

---

### `@ai-sdk/cerebras` (1.0.36 -> 1.0.39)

3 patch releases. All dependency bumps (`@ai-sdk/openai-compatible`, `@ai-sdk/provider-utils`). No Cerebras-specific changes.

> Changelog: https://github.com/vercel/ai/blob/main/packages/cerebras/CHANGELOG.md

---

### `@ai-sdk/cohere` (2.0.22 -> 2.0.24)

2 patch releases. Both are dependency bumps to `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/cohere/CHANGELOG.md

---

### `@ai-sdk/deepinfra` (1.0.36 -> 1.0.37)

1 patch release. Transitive dependency bump only.

> Changelog: https://github.com/vercel/ai/blob/main/packages/deepinfra/CHANGELOG.md

---

### `@ai-sdk/google` (2.0.54 -> 2.0.60)

6 patch releases. All dependency bumps to `@ai-sdk/provider-utils` and `@ai-sdk/provider`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/google/CHANGELOG.md

---

### `@ai-sdk/google-vertex` (3.0.106 -> 3.0.116)

10 patch releases. All dependency bumps:

- `@ai-sdk/google`: 2.0.54 -> 2.0.60
- `@ai-sdk/anthropic`: 2.0.65 -> 2.0.70
- `@ai-sdk/provider-utils`: 3.0.21 -> 3.0.22

> Changelog: https://github.com/vercel/ai/blob/main/packages/google-vertex/CHANGELOG.md

---

### `@ai-sdk/groq` (2.0.34 -> 2.0.36)

| Version | Change                                       |
| ------- | -------------------------------------------- |
| 2.0.35  | Dependency update (`@ai-sdk/provider-utils`) |
| 2.0.36  | Remove obsolete `saba` model ID              |

> Changelog: https://github.com/vercel/ai/blob/main/packages/groq/CHANGELOG.md

---

### `@ai-sdk/mistral` (2.0.27 -> 2.0.29)

2 patch releases. Both dependency bumps to `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/mistral/CHANGELOG.md

---

### `@ai-sdk/openai-compatible` (1.0.32 -> 1.0.34)

2 patch releases. Dependency bumps to `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/openai-compatible/CHANGELOG.md

---

### `@ai-sdk/perplexity` (2.0.23 -> 2.0.25)

2 patch releases. Both dependency bumps to `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/perplexity/CHANGELOG.md

---

### `@ai-sdk/provider` (2.0.1 -- already at latest)

No upgrade available within major 2.x.

> Changelog: https://github.com/vercel/ai/blob/main/packages/provider/CHANGELOG.md

---

### `@ai-sdk/provider-utils` (3.0.21 -> 3.0.22)

1 patch release. Transitive dependency bump.

> Changelog: https://github.com/vercel/ai/blob/main/packages/provider-utils/CHANGELOG.md

---

### `@ai-sdk/togetherai` (1.0.34 -> 1.0.37)

3 patch releases. All dependency bumps (`@ai-sdk/openai-compatible`, `@ai-sdk/provider-utils`).

> Changelog: https://github.com/vercel/ai/blob/main/packages/togetherai/CHANGELOG.md

---

### `@ai-sdk/vercel` (1.0.33 -> 1.0.35)

2 patch releases. Both dependency bumps to `@ai-sdk/provider-utils`.

> Changelog: https://github.com/vercel/ai/blob/main/packages/vercel/CHANGELOG.md

---

### `@openrouter/ai-sdk-provider` (1.5.4 -- already at latest)

No upgrade available within major 1.x. Note: v2.x exists (up to 2.2.5) but that's a major bump.

> Note: This package has a patch applied in `patchedDependencies`.
> Releases: https://github.com/OpenRouterTeam/ai-sdk-provider/releases

---

### `@gitlab/gitlab-ai-provider` (3.6.0 -> 3.6.1)

1 patch release available.

> Releases: https://gitlab.com/gitlab-org/editor-extensions/gitlab-ai-provider/-/releases

---

### `ai-gateway-provider` (2.3.1 -- already at latest)

No upgrade available within major 2.x. Note: v3.x exists (up to 3.1.1) but that's a major bump.

> Releases: https://github.com/cloudflare/ai/releases

---

## Notes

- The `ai` catalog version in the root `package.json` is `5.0.124`. Upgrading `ai` requires updating the catalog entry.
- All `@ai-sdk/*` packages are pinned in `packages/opencode/package.json` directly.
- `@openrouter/ai-sdk-provider@1.5.4` has a patch in `patchedDependencies` -- verify the patch still applies if upgrading to a future version.
- Major version upgrades (AI SDK v6/v7) are available for most packages but are out of scope for this report.
