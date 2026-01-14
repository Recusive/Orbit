# Content Security Policy (CSP) Configuration

> **Last Updated:** January 2026

This document explains Orbit's CSP configuration in `src-tauri/tauri.conf.json`.

## Current CSP Settings

```json
{
  "security": {
    "csp": {
      "default-src": "'self'",
      "script-src": "'self' 'unsafe-eval'",
      "style-src": "'self' 'unsafe-inline'",
      "connect-src": "'self' https://api.anthropic.com ipc://localhost",
      "img-src": "'self' data: blob:",
      "font-src": "'self' data:",
      "frame-src": "'none'",
      "object-src": "'none'"
    }
  }
}
```

## Why `'unsafe-eval'` is Required

### Root Cause

The `streamdown` library (v2.0.0+) uses `new Function()` for dynamic CDN imports:

```typescript
// From: node_modules/streamdown/lib/mermaid/utils.ts (line 19-22)
// Using Function constructor to create an indirect import that bundlers won't analyze
const dynamicImport = new Function('url', 'return import(url)') as (
  url: string
) => Promise<typeof import('mermaid')>;
```

### What Changed

| Version        | Bundle Strategy               | CSP Requirement            |
| -------------- | ----------------------------- | -------------------------- |
| streamdown 1.x | Everything bundled statically | No `unsafe-eval` needed    |
| streamdown 2.x | 98% smaller bundle via CDN    | **Requires `unsafe-eval`** |

Streamdown 2.0 reduced bundle size by loading Shiki themes, languages, and Mermaid from Vercel's CDN at runtime. To bypass bundler static analysis (Vite/Webpack), they use `new Function()` which is functionally equivalent to `eval()`.

### References

- **Streamdown repo:** <https://github.com/vercel/streamdown>
- **Changelog:** See `packages/streamdown/CHANGELOG.md` in the repo
- **Key commit:** `75faa2e` - "Reduce bundle size by 98%, create Streamdown CDN"

## Security Risk Assessment

### Threat Model: Web App vs Desktop App

| Attack Vector                 | Web App Risk | Orbit (Desktop) Risk                       |
| ----------------------------- | ------------ | ------------------------------------------ |
| XSS injection                 | **HIGH**     | **VERY LOW** - No untrusted HTML rendered  |
| Third-party script compromise | **HIGH**     | **LOW** - Only Vercel CDN (trusted)        |
| User input to eval            | **MEDIUM**   | **NONE** - Chat is markdown, not executed  |
| Local attacker                | N/A          | CSP irrelevant if local access compromised |

### What Uses `eval()` in Orbit

Only streamdown's CDN loader:

- Loads Shiki themes/languages from `cdn.jsdelivr.net` or Vercel CDN
- Loads Mermaid for diagram rendering
- **No user input ever reaches these code paths**

### Attack Surface Analysis

```text
Untrusted Input Sources in Orbit:
├── Claude API responses    → Rendered as markdown, NOT eval'd
├── Local files             → Displayed in CodeMirror, NOT eval'd
├── Terminal output         → Text rendering only, NOT eval'd
└── User chat input         → Sent to API, NOT eval'd locally

Code paths using eval (with unsafe-eval):
└── Streamdown CDN loader
    └── Hardcoded URLs only (Vercel CDN)
    └── No user input flows here
```

**Conclusion:** No path exists from untrusted input to `eval()` execution.

## Alternatives Considered

| Option                          | Pros                                       | Cons                                          |
| ------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Keep `unsafe-eval`** (chosen) | Works with streamdown 2.x, smaller bundles | Slightly reduced CSP strictness               |
| Downgrade to streamdown 1.x     | No CSP changes needed                      | 98% larger bundle, no security updates        |
| Replace streamdown              | Full CSP compliance                        | Significant refactor, lose streaming features |
| Self-host CDN assets            | No external CDN dependency                 | Complex setup, may still need eval            |

## Other CSP Directives Explained

| Directive     | Value                       | Purpose                                       |
| ------------- | --------------------------- | --------------------------------------------- |
| `connect-src` | `ipc://localhost`           | Tauri's internal WebView to Rust IPC protocol |
| `connect-src` | `https://api.anthropic.com` | Claude API calls                              |
| `style-src`   | `'unsafe-inline'`           | Required for Tailwind/CSS-in-JS               |
| `img-src`     | `data: blob:`               | Inline images, screenshots, file previews     |
| `frame-src`   | `'none'`                    | No iframes allowed (security hardening)       |
| `object-src`  | `'none'`                    | No plugins/embeds (security hardening)        |

## Recommendations

1. **Pin streamdown version** - Use exact version (`"streamdown": "2.0.1"`) instead of caret (`^2.0.1`)
2. **Audit updates** - Review streamdown changelogs before upgrading
3. **Monitor for CSP-safe alternatives** - If streamdown adds a no-eval mode, consider switching

## Changelog

- **January 2026:** Added `'unsafe-eval'` after upgrading streamdown 1.6.11 to 2.0.1
- **January 2026:** Added `ipc://localhost` to `connect-src` for Tauri IPC
