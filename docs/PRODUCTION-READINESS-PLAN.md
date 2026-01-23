# Orbit Production Readiness Plan

> **Target**: 20 days to battle-tested production release
> **Last Updated**: January 2026
> **Status**: Planning

---

## How to Use This Document

This document is designed for **AI-assisted implementation**. Each task (e.g., 1.1, 1.2) is:

1. **Self-contained**: Can be completed without context from other tasks
2. **Independent**: Does not require other sub-tasks to be completed first (unless marked as dependency)
3. **Verifiable**: Has clear "done" criteria
4. **Copy-pasteable**: Each task can be given to a fresh AI session

**Workflow**:

1. Copy the task section (e.g., "Task 1.2")
2. Paste into a new AI session
3. AI completes the task
4. Verify using the "Verification" checklist
5. Move to next task

---

## Table of Contents

- [Phase 1: Sentry Error Tracking](#phase-1-sentry-error-tracking)
- [Phase 2: Testing Infrastructure Setup](#phase-2-testing-infrastructure-setup)
- [Phase 3: Unit Tests](#phase-3-unit-tests)
- [Phase 4: Integration Tests](#phase-4-integration-tests)
- [Phase 5: Playwright E2E Tests](#phase-5-playwright-e2e-tests)
- [Phase 6: Error Handling & Fallbacks](#phase-6-error-handling--fallbacks)
- [Phase 7: Custom Telemetry Dashboard](#phase-7-custom-telemetry-dashboard)
- [Phase 8: Feature Flags](#phase-8-feature-flags)
- [Phase 9: Security & Secrets](#phase-9-security--secrets)
- [Phase 10: Final Hardening](#phase-10-final-hardening)

---

## Phase 1: Sentry Error Tracking

**Goal**: Capture all errors from frontend, backend, and sidecar with full context.

**Estimated Time**: 1-2 days

---

### Task 1.1: Sentry Account & Project Setup (Manual)

**Type**: Manual setup (not AI)
**Time**: 15 minutes
**Dependencies**: None

#### Context

Sentry is an error tracking service. We need to create an account and project before integrating the SDK.

#### Steps

1. Go to https://sentry.io and create an account (or sign in)

2. Create a new project:
   - Click "Create Project"
   - Select platform: **React**
   - Project name: `orbit`
   - Team: Create or select team

3. After creation, note down:
   - **DSN**: Looks like `https://xxx@xxx.ingest.sentry.io/xxx`
   - **Project ID**: Numeric ID
   - **Organization slug**: Your org name

4. Create an Auth Token for source maps:
   - Go to Settings → Auth Tokens
   - Create new token with scopes: `project:releases`, `org:read`
   - Save this token securely

5. Create a `.env.sentry` file template (DO NOT commit real values):

   ```bash
   # Sentry Configuration
   # Copy to .env.local and fill in real values

   VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   SENTRY_AUTH_TOKEN=sntrys_xxx
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=orbit
   ```

#### Verification

- [ ] Sentry account created
- [ ] Project "orbit" exists
- [ ] DSN obtained
- [ ] Auth token created
- [ ] `.env.sentry` template created

#### Output

- Sentry DSN (keep secure)
- Sentry Auth Token (keep secure)
- Organization slug
- Project name

---

### Task 1.2: Sentry Integration - apps/agent (Frontend)

**Type**: Code implementation
**Time**: 2-3 hours
**Dependencies**: Task 1.1 completed (DSN available)

#### Context

The `apps/agent` directory contains the main React frontend application. We need to integrate Sentry to capture:

- JavaScript errors
- Unhandled promise rejections
- React component errors
- Performance metrics

The app uses:

- React 19
- Vite as bundler
- TypeScript
- Zustand for state management

#### Files to Create/Modify

```
apps/agent/
├── src/
│   ├── lib/
│   │   └── sentry.ts              # NEW: Sentry configuration
│   ├── main.tsx                   # MODIFY: Initialize Sentry first
│   └── App.tsx                    # MODIFY: Add Sentry ErrorBoundary
├── vite.config.ts                 # MODIFY: Add source maps plugin
└── package.json                   # MODIFY: Add dependencies
```

#### Step 1: Install Dependencies

Add these dependencies to `apps/agent/package.json`:

```json
{
  "dependencies": {
    "@sentry/react": "^8.0.0"
  },
  "devDependencies": {
    "@sentry/vite-plugin": "^2.0.0"
  }
}
```

Run: `bun install` from project root.

#### Step 2: Create Sentry Configuration

Create file: `apps/agent/src/lib/sentry.ts`

```typescript
/**
 * Sentry Error Tracking Configuration
 *
 * This module initializes Sentry for the agent app.
 * Must be imported and called BEFORE React renders.
 *
 * Environment variables required:
 * - VITE_SENTRY_DSN: Sentry project DSN
 */

import * as Sentry from '@sentry/react';

// Get version from package.json (injected by Vite)
const APP_VERSION = __APP_VERSION__ ?? '0.0.0';

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/**
 * Get the Sentry DSN from environment
 */
function getSentryDsn(): string | undefined {
  return import.meta.env.VITE_SENTRY_DSN as string | undefined;
}

/**
 * Initialize Sentry error tracking
 *
 * Call this function once at app startup, before React renders.
 * In development, Sentry will still initialize but with reduced sampling.
 */
export function initSentry(): void {
  const dsn = getSentryDsn();

  if (!dsn) {
    if (!isDevelopment()) {
      console.warn('[Sentry] No DSN provided, error tracking disabled');
    }
    return;
  }

  Sentry.init({
    dsn,

    // Environment and release tracking
    environment: isDevelopment() ? 'development' : 'production',
    release: `orbit-agent@${APP_VERSION}`,

    // Integrations
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration(),
      // Replay for session recording (only on errors)
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Sampling rates
    // In production: capture 100% of errors, 10% of transactions
    // In development: capture 100% of errors, 100% of transactions (for testing)
    tracesSampleRate: isDevelopment() ? 1.0 : 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: isDevelopment() ? 0 : 1.0,

    // Don't send PII
    sendDefaultPii: false,

    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Network errors (handled separately)
      'Network request failed',
      'Failed to fetch',
      // ResizeObserver (browser bug, not actionable)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],

    // Add custom tags to all events
    initialScope: {
      tags: {
        app: 'agent',
        platform: getPlatform(),
      },
    },

    // Before sending, add additional context
    beforeSend(event, hint) {
      // In development, log to console for debugging
      if (isDevelopment()) {
        console.error('[Sentry] Captured error:', hint.originalException);
      }

      return event;
    },
  });
}

/**
 * Get the current platform
 */
function getPlatform(): string {
  // Tauri provides this
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    // We can get more specific platform info from Tauri
    return 'tauri';
  }
  return 'web';
}

/**
 * Set user context for Sentry
 * Call this when you have user identification info
 */
export function setSentryUser(userId: string, extra?: Record<string, string>): void {
  Sentry.setUser({
    id: userId,
    ...extra,
  });
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging context
 */
export function addSentryBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Capture a custom error with context
 */
export function captureError(error: Error, context?: Record<string, unknown>): string {
  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a custom message
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): string {
  return Sentry.captureMessage(message, level);
}

// Re-export ErrorBoundary for use in components
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// Re-export for advanced usage
export { Sentry };
```

#### Step 3: Add Version Injection to Vite Config

Modify `vite.config.ts` to inject version and upload source maps:

```typescript
// Add to imports
import { sentryVitePlugin } from '@sentry/vite-plugin';
import pkg from './package.json';

// Add to defineConfig
export default defineConfig({
  // ... existing config

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  build: {
    sourcemap: true, // Required for Sentry source maps
  },

  plugins: [
    // ... existing plugins

    // Sentry source maps upload (only in production build)
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Only upload in CI/production builds
      disable: !process.env.SENTRY_AUTH_TOKEN,

      sourcemaps: {
        filesToDeleteAfterUpload: ['**/*.map'],
      },

      release: {
        name: `orbit-agent@${pkg.version}`,
      },
    }),
  ],
});
```

#### Step 4: Add TypeScript Declaration for Version

Create or modify `apps/agent/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

#### Step 5: Initialize Sentry in main.tsx

Modify `apps/agent/src/main.tsx` to initialize Sentry FIRST:

```typescript
// IMPORTANT: Sentry must be initialized before anything else
import { initSentry } from '@/lib/sentry';
initSentry();

// Then import everything else
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';

// ... rest of the file
```

#### Step 6: Add Sentry ErrorBoundary to App.tsx

Modify `apps/agent/src/App.tsx` to wrap with Sentry ErrorBoundary:

```typescript
import { SentryErrorBoundary } from '@/lib/sentry';

// Find the main App component and wrap the root return:

function App(): JSX.Element {
  return (
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">{error.message}</p>
            <button
              onClick={resetError}
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      onError={(error, componentStack) => {
        console.error('React Error Boundary caught:', error, componentStack);
      }}
    >
      {/* Existing app content */}
    </SentryErrorBoundary>
  );
}
```

#### Step 7: Add Sentry Breadcrumbs to Key Actions

In files where important actions happen, add breadcrumbs. Example for `apps/agent/src/stores/file-store.ts`:

```typescript
import { addSentryBreadcrumb } from '@/lib/sentry';

// In openFile action:
openFile: async (path: string) => {
  addSentryBreadcrumb('Opening file', 'file-operation', { path });
  // ... existing code
};

// In saveFile action:
saveFile: async (path: string, content: string) => {
  addSentryBreadcrumb('Saving file', 'file-operation', { path });
  // ... existing code
};
```

#### Verification

- [ ] `bun install` completes without errors
- [ ] `bun run typecheck` passes
- [ ] `bun run dev` starts without errors
- [ ] Sentry initializes (check console for `[Sentry]` messages in dev)
- [ ] Trigger a test error: add `throw new Error('Test Sentry')` temporarily
- [ ] Error appears in Sentry dashboard

#### Output

- Sentry SDK integrated into apps/agent
- Error boundary wrapping root component
- Breadcrumbs added to key actions
- Source maps configured for production builds

---

### Task 1.3: Sentry Integration - apps/Canvas-UI-Builder (Frontend)

**Type**: Code implementation
**Time**: 1 hour
**Dependencies**: Task 1.1 completed (DSN available)

#### Context

The `apps/Canvas-UI-Builder` directory contains the Canvas UI Builder React application. We need to integrate Sentry following the same pattern as apps/agent.

This app uses:

- React 19
- Vite as bundler
- TypeScript
- Separate entry point from apps/agent

#### Files to Create/Modify

```
apps/Canvas-UI-Builder/
├── src/
│   ├── lib/
│   │   └── sentry.ts              # NEW: Sentry configuration
│   ├── main.tsx                   # MODIFY: Initialize Sentry first
│   └── CanvasApp.tsx              # MODIFY: Add Sentry ErrorBoundary
└── vite.config.ts                 # MODIFY: Add source maps plugin
```

#### Step 1: Create Sentry Configuration

Create file: `apps/Canvas-UI-Builder/src/lib/sentry.ts`

This should be nearly identical to apps/agent/src/lib/sentry.ts with one change:

```typescript
// Change this line in initialScope:
initialScope: {
  tags: {
    app: 'canvas',  // Different app tag
    platform: getPlatform(),
  },
},
```

**IMPORTANT**: Copy the entire sentry.ts file from Task 1.2, but change `app: 'agent'` to `app: 'canvas'`.

#### Step 2: Update Vite Config

Modify `apps/Canvas-UI-Builder/vite.config.ts`:

- Add `sentryVitePlugin` (same as Task 1.2)
- Add `__APP_VERSION__` define
- Enable sourcemaps

#### Step 3: Add TypeScript Declaration

Create `apps/Canvas-UI-Builder/src/vite-env.d.ts` (same content as Task 1.2)

#### Step 4: Initialize in main.tsx

Modify `apps/Canvas-UI-Builder/src/main.tsx`:

```typescript
// IMPORTANT: Sentry must be initialized before anything else
import { initSentry } from '@/lib/sentry';
initSentry();

// Then import everything else
// ... existing imports and code
```

#### Step 5: Add ErrorBoundary to CanvasApp.tsx

Modify `apps/Canvas-UI-Builder/src/CanvasApp.tsx`:

```typescript
import { SentryErrorBoundary } from '@/lib/sentry';

function CanvasApp(): JSX.Element {
  return (
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Canvas Error</h1>
            <p className="mt-2 text-muted-foreground">{error.message}</p>
            <button
              onClick={resetError}
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    >
      {/* Existing canvas content */}
    </SentryErrorBoundary>
  );
}
```

#### Verification

- [ ] `bun run typecheck` passes
- [ ] Canvas app builds without errors
- [ ] Sentry initializes when canvas loads
- [ ] Errors are tagged with `app: canvas` in Sentry dashboard

#### Output

- Sentry SDK integrated into apps/Canvas-UI-Builder
- Errors tagged separately from agent app

---

### Task 1.4: Sentry Integration - src-tauri (Rust Backend)

**Type**: Code implementation
**Time**: 2-3 hours
**Dependencies**: Task 1.1 completed (DSN available)

#### Context

The `src-tauri` directory contains the Rust backend for the Tauri application. We need to integrate Sentry to capture:

- Rust panics
- Errors returned from Tauri commands
- Performance of backend operations

The backend uses:

- Tauri 2
- Rust workspace with multiple crates
- Result<T, String> pattern for error handling

#### Files to Create/Modify

```
src-tauri/
├── Cargo.toml                     # MODIFY: Add sentry dependency
├── src/
│   ├── main.rs                    # MODIFY: Initialize Sentry
│   ├── lib.rs                     # MODIFY: Add error capturing helper
│   └── sentry.rs                  # NEW: Sentry configuration module
```

#### Step 1: Add Sentry Dependency

Modify `src-tauri/Cargo.toml`:

```toml
[dependencies]
# Add to existing dependencies
sentry = { version = "0.34", default-features = false, features = [
    "backtrace",
    "contexts",
    "panic",
    "reqwest",
    "rustls",
] }
sentry-tracing = "0.34"
```

Run: `cargo build` from `src-tauri/` to download dependencies.

#### Step 2: Create Sentry Module

Create file: `src-tauri/src/sentry.rs`

````rust
//! Sentry Error Tracking Configuration
//!
//! This module initializes Sentry for the Tauri backend.
//! Must be called at the very start of main() before Tauri initializes.

use sentry::{ClientInitGuard, ClientOptions};
use std::env;

/// Application version (from Cargo.toml)
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Get the Sentry DSN from environment or embedded value
fn get_sentry_dsn() -> Option<String> {
    // Try environment variable first (for development)
    if let Ok(dsn) = env::var("SENTRY_DSN") {
        if !dsn.is_empty() {
            return Some(dsn);
        }
    }

    // In production, you can embed the DSN at compile time:
    // option_env!("SENTRY_DSN_EMBEDDED").map(String::from)

    // For now, require environment variable
    None
}

/// Check if we're in development mode
fn is_development() -> bool {
    cfg!(debug_assertions)
}

/// Initialize Sentry error tracking
///
/// Returns a guard that must be kept alive for the duration of the application.
/// When the guard is dropped, Sentry will flush any pending events.
///
/// # Example
/// ```
/// fn main() {
///     let _sentry_guard = init_sentry();
///     // ... rest of application
/// }
/// ```
pub fn init_sentry() -> Option<ClientInitGuard> {
    let dsn = get_sentry_dsn();

    if dsn.is_none() {
        if !is_development() {
            eprintln!("[Sentry] No DSN provided, error tracking disabled");
        }
        return None;
    }

    let environment = if is_development() {
        "development"
    } else {
        "production"
    };

    let guard = sentry::init(ClientOptions {
        dsn: dsn.map(|s| s.parse().expect("Invalid Sentry DSN")),
        release: Some(format!("orbit-tauri@{}", APP_VERSION).into()),
        environment: Some(environment.into()),

        // Capture 100% of errors
        sample_rate: 1.0,

        // Performance monitoring (10% in production, 100% in dev)
        traces_sample_rate: if is_development() { 1.0 } else { 0.1 },

        // Enable panic handling
        auto_session_tracking: true,

        // Add session tracking
        session_mode: sentry::SessionMode::Request,

        // Attach stacktraces to all messages
        attach_stacktrace: true,

        // Don't send PII
        send_default_pii: false,

        // Filter before sending
        before_send: Some(std::sync::Arc::new(|event| {
            // You can filter or modify events here
            Some(event)
        })),

        ..Default::default()
    });

    // Add default tags
    sentry::configure_scope(|scope| {
        scope.set_tag("app", "tauri");
        scope.set_tag("platform", get_platform());
    });

    Some(guard)
}

/// Get the current platform string
fn get_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    return "macos";

    #[cfg(target_os = "windows")]
    return "windows";

    #[cfg(target_os = "linux")]
    return "linux";

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown";
}

/// Set user context for Sentry
pub fn set_sentry_user(user_id: &str) {
    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry::User {
            id: Some(user_id.to_string()),
            ..Default::default()
        }));
    });
}

/// Clear user context
pub fn clear_sentry_user() {
    sentry::configure_scope(|scope| {
        scope.set_user(None);
    });
}

/// Add a breadcrumb for debugging context
pub fn add_breadcrumb(message: &str, category: &str) {
    sentry::add_breadcrumb(sentry::Breadcrumb {
        ty: "default".into(),
        message: Some(message.to_string()),
        category: Some(category.to_string()),
        level: sentry::Level::Info,
        ..Default::default()
    });
}

/// Capture an error with context
pub fn capture_error(error: &dyn std::error::Error) -> sentry::protocol::Uuid {
    sentry::capture_error(error)
}

/// Capture a message
pub fn capture_message(message: &str, level: sentry::Level) -> sentry::protocol::Uuid {
    sentry::capture_message(message, level)
}

/// Helper to capture command errors and return them
///
/// Use this in Tauri commands:
/// ```
/// #[tauri::command]
/// pub async fn my_command() -> Result<Data, String> {
///     do_something().map_err(|e| capture_and_return_error(e, "my_command"))
/// }
/// ```
pub fn capture_and_return_error<E: std::error::Error>(error: E, command_name: &str) -> String {
    sentry::with_scope(
        |scope| {
            scope.set_tag("command", command_name);
        },
        || {
            sentry::capture_error(&error);
        },
    );
    error.to_string()
}
````

#### Step 3: Update main.rs

Modify `src-tauri/src/main.rs`:

```rust
// Add module declaration at top
mod sentry;

fn main() {
    // IMPORTANT: Initialize Sentry FIRST, before anything else
    // Keep the guard alive for the entire application lifetime
    let _sentry_guard = sentry::init_sentry();

    // Existing Tauri initialization
    // ... rest of main()
}
```

#### Step 4: Update lib.rs with Helper Macro

Modify `src-tauri/src/lib.rs` to add a helper for command error handling:

````rust
// Add to existing exports
pub use crate::sentry::{add_breadcrumb, capture_and_return_error};

/// Macro to wrap command results and report errors to Sentry
///
/// Usage:
/// ```
/// #[tauri::command]
/// pub async fn my_command() -> Result<Data, String> {
///     sentry_command!("my_command", {
///         let result = do_something()?;
///         Ok(result)
///     })
/// }
/// ```
#[macro_export]
macro_rules! sentry_command {
    ($command_name:expr, $body:expr) => {{
        let result: Result<_, Box<dyn std::error::Error>> = (|| $body)();
        result.map_err(|e| $crate::capture_and_return_error(&*e, $command_name))
    }};
}
````

#### Step 5: Add Breadcrumbs to Key Commands

In command files (e.g., `src-tauri/src/commands/common/git.rs`), add breadcrumbs:

```rust
use crate::sentry::add_breadcrumb;

#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    add_breadcrumb(&format!("Getting git status for {}", path), "git");
    // ... existing code
}
```

#### Step 6: Add Sentry to Panic Handler

If you have a custom panic handler in `src-tauri/src/core/crash.rs`, integrate Sentry:

```rust
use std::panic;

pub fn setup_panic_handler() {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        // Sentry will automatically capture panics, but we can add context
        sentry::capture_event(sentry::protocol::Event {
            message: Some(format!("Panic: {:?}", panic_info)),
            level: sentry::Level::Fatal,
            ..Default::default()
        });

        // Call default handler
        default_hook(panic_info);
    }));
}
```

#### Verification

- [ ] `cargo build` completes without errors
- [ ] `cargo clippy` passes
- [ ] Application starts without Sentry errors
- [ ] Add a test panic (temporary): `panic!("Test Sentry panic")`
- [ ] Panic appears in Sentry dashboard with `app: tauri` tag

#### Output

- Sentry Rust SDK integrated into src-tauri
- Panic handler captures crashes
- Helper functions for command error reporting
- Breadcrumbs in key operations

---

### Task 1.5: Sentry Integration - agent-bridge (Bun Sidecar)

**Type**: Code implementation
**Time**: 1-2 hours
**Dependencies**: Task 1.1 completed (DSN available)

#### Context

The `agent-bridge` directory contains a Bun application that runs as a sidecar process spawned by Tauri. It handles Claude Agent SDK communication.

We need to integrate Sentry to capture:

- Claude SDK errors
- Network failures
- Unhandled promise rejections
- Process crashes

The sidecar uses:

- Bun runtime
- TypeScript
- Claude Agent SDK
- IPC communication with Tauri

#### Files to Create/Modify

```
agent-bridge/
├── src/
│   ├── index.ts                   # MODIFY: Initialize Sentry first
│   ├── sentry.ts                  # NEW: Sentry configuration
│   └── agent.ts                   # MODIFY: Add error capturing
└── package.json                   # MODIFY: Add @sentry/bun
```

#### Step 1: Install Dependency

Add to `agent-bridge/package.json`:

```json
{
  "dependencies": {
    "@sentry/bun": "^8.0.0"
  }
}
```

Run: `cd agent-bridge && bun install`

#### Step 2: Create Sentry Configuration

Create file: `agent-bridge/src/sentry.ts`

```typescript
/**
 * Sentry Error Tracking for Agent Bridge
 *
 * This module initializes Sentry for the Bun sidecar process.
 * Must be imported and called BEFORE any other code runs.
 */

import * as Sentry from '@sentry/bun';

// Get version from package.json
const pkg = require('../package.json');
const APP_VERSION: string = pkg.version ?? '0.0.0';

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get Sentry DSN from environment
 */
function getSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN;
}

/**
 * Initialize Sentry for the agent-bridge sidecar
 */
export function initSentry(): void {
  const dsn = getSentryDsn();

  if (!dsn) {
    if (!isDevelopment()) {
      console.error('[Sentry] No DSN provided, error tracking disabled');
    }
    return;
  }

  Sentry.init({
    dsn,

    environment: isDevelopment() ? 'development' : 'production',
    release: `orbit-bridge@${APP_VERSION}`,

    // Capture 100% of errors
    tracesSampleRate: isDevelopment() ? 1.0 : 0.1,

    // Don't send PII
    sendDefaultPii: false,

    // Add custom tags
    initialScope: {
      tags: {
        app: 'bridge',
        runtime: 'bun',
      },
    },

    // Process-level error handling
    integrations: [
      // Capture unhandled promise rejections
      Sentry.onUnhandledRejectionIntegration(),
    ],

    beforeSend(event, hint) {
      // Log in development for debugging
      if (isDevelopment()) {
        console.error('[Sentry] Captured:', hint.originalException);
      }
      return event;
    },
  });
}

/**
 * Set conversation context
 * Call this when starting a new conversation
 */
export function setConversationContext(conversationId: string): void {
  Sentry.setTag('conversation_id', conversationId);
}

/**
 * Clear conversation context
 */
export function clearConversationContext(): void {
  Sentry.setTag('conversation_id', undefined);
}

/**
 * Set current tool context
 * Call this when executing a tool
 */
export function setToolContext(toolName: string): void {
  Sentry.setTag('tool', toolName);
  Sentry.addBreadcrumb({
    message: `Executing tool: ${toolName}`,
    category: 'tool',
    level: 'info',
  });
}

/**
 * Add breadcrumb for Claude API calls
 */
export function addClaudeBreadcrumb(action: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    message: action,
    category: 'claude',
    data,
    level: 'info',
  });
}

/**
 * Capture Claude SDK error with context
 */
export function captureClaudeError(error: Error, context?: Record<string, unknown>): string {
  return Sentry.captureException(error, {
    tags: {
      source: 'claude-sdk',
    },
    extra: context,
  });
}

/**
 * Capture a general error
 */
export function captureError(error: Error, context?: Record<string, unknown>): string {
  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): string {
  return Sentry.captureMessage(message, level);
}

/**
 * Flush pending events (call before process exit)
 */
export async function flushSentry(): Promise<void> {
  await Sentry.flush(2000);
}

export { Sentry };
```

#### Step 3: Initialize Sentry in index.ts

Modify `agent-bridge/src/index.ts`:

```typescript
// IMPORTANT: Initialize Sentry FIRST, before any other imports
import { initSentry, flushSentry } from './sentry';
initSentry();

// Then import everything else
import {} from /* existing imports */ './agent';
// ... rest of imports

// At the end of the file, handle graceful shutdown
process.on('SIGINT', async () => {
  await flushSentry();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await flushSentry();
  process.exit(0);
});
```

#### Step 4: Add Error Capturing to agent.ts

Modify `agent-bridge/src/agent.ts` to capture Claude SDK errors:

```typescript
import {
  captureClaudeError,
  addClaudeBreadcrumb,
  setToolContext,
  setConversationContext,
} from './sentry';

// In the message handling function:
async function handleMessage(message: IncomingMessage): Promise<void> {
  try {
    if (message.type === 'message:send') {
      setConversationContext(message.session_id);
      addClaudeBreadcrumb('Starting conversation turn', {
        sessionId: message.session_id,
      });

      // ... existing Claude SDK call
    }
  } catch (error) {
    if (error instanceof Error) {
      captureClaudeError(error, {
        messageType: message.type,
        sessionId: message.session_id,
      });
    }
    throw error;
  }
}

// In tool execution:
async function executeTool(tool: Tool, input: unknown): Promise<unknown> {
  setToolContext(tool.name);
  addClaudeBreadcrumb(`Tool execution: ${tool.name}`, { input });

  try {
    const result = await tool.execute(input);
    addClaudeBreadcrumb(`Tool completed: ${tool.name}`, { success: true });
    return result;
  } catch (error) {
    addClaudeBreadcrumb(`Tool failed: ${tool.name}`, { error: String(error) });
    throw error;
  }
}
```

#### Step 5: Pass DSN to Sidecar

The sidecar is spawned by Tauri. Ensure the DSN is passed via environment:

In Tauri's sidecar spawning code (likely in `src-tauri/src/agent/mod.rs` or similar):

```rust
// When spawning the sidecar, pass the DSN
let mut command = Command::new(sidecar_path);
if let Ok(dsn) = std::env::var("SENTRY_DSN") {
    command.env("SENTRY_DSN", dsn);
}
```

#### Verification

- [ ] `cd agent-bridge && bun install` completes
- [ ] `cd agent-bridge && bun run build` completes
- [ ] Sidecar starts without errors
- [ ] Test error capture: throw an error in handleMessage
- [ ] Error appears in Sentry with `app: bridge` tag

#### Output

- Sentry integrated into agent-bridge sidecar
- Claude SDK errors captured with context
- Tool execution tracked with breadcrumbs
- Graceful shutdown flushes pending events

---

### Task 1.6: Sentry Source Maps & CI Integration

**Type**: CI/CD configuration
**Time**: 1-2 hours
**Dependencies**: Tasks 1.2, 1.3, 1.4, 1.5 completed

#### Context

Source maps allow Sentry to show original TypeScript/Rust code in stack traces instead of minified/compiled code. We need to:

1. Upload source maps during CI builds
2. Tag releases properly
3. Ensure production builds have correct release versions

#### Files to Modify

```
.github/workflows/
├── ci.yml                         # MODIFY: Add Sentry source map upload
└── tauri-build.yml                # MODIFY: Add Sentry release
.env.example                       # MODIFY: Document Sentry variables
```

#### Step 1: Add GitHub Secrets

In your GitHub repository settings, add these secrets:

| Secret Name         | Description                                     |
| ------------------- | ----------------------------------------------- |
| `SENTRY_AUTH_TOKEN` | Auth token from Sentry (Settings → Auth Tokens) |
| `SENTRY_ORG`        | Your Sentry organization slug                   |
| `SENTRY_PROJECT`    | Project name (e.g., `orbit`)                    |
| `SENTRY_DSN`        | The DSN for your project                        |

#### Step 2: Update CI Workflow for Source Maps

Modify `.github/workflows/ci.yml`:

```yaml
# Add new job for source map upload
jobs:
  # ... existing jobs ...

  sentry-release:
    name: Create Sentry Release
    runs-on: ubuntu-latest
    needs: [build-agent, build-canvas] # Wait for builds
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Build with source maps
        run: bun run build
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}

      - name: Create Sentry Release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
        with:
          environment: production
          version: ${{ github.ref_name }}
          sourcemaps: |
            apps/agent/dist
            apps/Canvas-UI-Builder/dist
```

#### Step 3: Update Tauri Build Workflow

Modify `.github/workflows/tauri-build.yml`:

```yaml
jobs:
  build:
    # ... existing configuration ...

    steps:
      # ... existing steps ...

      - name: Build Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          # ... existing env vars ...
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
```

#### Step 4: Update .env.example

```bash
# Sentry Error Tracking
# Get these values from https://sentry.io
VITE_SENTRY_DSN=           # For frontend (React apps)
SENTRY_DSN=                # For backend (Rust + agent-bridge)
SENTRY_AUTH_TOKEN=         # For source map uploads
SENTRY_ORG=                # Your organization slug
SENTRY_PROJECT=            # Project name (e.g., orbit)
```

#### Step 5: Add Sentry CLI for Local Testing

Add to root `package.json` scripts:

```json
{
  "scripts": {
    "sentry:sourcemaps": "sentry-cli sourcemaps upload --release=$npm_package_version ./apps/agent/dist ./apps/Canvas-UI-Builder/dist"
  },
  "devDependencies": {
    "@sentry/cli": "^2.0.0"
  }
}
```

#### Verification

- [ ] GitHub Secrets are configured
- [ ] CI workflow runs without errors
- [ ] Source maps appear in Sentry (Settings → Source Maps)
- [ ] Stack traces show original TypeScript code
- [ ] Releases are tracked in Sentry (Releases page)

#### Output

- Source maps uploaded on every production build
- Releases tagged with version numbers
- CI pipeline integrated with Sentry

---

### Task 1.7: Sentry Integration Verification

**Type**: Testing and verification
**Time**: 1 hour
**Dependencies**: Tasks 1.2-1.6 completed

#### Context

After integrating Sentry across all components, we need to verify everything works end-to-end.

#### Step 1: Create Test Errors Script

Create file: `scripts/test-sentry.ts`

```typescript
/**
 * Test Sentry integration across all components
 *
 * Run with: bun scripts/test-sentry.ts
 */

import { invoke } from '@tauri-apps/api/core';

async function testFrontendError(): Promise<void> {
  console.log('Testing frontend error...');

  // This will be caught by the error boundary
  throw new Error('Test Frontend Error from test-sentry script');
}

async function testBackendError(): Promise<void> {
  console.log('Testing backend error...');

  // Invoke a command that we know will fail
  try {
    await invoke('test_sentry_error');
  } catch (e) {
    console.log('Backend error captured:', e);
  }
}

async function testBridgeError(): Promise<void> {
  console.log('Testing bridge error...');

  // Send a message that will cause the bridge to error
  // This depends on your IPC implementation
}

async function main(): Promise<void> {
  console.log('Starting Sentry integration tests...');
  console.log('Check your Sentry dashboard for errors tagged with:');
  console.log('  - app: agent');
  console.log('  - app: canvas');
  console.log('  - app: tauri');
  console.log('  - app: bridge');

  // Uncomment to test each component
  // await testFrontendError();
  // await testBackendError();
  // await testBridgeError();
}

main();
```

#### Step 2: Add Test Command to Rust Backend

Add to `src-tauri/src/commands/common/mod.rs`:

```rust
#[tauri::command]
pub async fn test_sentry_error() -> Result<(), String> {
    Err("Test Sentry Error from Rust backend".to_string())
}
```

Register in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    commands::common::test_sentry_error,
])
```

#### Step 3: Verification Checklist

Run through each verification:

**Frontend (apps/agent)**

- [ ] Open dev tools console
- [ ] Add temporary: `throw new Error('Test Agent Sentry')` in a component
- [ ] Check Sentry dashboard for error with `app: agent`
- [ ] Verify stack trace shows TypeScript source (not compiled JS)
- [ ] Remove test error

**Canvas (apps/Canvas-UI-Builder)**

- [ ] Switch to Canvas mode
- [ ] Add temporary error in a Canvas component
- [ ] Check Sentry for error with `app: canvas`
- [ ] Remove test error

**Backend (src-tauri)**

- [ ] Call `test_sentry_error` from frontend
- [ ] Check Sentry for error with `app: tauri`
- [ ] Verify Rust stack trace is included

**Bridge (agent-bridge)**

- [ ] Send a malformed message to trigger error
- [ ] Check Sentry for error with `app: bridge`
- [ ] Verify conversation context is included

**Source Maps**

- [ ] Trigger a frontend error in production build
- [ ] Check Sentry stack trace shows `.ts` files, not `.js`

**Notifications**

- [ ] Configure alert in Sentry (Settings → Alerts)
- [ ] Trigger error
- [ ] Receive notification (Slack/email)

#### Verification

- [ ] All 4 app tags appear in Sentry
- [ ] Stack traces are readable
- [ ] Breadcrumbs provide context
- [ ] Alerts are working
- [ ] No test errors remain in codebase

#### Output

- Sentry fully verified across all components
- Test utilities created for future verification
- Alert rules configured

---

## Phase 2: Testing Infrastructure Setup

**Goal**: Establish testing frameworks and utilities for all test types.

**Estimated Time**: 1-2 days

---

### Task 2.1: Vitest Setup for apps/agent

**Type**: Configuration and setup
**Time**: 2-3 hours
**Dependencies**: None

#### Context

The `apps/agent` directory contains the main React frontend. We need to set up Vitest for:

- Unit testing React components
- Testing Zustand stores
- Testing utility functions
- Testing hooks

Currently the project uses:

- React 19
- TypeScript
- Vite
- Zustand for state
- No existing test setup

#### Files to Create/Modify

```
apps/agent/
├── vitest.config.ts               # NEW: Vitest configuration
├── vitest.setup.ts                # NEW: Test setup and global mocks
├── package.json                   # MODIFY: Add test dependencies and scripts
├── tsconfig.json                  # MODIFY: Include test types
└── src/
    └── test/
        ├── mocks/
        │   ├── tauri.ts           # NEW: Mock Tauri API
        │   ├── stores.ts          # NEW: Store test utilities
        │   └── components.tsx     # NEW: Component test utilities
        └── utils.ts               # NEW: Test helper functions
```

#### Step 1: Install Dependencies

Add to `apps/agent/package.json`:

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^24.0.0",
    "msw": "^2.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

Run: `bun install` from project root.

#### Step 2: Create Vitest Configuration

Create file: `apps/agent/vitest.config.ts`

```typescript
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  test: {
    // Use jsdom for DOM testing
    environment: 'jsdom',

    // Setup file runs before each test file
    setupFiles: ['./vitest.setup.ts'],

    // Global test APIs (describe, it, expect)
    globals: true,

    // Include test files
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Exclude
    exclude: ['node_modules', 'dist', '.git'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/index.ts'],
      thresholds: {
        // These will be increased as we add tests
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
    },

    // Timeout for async tests
    testTimeout: 10000,

    // Reporter
    reporters: ['verbose'],

    // Mock modules that don't work in jsdom
    alias: {
      '@tauri-apps/api': './src/test/mocks/tauri.ts',
    },
  },
});
```

#### Step 3: Create Test Setup File

Create file: `apps/agent/vitest.setup.ts`

```typescript
/**
 * Vitest Setup File
 *
 * This runs before each test file.
 * Use it to set up global mocks and configurations.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia (used by many UI libraries)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock ResizeObserver
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Mock IntersectionObserver
beforeAll(() => {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Suppress console errors during tests (optional, remove if you want to see them)
// beforeAll(() => {
//   vi.spyOn(console, 'error').mockImplementation(() => {});
// });
```

#### Step 4: Create Tauri Mock

Create file: `apps/agent/src/test/mocks/tauri.ts`

````typescript
/**
 * Mock Tauri API for testing
 *
 * This replaces @tauri-apps/api in tests so we don't need the actual Tauri runtime.
 */

import { vi } from 'vitest';

// Store mock responses for invoke calls
const invokeResponses = new Map<string, unknown>();

/**
 * Set a mock response for a Tauri command
 *
 * Usage:
 * ```
 * mockInvokeResponse('read_file', { content: 'file content' });
 * ```
 */
export function mockInvokeResponse(command: string, response: unknown): void {
  invokeResponses.set(command, response);
}

/**
 * Clear all mock responses
 */
export function clearInvokeResponses(): void {
  invokeResponses.clear();
}

/**
 * Mock invoke function
 */
export const invoke = vi.fn().mockImplementation(async (command: string, args?: unknown) => {
  if (invokeResponses.has(command)) {
    const response = invokeResponses.get(command);
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }

  // Default responses for common commands
  switch (command) {
    case 'read_file':
      return { content: '' };
    case 'write_file':
      return { success: true };
    case 'list_directory':
      return { entries: [] };
    case 'git_status':
      return { branch: 'main', files: [], isRepo: true };
    default:
      console.warn(`[Mock Tauri] No mock for command: ${command}`, args);
      return null;
  }
});

// Mock event listener
export const listen = vi
  .fn()
  .mockImplementation(async (event: string, handler: (payload: unknown) => void) => {
    // Return an unlisten function
    return () => {};
  });

// Mock emit
export const emit = vi.fn();

// Core module exports
export const core = {
  invoke,
};

// Event module exports
export const event = {
  listen,
  emit,
};

// Window module exports
export const window = {
  getCurrentWindow: vi.fn().mockReturnValue({
    label: 'main',
    title: vi.fn(),
    setTitle: vi.fn(),
  }),
};

// Path module exports
export const path = {
  homeDir: vi.fn().mockResolvedValue('/Users/test'),
  join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
  basename: vi.fn().mockImplementation((path: string) => path.split('/').pop()),
  dirname: vi.fn().mockImplementation((path: string) => path.split('/').slice(0, -1).join('/')),
};
````

#### Step 5: Create Store Test Utilities

Create file: `apps/agent/src/test/mocks/stores.ts`

````typescript
/**
 * Store Test Utilities
 *
 * Helpers for testing Zustand stores
 */

import type { StoreApi } from 'zustand';
import { act } from '@testing-library/react';

/**
 * Reset a Zustand store to its initial state
 *
 * Usage:
 * ```
 * beforeEach(() => {
 *   resetStore(useFileStore);
 * });
 * ```
 */
export function resetStore<T>(store: StoreApi<T>): void {
  const initialState = store.getInitialState();
  act(() => {
    store.setState(initialState, true);
  });
}

/**
 * Create a mock store state
 *
 * Usage:
 * ```
 * const mockState = createMockStoreState(useFileStore, {
 *   openFiles: [{ path: '/test.ts', content: 'test' }],
 * });
 * ```
 */
export function createMockStoreState<T>(store: StoreApi<T>, overrides: Partial<T>): T {
  return {
    ...store.getInitialState(),
    ...overrides,
  };
}

/**
 * Set store state within act()
 */
export function setStoreState<T>(store: StoreApi<T>, state: Partial<T>): void {
  act(() => {
    store.setState(state);
  });
}
````

#### Step 6: Create Component Test Utilities

Create file: `apps/agent/src/test/mocks/components.tsx`

````typescript
/**
 * Component Test Utilities
 *
 * Wrappers and helpers for testing React components
 */

import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@/providers/theme-provider';

/**
 * All providers needed by components
 */
function AllProviders({ children }: { children: ReactNode }): ReactElement {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="orbit-theme">
      {children}
    </ThemeProvider>
  );
}

/**
 * Custom render that includes all providers
 *
 * Usage:
 * ```
 * const { getByText } = renderWithProviders(<MyComponent />);
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): ReturnType<typeof render> {
  return render(ui, { wrapper: AllProviders, ...options });
}

/**
 * Re-export everything from testing-library
 */
export * from '@testing-library/react';
export { renderWithProviders as render };
````

#### Step 7: Create Test Utils

Create file: `apps/agent/src/test/utils.ts`

````typescript
/**
 * General Test Utilities
 */

import { vi } from 'vitest';

/**
 * Wait for a condition to be true
 *
 * Usage:
 * ```
 * await waitFor(() => someCondition === true);
 * ```
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Mock a module with automatic cleanup
 */
export function mockModule(modulePath: string, implementation: Record<string, unknown>): void {
  vi.mock(modulePath, () => implementation);
}

/**
 * Create a spy that tracks calls
 */
export function createCallTracker(): {
  fn: (...args: unknown[]) => void;
  calls: unknown[][];
  reset: () => void;
} {
  const calls: unknown[][] = [];

  return {
    fn: (...args: unknown[]) => {
      calls.push(args);
    },
    calls,
    reset: () => {
      calls.length = 0;
    },
  };
}
````

#### Step 8: Update tsconfig.json

Add Vitest types to `apps/agent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vitest.config.ts", "vitest.setup.ts"]
}
```

#### Step 9: Create Example Test

Create file: `apps/agent/src/lib/__tests__/utils.test.ts`

```typescript
/**
 * Example test file to verify Vitest setup
 */

import { describe, expect, it } from 'vitest';

// Import a utility function to test
// import { someFunction } from '../utils';

describe('Vitest Setup Verification', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to jsdom', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
  });

  it('should have jest-dom matchers', () => {
    const element = document.createElement('div');
    element.textContent = 'Hello';
    document.body.appendChild(element);

    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('Hello');

    document.body.removeChild(element);
  });
});
```

#### Verification

- [ ] `cd apps/agent && bun run test` runs without errors
- [ ] Example test passes
- [ ] `bun run test:coverage` generates coverage report
- [ ] Tauri mock prevents actual IPC calls
- [ ] jsdom provides DOM APIs

#### Output

- Vitest configured for apps/agent
- Test utilities and mocks created
- Example test demonstrating setup works
- Coverage reporting enabled

---

### Task 2.2: Vitest Setup for apps/Canvas-UI-Builder

**Type**: Configuration and setup
**Time**: 1 hour
**Dependencies**: Task 2.1 completed (can copy patterns)

#### Context

Set up Vitest for the Canvas UI Builder app, following the same patterns as apps/agent.

#### Files to Create/Modify

```
apps/Canvas-UI-Builder/
├── vitest.config.ts               # NEW: Copy from agent, adjust paths
├── vitest.setup.ts                # NEW: Copy from agent
├── package.json                   # MODIFY: Add test scripts
└── src/
    └── test/
        ├── mocks/
        │   └── tauri.ts           # NEW: Copy from agent
        └── utils.ts               # NEW: Copy from agent
```

#### Steps

1. Copy `vitest.config.ts` from apps/agent, update any Canvas-specific paths
2. Copy `vitest.setup.ts` from apps/agent
3. Copy test mocks from apps/agent
4. Add test scripts to package.json:
   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```
5. Create an example test to verify setup

#### Verification

- [ ] `cd apps/Canvas-UI-Builder && bun run test` works
- [ ] Coverage reporting works

#### Output

- Vitest configured for Canvas UI Builder

---

### Task 2.3: Playwright Setup for E2E Tests

**Type**: Configuration and setup
**Time**: 2-3 hours
**Dependencies**: None (can run in parallel with Tasks 2.1-2.2)

#### Context

Playwright will be used for end-to-end testing of the full Tauri application. This requires:

- Playwright Test runner
- Custom helpers for Tauri app
- Configuration for CI

#### Files to Create

```
e2e/
├── playwright.config.ts           # NEW: Playwright configuration
├── global-setup.ts                # NEW: Setup before all tests
├── global-teardown.ts             # NEW: Cleanup after all tests
├── helpers/
│   ├── app.ts                     # NEW: App launch and control
│   ├── fixtures.ts                # NEW: Test fixtures
│   └── selectors.ts               # NEW: Common selectors
└── tests/
    └── smoke.spec.ts              # NEW: Basic smoke test
package.json                       # MODIFY: Add Playwright scripts
```

#### Step 1: Install Playwright

Add to root `package.json`:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.45.0"
  },
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

Run: `bun install && bunx playwright install`

#### Step 2: Create Playwright Configuration

Create file: `e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Orbit E2E tests
 *
 * Note: Testing Tauri apps requires special handling.
 * We use a custom fixture to launch the app.
 */
export default defineConfig({
  testDir: './tests',

  // Run tests in parallel
  fullyParallel: false, // Tauri apps can have issues with parallel execution

  // Fail build on CI if you accidentally left test.only in the code
  forbidOnly: !!process.env.CI,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Limit workers for Tauri stability
  workers: 1,

  // Reporter
  reporter: [['html', { open: 'never' }], ['list']],

  // Global setup and teardown
  globalSetup: require.resolve('./global-setup.ts'),
  globalTeardown: require.resolve('./global-teardown.ts'),

  // Shared settings for all projects
  use: {
    // Trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',
  },

  // Test timeout
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Projects for different scenarios
  projects: [
    {
      name: 'orbit-macos',
      use: {
        ...devices['Desktop Safari'],
      },
      // Tauri uses WebKit on macOS
    },
  ],
});
```

#### Step 3: Create Global Setup

Create file: `e2e/global-setup.ts`

```typescript
/**
 * Global Setup for Playwright Tests
 *
 * Runs once before all tests.
 * Used to build the app and prepare test environment.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup(): Promise<void> {
  console.log('🔧 Setting up E2E test environment...');

  // Check if we need to build the app
  const appPath = getAppPath();

  if (!fs.existsSync(appPath)) {
    console.log('📦 Building Tauri app for testing...');

    try {
      execSync('bunx tauri build --debug', {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Failed to build Tauri app:', error);
      throw error;
    }
  }

  // Create test data directory
  const testDataDir = path.join(process.cwd(), 'e2e', '.test-data');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  // Create a test git repository
  const testRepoDir = path.join(testDataDir, 'test-repo');
  if (!fs.existsSync(testRepoDir)) {
    fs.mkdirSync(testRepoDir, { recursive: true });
    execSync('git init', { cwd: testRepoDir });
    fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test Repository\n');
    execSync('git add . && git commit -m "Initial commit"', { cwd: testRepoDir });
  }

  console.log('✅ E2E setup complete');
}

function getAppPath(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return path.join(process.cwd(), 'src-tauri', 'target', 'debug', 'bundle', 'macos', 'Orbit.app');
  } else if (platform === 'win32') {
    return path.join(process.cwd(), 'src-tauri', 'target', 'debug', 'Orbit.exe');
  } else {
    return path.join(process.cwd(), 'src-tauri', 'target', 'debug', 'orbit');
  }
}

export default globalSetup;
```

#### Step 4: Create Global Teardown

Create file: `e2e/global-teardown.ts`

```typescript
/**
 * Global Teardown for Playwright Tests
 *
 * Runs once after all tests.
 * Used to clean up test environment.
 */

import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up E2E test environment...');

  // Clean up test data (optional - comment out to preserve for debugging)
  // const testDataDir = path.join(process.cwd(), 'e2e', '.test-data');
  // if (fs.existsSync(testDataDir)) {
  //   fs.rmSync(testDataDir, { recursive: true, force: true });
  // }

  console.log('✅ E2E teardown complete');
}

