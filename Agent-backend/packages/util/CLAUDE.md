# packages/util

> **Path:** `Agent-backend/packages/util/`

## Purpose

Shared utility library (`@opencode-ai/util`) used across all packages. Provides foundational helpers for arrays, encoding, errors, functions, identifiers, paths, retry logic, and slug generation. Zero external dependencies except Zod.

## Usage Status

| Product             | Status   | Notes                                           |
| ------------------- | -------- | ----------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Used by opencode, sdk, app, and plugin packages |
| Orbit CLI           | `active` | Same utilities in CLI mode                      |

## Key Files

| File                | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `src/array.ts`      | Array utilities (dedup, chunk, etc.)                                          |
| `src/binary.ts`     | Binary data helpers                                                           |
| `src/encode.ts`     | Base64 encoding/decoding, checksum — used for URL slugs and localStorage keys |
| `src/error.ts`      | `NamedError` class for structured error handling                              |
| `src/fn.ts`         | Function utilities (debounce, throttle, etc.)                                 |
| `src/identifier.ts` | Identifier generation and validation                                          |
| `src/iife.ts`       | IIFE helper for inline expressions                                            |
| `src/lazy.ts`       | Lazy initialization wrapper                                                   |
| `src/module.ts`     | Module resolution helpers                                                     |
| `src/path.ts`       | Path manipulation utilities                                                   |
| `src/retry.ts`      | Retry with backoff logic                                                      |
| `src/slug.ts`       | URL-safe slug generation                                                      |

## Import Pattern

Exports are per-file (no barrel index.ts):

```typescript
import { base64Encode, checksum } from "@opencode-ai/util/encode"
import { NamedError } from "@opencode-ai/util/error"
import { iife } from "@opencode-ai/util/iife"
```

## Dependencies

- `zod` — used in some utility types

## Notes

- **No barrel export** — uses wildcard export mapping (`"./*": "./src/*.ts"`) so each file is imported individually. This enables tree-shaking and avoids pulling in unused utilities.
- **`encode.ts` is critical for E2E tests** — `base64Encode` and `checksum` are used to construct URL slugs and workspace-scoped localStorage keys throughout the app and test infrastructure.