export default globalTeardown;
```

#### Step 5: Create App Helper

Create file: `e2e/helpers/app.ts`

```typescript
/**
 * Tauri App Helper
 *
 * Utilities for launching and controlling the Tauri app in tests.
 */

import type { Page } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

let appProcess: ChildProcess | null = null;

/**
 * Launch the Orbit Tauri app
 */
export async function launchApp(): Promise<{ pid: number }> {
  const appPath = getAppPath();

  console.log(`Launching app: ${appPath}`);

  appProcess = spawn(appPath, [], {
    stdio: 'pipe',
    env: {
      ...process.env,
      ORBIT_TEST_MODE: 'true',
    },
  });

  // Wait for app to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (!appProcess.pid) {
    throw new Error('Failed to launch app');
  }

  return { pid: appProcess.pid };
}

/**
 * Close the Orbit app
 */
export async function closeApp(): Promise<void> {
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
  }
}

/**
 * Get the path to the built app
 */
function getAppPath(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return path.join(
      process.cwd(),
      'src-tauri',
      'target',
      'debug',
      'bundle',
      'macos',
      'Orbit.app',
      'Contents',
      'MacOS',
      'Orbit'
    );
  } else if (platform === 'win32') {
    return path.join(process.cwd(), 'src-tauri', 'target', 'debug', 'Orbit.exe');
  } else {
    return path.join(process.cwd(), 'src-tauri', 'target', 'debug', 'orbit');
  }
}

/**
 * Open a folder in the app
 */
export async function openFolder(page: Page, folderPath: string): Promise<void> {
  // This will depend on how your app handles folder opening
  // For now, we'll use keyboard shortcuts or menu
  // Example: Cmd+O to open folder dialog
  // Then we'd need to interact with the native dialog
  // This is tricky with Tauri - might need app-side test hooks
}

/**
 * Wait for the app to be ready
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for a known element that indicates the app is loaded
  await page.waitForSelector('[data-testid="app-ready"]', {
    timeout: 30000,
  });
}
```

#### Step 6: Create Test Fixtures

Create file: `e2e/helpers/fixtures.ts`

```typescript
/**
 * Playwright Test Fixtures
 *
 * Custom fixtures for Orbit E2E tests.
 */

import { test as base, type Page } from '@playwright/test';
import { closeApp, launchApp, waitForAppReady } from './app';

// Extend base test with custom fixtures
export const test = base.extend<{
  orbitApp: { page: Page };
}>({
  orbitApp: async ({ page }, use) => {
    // Setup: Launch app
    await launchApp();

    // Wait for app to be ready
    // Note: This assumes you're connecting to the app's webview somehow
    // Tauri E2E testing can be complex - see tauri-driver or WebDriver approach

    // Use the fixture
    await use({ page });

    // Teardown: Close app
    await closeApp();
  },
});

export { expect } from '@playwright/test';
```

#### Step 7: Create Common Selectors

Create file: `e2e/helpers/selectors.ts`

```typescript
/**
 * Common Selectors for E2E Tests
 *
 * Centralized selectors to make tests more maintainable.
 * Use data-testid attributes in components for reliable selection.
 */

export const selectors = {
  // Activity Bar
  activityBar: '[data-testid="activity-bar"]',
  activityExplorer: '[data-testid="activity-explorer"]',
  activitySourceControl: '[data-testid="activity-source-control"]',
  activitySearch: '[data-testid="activity-search"]',
  activitySettings: '[data-testid="activity-settings"]',

  // Sidebar
  sidebar: '[data-testid="sidebar"]',
  fileTree: '[data-testid="file-tree"]',
  fileItem: '[data-testid="file-item"]',

  // Editor
  editor: '[data-testid="editor"]',
  editorTab: '[data-testid="editor-tab"]',
  editorContent: '[data-testid="editor-content"]',

  // Chat
  chatPanel: '[data-testid="chat-panel"]',
  chatInput: '[data-testid="chat-input"]',
  chatMessage: '[data-testid="chat-message"]',
  chatSendButton: '[data-testid="chat-send"]',

  // Terminal
  terminal: '[data-testid="terminal"]',
  terminalInput: '[data-testid="terminal-input"]',

  // Source Control
  sourceControlPanel: '[data-testid="source-control-panel"]',
  branchName: '[data-testid="branch-name"]',
  changedFiles: '[data-testid="changed-files"]',
  commitInput: '[data-testid="commit-message"]',
  commitButton: '[data-testid="commit-button"]',

  // Dialogs
  dialog: '[data-testid="dialog"]',
  dialogConfirm: '[data-testid="dialog-confirm"]',
  dialogCancel: '[data-testid="dialog-cancel"]',

  // App Status
  appReady: '[data-testid="app-ready"]',
  loadingSpinner: '[data-testid="loading"]',
};

/**
 * Get a file item by path
 */
export function fileItemByPath(path: string): string {
  return `[data-testid="file-item"][data-path="${path}"]`;
}

/**
 * Get an editor tab by filename
 */
export function editorTabByName(name: string): string {
  return `[data-testid="editor-tab"][data-filename="${name}"]`;
}
```

#### Step 8: Create Smoke Test

Create file: `e2e/tests/smoke.spec.ts`

```typescript
/**
 * Smoke Tests
 *
 * Basic tests to verify the app launches and core functionality works.
 */

import { expect, test } from '@playwright/test';
import { selectors } from '../helpers/selectors';

test.describe('Smoke Tests', () => {
  test.skip('app should launch', async ({ page }) => {
    // Skip for now - Tauri E2E setup is complex
    // This is a placeholder to verify Playwright is configured
    // When properly set up:
    // await launchApp();
    // await page.waitForSelector(selectors.appReady);
    // expect(await page.isVisible(selectors.activityBar)).toBe(true);
  });

  test('playwright is configured correctly', async ({ page }) => {
    // Simple test to verify Playwright works
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
  });
});
```

#### Step 9: Add data-testid Attributes

**IMPORTANT**: For E2E tests to work reliably, components need `data-testid` attributes.

Add a task to add these attributes to key components:

```tsx
// Example: apps/agent/src/components/layout/activity-bar.tsx
<div data-testid="activity-bar" className="...">
  <button data-testid="activity-explorer" onClick={...}>
    <ExplorerIcon />
  </button>
  <button data-testid="activity-source-control" onClick={...}>
    <GitIcon />
  </button>
</div>
```

This should be done as a separate task (Task 5.0) before E2E tests can run properly.

#### Verification

- [ ] `bun run test:e2e` runs without configuration errors
- [ ] Playwright UI opens with `bun run test:e2e:ui`
- [ ] Simple web test passes
- [ ] Test data directory is created

#### Output

- Playwright configured for E2E testing
- Helper utilities created
- Selector constants defined
- Smoke test template ready

---

### Task 2.4: Test Utilities - Shared Mocks and Helpers

**Type**: Code implementation
**Time**: 1-2 hours
**Dependencies**: Tasks 2.1-2.3 completed

#### Context

Create shared test utilities that can be used across unit, integration, and E2E tests.

#### Files to Create

```
packages/test-utils/                # NEW: Shared test utilities package
├── package.json
├── src/
│   ├── index.ts                   # Exports all utilities
│   ├── fixtures/
│   │   ├── files.ts               # Test file fixtures
│   │   ├── git.ts                 # Test git repo fixtures
│   │   └── conversations.ts       # Test conversation fixtures
│   ├── factories/
│   │   ├── message.ts             # Create test messages
│   │   ├── file.ts                # Create test files
│   │   └── user.ts                # Create test users
│   └── helpers/
│       ├── async.ts               # Async test helpers
│       └── dom.ts                 # DOM test helpers
└── tsconfig.json
```

#### Step 1: Create Package

Create `packages/test-utils/package.json`:

```json
{
  "name": "@orbit/test-utils",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./fixtures": "./src/fixtures/index.ts",
    "./factories": "./src/factories/index.ts",
    "./helpers": "./src/helpers/index.ts"
  },
  "dependencies": {},
  "peerDependencies": {
    "vitest": "^2.0.0"
  }
}
```

#### Step 2: Create Test Fixtures

These provide consistent test data:

```typescript
// packages/test-utils/src/fixtures/files.ts

export const testFiles = {
  typescript: {
    path: '/test/example.ts',
    content: `export function hello(): string {
  return 'Hello, World!';
}`,
    language: 'typescript',
  },

  json: {
    path: '/test/config.json',
    content: JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
    language: 'json',
  },

  markdown: {
    path: '/test/README.md',
    content: '# Test Project\n\nThis is a test project.',
    language: 'markdown',
  },

  large: {
    path: '/test/large-file.ts',
    content: Array(1000).fill('// Line of code\n').join(''),
    language: 'typescript',
  },
};
```

```typescript
// packages/test-utils/src/fixtures/git.ts

export const gitFixtures = {
  status: {
    clean: {
      branch: 'main',
      files: [],
      ahead: 0,
      behind: 0,
      isRepo: true,
    },

    withChanges: {
      branch: 'feature/test',
      files: [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/new-file.ts', status: 'untracked' },
        { path: 'deleted.ts', status: 'deleted' },
      ],
      ahead: 2,
      behind: 0,
      isRepo: true,
    },

    notARepo: {
      branch: null,
      files: [],
      ahead: 0,
      behind: 0,
      isRepo: false,
    },
  },
};
```

#### Step 3: Create Factories

Factories create customizable test data:

```typescript
// packages/test-utils/src/factories/message.ts

import type { Message } from '@/types/protocol';

let messageIdCounter = 0;

export function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${++messageIdCounter}`,
    role: 'user',
    content: 'Test message content',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return createMessage({
    role: 'assistant',
    content: 'Assistant response',
    ...overrides,
  });
}

export function createConversation(messageCount: number = 3): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < messageCount; i++) {
    messages.push(
      createMessage({ content: `User message ${i + 1}` }),
      createAssistantMessage({ content: `Assistant response ${i + 1}` })
    );
  }

  return messages;
}
```

#### Step 4: Create Async Helpers

```typescript
// packages/test-utils/src/helpers/async.ts

/**
 * Wait for a specific duration
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await delay(interval);
  }
}

/**
 * Retry an async operation
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; delay?: number } = {}
): Promise<T> {
  const { attempts = 3, delay: delayMs = 100 } = options;

  let lastError: Error | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < attempts - 1) {
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}
```

#### Step 5: Create Index Exports

```typescript
// packages/test-utils/src/index.ts

export * from './fixtures';
export * from './factories';
export * from './helpers';
```

#### Step 6: Add to Workspace

Update root `package.json` workspaces:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

#### Verification

- [ ] Package builds without errors
- [ ] Can import from `@orbit/test-utils` in apps/agent
- [ ] Fixtures and factories work correctly

#### Output

- Shared test utilities package created
- Consistent test data across all test types

---

### Task 2.5: CI Integration for Tests

**Type**: CI/CD configuration
**Time**: 1 hour
**Dependencies**: Tasks 2.1-2.4 completed

#### Context

Update the CI pipeline to run all test types automatically.

#### Files to Modify

```
.github/workflows/ci.yml           # MODIFY: Add test jobs
```

#### Step 1: Update CI Workflow

Add test jobs to `.github/workflows/ci.yml`:

```yaml
jobs:
  # ... existing jobs ...

  test-agent:
    name: Test - Agent App
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: cd apps/agent && bun run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: apps/agent/coverage/coverage-final.json
          flags: agent

  test-canvas:
    name: Test - Canvas App
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: cd apps/Canvas-UI-Builder && bun run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: apps/Canvas-UI-Builder/coverage/coverage-final.json
          flags: canvas

  test-e2e:
    name: Test - E2E (Playwright)
    runs-on: macos-latest # macOS for Tauri
    needs: [build-agent, build-canvas]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps webkit

      - name: Build Tauri app (debug)
        run: bunx tauri build --debug

      - name: Run E2E tests
        run: bun run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

#### Step 2: Add Coverage Badge (Optional)

Add to README.md:

```markdown
[![codecov](https://codecov.io/gh/YOUR_ORG/orbit/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_ORG/orbit)
```

#### Verification

- [ ] CI runs test jobs
- [ ] Coverage reports upload
- [ ] E2E tests run on macOS runner

#### Output

- Tests integrated into CI pipeline
- Coverage tracking enabled

---

## Phase 3: Unit Tests

**Goal**: Achieve 80%+ coverage on stores, utilities, and components.

**Estimated Time**: 3-5 days

---

### Task 3.1: Unit Tests - Zustand Stores (git-store)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Task 2.1 completed

#### Context

The `apps/agent/src/stores/git-store.ts` manages Git state. We need comprehensive unit tests for:

- State initialization
- All actions
- Error handling
- Edge cases

#### Files to Create

```
apps/agent/src/stores/__tests__/
└── git-store.test.ts              # NEW: Git store tests
```

#### Step 1: Analyze the Store

First, read the store file to understand:

- Initial state shape
- All actions/methods
- Dependencies (what external functions it calls)
- Edge cases to test

#### Step 2: Create Test File

Create `apps/agent/src/stores/__tests__/git-store.test.ts`:

```typescript
/**
 * Git Store Unit Tests
 *
 * Tests for apps/agent/src/stores/git-store.ts
 */

import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitStore } from '../git-store';
import { mockInvokeResponse, clearInvokeResponses } from '@/test/mocks/tauri';

// Mock the backend module
vi.mock('@/lib/backend', () => ({
  getGitStatus: vi.fn(),
  gitStage: vi.fn(),
  gitUnstage: vi.fn(),
  gitCommit: vi.fn(),
  gitPush: vi.fn(),
  gitPull: vi.fn(),
  gitCheckout: vi.fn(),
}));

import * as backend from '@/lib/backend';

describe('git-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    act(() => {
      useGitStore.setState(useGitStore.getInitialState());
    });

    // Clear all mocks
    vi.clearAllMocks();
    clearInvokeResponses();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useGitStore.getState();

      expect(state.branch).toBeNull();
      expect(state.files).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isRepo).toBe(false);
    });
  });

  describe('fetchStatus', () => {
    it('should fetch git status successfully', async () => {
      const mockStatus = {
        branch: 'main',
        files: [{ path: 'src/index.ts', status: 'modified' }],
        ahead: 1,
        behind: 0,
        isRepo: true,
      };

      vi.mocked(backend.getGitStatus).mockResolvedValue(mockStatus);

      await act(async () => {
        await useGitStore.getState().fetchStatus('/test/repo');
      });

      const state = useGitStore.getState();
      expect(state.branch).toBe('main');
      expect(state.files).toHaveLength(1);
      expect(state.isRepo).toBe(true);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle non-git directory', async () => {
      vi.mocked(backend.getGitStatus).mockResolvedValue({
        branch: null,
        files: [],
        ahead: 0,
        behind: 0,
        isRepo: false,
      });

      await act(async () => {
        await useGitStore.getState().fetchStatus('/not/a/repo');
      });

      const state = useGitStore.getState();
      expect(state.isRepo).toBe(false);
      expect(state.branch).toBeNull();
    });

    it('should handle fetch errors', async () => {
      vi.mocked(backend.getGitStatus).mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await useGitStore.getState().fetchStatus('/test/repo');
      });

      const state = useGitStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.loading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(backend.getGitStatus).mockReturnValue(promise as Promise<any>);

      // Start fetch
      const fetchPromise = act(async () => {
        useGitStore.getState().fetchStatus('/test/repo');
      });

      // Check loading state
      expect(useGitStore.getState().loading).toBe(true);

      // Resolve and complete
      resolvePromise!({ branch: 'main', files: [], isRepo: true });
      await fetchPromise;

      expect(useGitStore.getState().loading).toBe(false);
    });
  });

  describe('stage', () => {
    it('should stage a file successfully', async () => {
      vi.mocked(backend.gitStage).mockResolvedValue({ success: true });

      await act(async () => {
        await useGitStore.getState().stage('/test/repo', 'src/index.ts');
      });

      expect(backend.gitStage).toHaveBeenCalledWith('/test/repo', 'src/index.ts');
    });

    it('should handle stage errors', async () => {
      vi.mocked(backend.gitStage).mockRejectedValue(new Error('Failed to stage'));

      await act(async () => {
        await useGitStore.getState().stage('/test/repo', 'src/index.ts');
      });

      expect(useGitStore.getState().error).toBe('Failed to stage');
    });
  });

  describe('commit', () => {
    it('should commit with message successfully', async () => {
      vi.mocked(backend.gitCommit).mockResolvedValue({ success: true, hash: 'abc123' });

      await act(async () => {
        await useGitStore.getState().commit('/test/repo', 'Initial commit');
      });

      expect(backend.gitCommit).toHaveBeenCalledWith('/test/repo', 'Initial commit');
    });

    it('should reject empty commit message', async () => {
      await act(async () => {
        await useGitStore.getState().commit('/test/repo', '');
      });

      expect(backend.gitCommit).not.toHaveBeenCalled();
      expect(useGitStore.getState().error).toContain('empty');
    });

    it('should handle commit errors', async () => {
      vi.mocked(backend.gitCommit).mockRejectedValue(new Error('Nothing to commit'));

      await act(async () => {
        await useGitStore.getState().commit('/test/repo', 'Test commit');
      });

      expect(useGitStore.getState().error).toBe('Nothing to commit');
    });
  });

  describe('checkout', () => {
    it('should checkout branch successfully', async () => {
      vi.mocked(backend.gitCheckout).mockResolvedValue({ success: true });

      await act(async () => {
        await useGitStore.getState().checkout('/test/repo', 'feature/test');
      });

      expect(backend.gitCheckout).toHaveBeenCalledWith('/test/repo', 'feature/test');
    });
  });

  describe('reset', () => {
    it('should reset store to initial state', () => {
      // Set some state
      act(() => {
        useGitStore.setState({
          branch: 'main',
          files: [{ path: 'test.ts', status: 'modified' }],
          error: 'Some error',
        });
      });

      // Reset
      act(() => {
        useGitStore.getState().reset();
      });

      // Verify reset
      const state = useGitStore.getState();
      expect(state.branch).toBeNull();
      expect(state.files).toEqual([]);
      expect(state.error).toBeNull();
    });
  });
});
```

#### Step 3: Run Tests

```bash
cd apps/agent && bun run test git-store
```

#### Verification

- [ ] All tests pass
- [ ] Coverage > 80% for git-store.ts
- [ ] Edge cases covered (errors, empty states, loading)
- [ ] No mocked implementation details leak

#### Output

- Comprehensive unit tests for git-store
- All actions tested
- Error handling verified

---

### Task 3.2: Unit Tests - Zustand Stores (file-store)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Task 2.1 completed

#### Context

Test the file-store following the same pattern as Task 3.1.

Test coverage should include:

- Opening/closing files
- Reading/writing files
- Modified state tracking
- Tab management
- Error handling

#### Files to Create

```
apps/agent/src/stores/__tests__/
└── file-store.test.ts             # NEW
```

#### Pattern

Follow the same testing pattern as Task 3.1, but for file-store functionality.

---

### Task 3.3: Unit Tests - Zustand Stores (ui-store)

**Type**: Test implementation
**Time**: 1-2 hours
**Dependencies**: Task 2.1 completed

#### Context

Test the ui-store for panel management, layout, and UI state.

---

### Task 3.4: Unit Tests - Zustand Stores (terminal-store)

**Type**: Test implementation
**Time**: 1-2 hours
**Dependencies**: Task 2.1 completed

#### Context

Test the terminal-store for terminal session management.

---

### Task 3.5: Unit Tests - Zustand Stores (All Remaining)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Task 2.1 completed

#### Context

Test all remaining stores:

- tool-store
- browser-store
- checkpoint-store
- queued-message-store
- onboarding-store
- provider-store

---

### Task 3.6: Unit Tests - Utility Functions

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Task 2.1 completed

#### Context

Test utility functions in `apps/agent/src/lib/`:

- logger.ts
- backend.ts (mock Tauri, test type handling)
- Any other utility files

---

### Task 3.7: Unit Tests - React Components (Shared)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Task 2.1 completed

#### Context

Test shared components in `apps/agent/src/components/shared/`:

- ErrorBoundary
- Loading indicators
- Common UI elements

---

### Task 3.8: Unit Tests - React Components (Chat)

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: Task 2.1 completed

#### Context

Test chat components:

- MessageItem
- MessageList
- ChatInput
- Tool rendering components

---

### Task 3.9: Unit Tests - Rust Crates

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: None (Rust tests are independent)

#### Context

Add unit tests to Rust crates in `crates/common/`:

- fs (file operations)
- git (git operations)
- terminal (PTY operations)
- core (types and utilities)

#### Files to Modify

Each crate should have tests in a `tests` module or `tests/` directory.

Example for `crates/common/fs/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_read_file() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "Hello, World!").unwrap();

        let content = read_file(file_path.to_str().unwrap()).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_read_nonexistent_file() {
        let result = read_file("/nonexistent/path/file.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_file() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("output.txt");

        write_file(file_path.to_str().unwrap(), "Test content").unwrap();

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Test content");
    }
}
```

Run with: `cargo test --all`

---

## Phase 4: Integration Tests

**Goal**: Test boundaries between systems (Frontend ↔ Tauri ↔ Rust).

**Estimated Time**: 2-3 days

---

### Task 4.1: Integration Tests - Tauri Commands (File Operations)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Tasks 2.1, 2.4 completed

#### Context

Test that Tauri commands work correctly when invoked from the frontend.
These tests should:

- Call actual Tauri invoke
- Test serialization/deserialization
- Verify error handling across IPC boundary

Note: These tests require the Tauri app to be running or use tauri-test utilities.

#### Files to Create

```
apps/agent/src/__tests__/integration/
└── file-commands.integration.test.ts
```

#### Example

```typescript
/**
 * File Commands Integration Tests
 *
 * Tests the full path: Frontend → Tauri IPC → Rust → Response
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Note: These tests require special setup to run with Tauri
// Skip in CI unless Tauri test environment is configured
const isCI = process.env.CI === 'true';

describe.skipIf(isCI)('File Commands Integration', () => {
  const testDir = '/tmp/orbit-integration-tests';

  beforeAll(async () => {
    // Create test directory
    await invoke('create_directory', { path: testDir });
  });

  afterAll(async () => {
    // Cleanup
    await invoke('delete_directory', { path: testDir, recursive: true });
  });

  it('should read and write files through Tauri', async () => {
    const filePath = `${testDir}/test-file.txt`;
    const content = 'Hello from integration test';

    // Write file
    await invoke('write_file', { path: filePath, content });

    // Read file
    const result = await invoke<{ content: string }>('read_file', { path: filePath });

    expect(result.content).toBe(content);
  });

  it('should handle file not found error', async () => {
    await expect(invoke('read_file', { path: '/nonexistent/file.txt' })).rejects.toThrow();
  });
});
```

---

### Task 4.2: Integration Tests - Tauri Commands (Git Operations)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Tasks 2.1, 2.4 completed

#### Context

Test Git commands across the IPC boundary.

---

### Task 4.3: Integration Tests - Tauri Commands (Terminal)

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Tasks 2.1, 2.4 completed

#### Context

Test terminal creation and I/O through Tauri.

---

### Task 4.4: Integration Tests - Agent Bridge (Claude SDK)

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: Agent-bridge test setup

#### Context

Test the agent-bridge integration with Claude SDK.

Note: These tests already exist in `agent-bridge/src/__tests__/`. This task is about:

- Reviewing existing tests
- Adding missing test cases
- Ensuring error paths are covered

---

### Task 4.5: Integration Tests - Store ↔ Backend Flow

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Tasks 2.1, 2.4 completed

#### Context

Test the complete flow from store action → backend call → state update.

---

## Phase 5: Playwright E2E Tests

**Goal**: Test complete user journeys through the application.

**Estimated Time**: 3-4 days

---

### Task 5.0: Add data-testid Attributes to Components

**Type**: Code modification
**Time**: 2-3 hours
**Dependencies**: None

#### Context

Before E2E tests can work reliably, we need to add `data-testid` attributes to key components.

#### Files to Modify

Add `data-testid` attributes to these components:

- `apps/agent/src/components/layout/activity-bar.tsx`
- `apps/agent/src/components/layout/sidebar.tsx`
- `apps/agent/src/components/chat/chat-input.tsx`
- `apps/agent/src/components/chat/message-list.tsx`
- `apps/agent/src/components/files/file-explorer.tsx`
- `apps/agent/src/components/editor/CodeMirrorEditor.tsx`
- `apps/agent/src/components/terminal/terminal.tsx`
- `apps/agent/src/components/activity/source-control.tsx`

#### Pattern

```tsx
// Before
<div className="activity-bar">
  <button onClick={handleExplorer}>
    <ExplorerIcon />
  </button>
</div>

// After
<div className="activity-bar" data-testid="activity-bar">
  <button onClick={handleExplorer} data-testid="activity-explorer">
    <ExplorerIcon />
  </button>
</div>
```

Use the selectors defined in `e2e/helpers/selectors.ts` as reference.

---

### Task 5.1: E2E Tests - Chat Flow

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: Tasks 2.3, 5.0 completed

#### Context

Test the complete chat experience:

- Sending a message
- Receiving streaming response
- Tool execution display
- Error handling

#### Files to Create

```
e2e/tests/
└── chat.spec.ts
```

---

### Task 5.2: E2E Tests - File Operations

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: Tasks 2.3, 5.0 completed

#### Context

Test file operations:

- Opening a file
- Editing content
- Saving (Cmd+S)
- Creating new files
- Deleting files

---

### Task 5.3: E2E Tests - Terminal

**Type**: Test implementation
**Time**: 2-3 hours
**Dependencies**: Tasks 2.3, 5.0 completed

#### Context

Test terminal functionality:

- Opening terminal
- Typing commands
- Viewing output
- Multiple terminals

---

### Task 5.4: E2E Tests - Git/Source Control

**Type**: Test implementation
**Time**: 3-4 hours
**Dependencies**: Tasks 2.3, 5.0 completed

#### Context

Test Git operations:

- Viewing status
- Staging files
- Committing
- Branch switching

---

### Task 5.5: E2E Tests - Settings

**Type**: Test implementation
**Time**: 1-2 hours
**Dependencies**: Tasks 2.3, 5.0 completed

#### Context

Test settings:

- Opening settings panel
- Changing settings
- Settings persistence

---

## Phase 6: Error Handling & Fallbacks

**Goal**: Graceful degradation for every feature.

**Estimated Time**: 2-3 days

---

### Task 6.1: Fallback Audit

**Type**: Analysis and documentation
**Time**: 2-3 hours
**Dependencies**: None

#### Context

Audit every major feature and document:

- What can fail
- Current behavior on failure
- Desired fallback behavior

#### Output

Create `docs/FALLBACK-AUDIT.md` documenting all failure modes and fallback strategies.

---

### Task 6.2: Implement Retry Logic

**Type**: Code implementation
**Time**: 3-4 hours
**Dependencies**: Task 6.1 completed

#### Context

Add exponential backoff retry logic to:

- Claude API calls (agent-bridge)
- File system operations
- Git operations
- Network requests

#### Pattern

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Retry failed');
}
```

---

### Task 6.3: Health Check System

**Type**: Code implementation
**Time**: 3-4 hours
**Dependencies**: None

#### Context

Create a startup health check system that:

- Checks disk space
- Verifies shell access
- Tests network connectivity
- Validates configuration
- Reports issues to user

---

### Task 6.4: Error Recovery UI

**Type**: Code implementation
**Time**: 2-3 hours
**Dependencies**: None

#### Context

Improve error UI throughout the app:

- User-friendly error messages
- Retry buttons where appropriate
- Clear instructions for resolution

---

## Phase 7: Custom Telemetry Dashboard

**Goal**: Build your own dashboard to view errors and metrics.

**Estimated Time**: 3-4 days

---

### Task 7.1: Dashboard Project Setup

**Type**: Project creation
**Time**: 2-3 hours
**Dependencies**: None

#### Context

Create a new web project for the telemetry dashboard.

#### Files to Create

```
dashboard/
├── package.json
├── tsconfig.json
├── next.config.js
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/
│       └── webhook/
│           └── route.ts
├── components/
│   ├── error-feed.tsx
│   ├── charts.tsx
│   └── notifications.tsx
└── lib/
    ├── sentry.ts
    └── notifications.ts
```

---

### Task 7.2: Sentry API Integration

**Type**: Code implementation
**Time**: 3-4 hours
**Dependencies**: Task 7.1 completed

#### Context

Integrate with Sentry API to fetch:

- Error events
- Error counts
- Affected users
- Release information

---

### Task 7.3: Real-time Notifications

**Type**: Code implementation
**Time**: 2-3 hours
**Dependencies**: Task 7.2 completed

#### Context

Set up Sentry webhooks to receive real-time error notifications.

---

### Task 7.4: Dashboard UI

**Type**: Code implementation
**Time**: 3-4 hours
**Dependencies**: Tasks 7.2, 7.3 completed

#### Context

Build the dashboard UI with:

- Real-time error feed
- Error trend charts
- Affected users count
- Notification settings

---

## Phase 8: Feature Flags

**Goal**: Enable/disable features at runtime for safe rollout.

**Estimated Time**: 1-2 days

---

### Task 8.1: Feature Flag System

**Type**: Code implementation
**Time**: 3-4 hours
**Dependencies**: None

#### Context

Implement a simple feature flag system.

#### Files to Create

```
apps/agent/src/lib/
└── feature-flags.ts

apps/agent/src/hooks/
└── use-feature-flags.ts
```

#### Implementation

```typescript
// apps/agent/src/lib/feature-flags.ts

export interface FeatureFlags {
  browserEnabled: boolean;
  canvasEnabled: boolean;
  experimentalLSP: boolean;
  debugMode: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  browserEnabled: true,
  canvasEnabled: true,
  experimentalLSP: false,
  debugMode: false,
};

// Load from settings or environment
export function getFeatureFlags(): FeatureFlags {
  // Implementation
}

export function setFeatureFlag(key: keyof FeatureFlags, value: boolean): void {
  // Implementation
}
```

---

### Task 8.2: Feature Flag UI

**Type**: Code implementation
**Time**: 2-3 hours
**Dependencies**: Task 8.1 completed

#### Context

Add UI in settings to toggle feature flags.

---

## Phase 9: Security & Secrets

**Goal**: Remove committed secrets and implement proper secret management.

**Estimated Time**: 1 day

---

### Task 9.1: Secrets Remediation

**Type**: Git operations and configuration
**Time**: 2-3 hours
**Dependencies**: None

#### Context

Remove committed `.env` file and rotate credentials.

#### Steps

1. Add `.env` to `.gitignore`
2. Remove `.env` from git history (git filter-repo)
3. Rotate all exposed credentials
4. Document proper secret setup

**WARNING**: This task involves destructive git operations. Backup first.

---

### Task 9.2: Credential Audit

**Type**: Security audit
**Time**: 1-2 hours
**Dependencies**: None

#### Context

Scan codebase for any hardcoded secrets:

- API keys
- Tokens
- Passwords
- Private keys

Use tools like `gitleaks` or `truffleHog`.

---

## Phase 10: Final Hardening

**Goal**: Stress test and prepare for real users.

**Estimated Time**: 3-4 days

---

### Task 10.1: Load Testing

**Type**: Testing
**Time**: 3-4 hours
**Dependencies**: Most other phases completed

#### Context

Test the app under stress:

- Large files (10MB+)
- Large repositories (1000+ files)
- Rapid user actions
- Long-running sessions

---

### Task 10.2: Edge Case Testing

**Type**: Testing
**Time**: 3-4 hours
**Dependencies**: Most other phases completed

#### Context

Test edge cases:

- Network disconnection
- Disk full
- Permission denied
- Corrupted files
- Invalid git repos

---

### Task 10.3: Beta Testing Preparation

**Type**: Documentation and setup
**Time**: 2-3 hours
**Dependencies**: All other phases completed

#### Context

Prepare for beta testers:

- Create beta build
- Write beta testing instructions
- Set up feedback collection
- Configure crash reporting alerts

---

## Appendix A: Task Dependencies Graph

```
Phase 1 (Sentry)
├── 1.1 Account Setup (Manual) ─────────────────────────┐
├── 1.2 apps/agent ─────────────────────────────────────┤
├── 1.3 apps/Canvas-UI-Builder ─────────────────────────┤
├── 1.4 src-tauri ──────────────────────────────────────┤
├── 1.5 agent-bridge ───────────────────────────────────┤
├── 1.6 CI Integration ─────────────────────────────────┤
└── 1.7 Verification ───────────────────────────────────┘

Phase 2 (Test Infrastructure)
├── 2.1 Vitest apps/agent ───────────────────┐
├── 2.2 Vitest apps/Canvas-UI-Builder ───────┤
├── 2.3 Playwright Setup ────────────────────┤
├── 2.4 Shared Test Utils ───────────────────┤
└── 2.5 CI Integration ──────────────────────┘

Phase 3 (Unit Tests) ─────────── Depends on Phase 2
Phase 4 (Integration Tests) ──── Depends on Phase 2
Phase 5 (E2E Tests) ──────────── Depends on Phase 2
Phase 6 (Fallbacks) ──────────── Independent
Phase 7 (Dashboard) ──────────── Depends on Phase 1
Phase 8 (Feature Flags) ──────── Independent
Phase 9 (Security) ───────────── Independent (DO EARLY)
Phase 10 (Hardening) ─────────── Depends on all others
```

---

## Appendix B: Quick Reference

### Commands

```bash
# Run all tests
bun run test

# Run specific test file
cd apps/agent && bun run test file-store

# Run with coverage
bun run test:coverage

# Run E2E tests
bun run test:e2e

# Run E2E with UI
bun run test:e2e:ui

# Rust tests
cargo test --all

# Full quality check
./scripts/lint-all.sh
```

### Environment Variables

```bash
# Sentry
VITE_SENTRY_DSN=xxx          # Frontend DSN
SENTRY_DSN=xxx               # Backend DSN
SENTRY_AUTH_TOKEN=xxx        # For source maps
SENTRY_ORG=xxx               # Organization
SENTRY_PROJECT=xxx           # Project name

# Testing
CI=true                      # Skip certain tests in CI
ORBIT_TEST_MODE=true         # Enable test mode in app
```

---

## Changelog

| Date       | Version | Changes          |
| ---------- | ------- | ---------------- |
| 2026-01-21 | 1.0     | Initial document |
