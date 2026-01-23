//! Canvas preview server commands
//!
//! Manages a Vite-based preview server for live component rendering.
//! The server runs on a dynamic port (5199-5209) and uses postMessage
//! to communicate with the parent Tauri webview.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │  Tauri Webview (Canvas App)                                 │
//! │  ┌─────────────────────────────────────────────────────┐   │
//! │  │  iframe src="http://localhost:{port}"               │   │
//! │  │  ┌───────────────────────────────────────────────┐  │   │
//! │  │  │  Vite Preview Server (Bun)                    │  │   │
//! │  │  │  - React 19 + Tailwind 4                      │  │   │
//! │  │  │  - Dynamic component imports                  │  │   │
//! │  │  │  - postMessage ↔ parent                       │  │   │
//! │  │  └───────────────────────────────────────────────┘  │   │
//! │  └─────────────────────────────────────────────────────┘   │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! ## Usage
//!
//! 1. Call `canvas_setup_preview_server` to scaffold the Vite project
//! 2. Call `canvas_install_preview_deps` to run `bun install`
//! 3. Call `canvas_start_preview_server` to spawn the dev server
//! 4. Use the returned `port` to embed `http://localhost:{port}` in an iframe
//! 5. Call `canvas_stop_preview_server` when done

// Tauri command macro generates these patterns
#![expect(
    clippy::unreachable,
    reason = "Tauri command macro generates unreachable!() for exhaustive match arms"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "Intentionally ignoring kill/wait results during cleanup - process may already be dead"
)]
// Code style choices for this scaffolding module
#![expect(
    clippy::needless_raw_string_hashes,
    clippy::needless_raw_strings,
    reason = "Embedded JS/TS/CSS code is more readable with raw strings to avoid escaping issues"
)]
#![expect(
    clippy::too_many_lines,
    reason = "Scaffold function writes multiple files - splitting would reduce readability"
)]
#![expect(
    clippy::absolute_paths,
    reason = "std::fs calls are clearer inline for file operations in scaffold code"
)]
#![expect(
    clippy::str_to_string,
    reason = "Error messages use .to_string() for consistency with format!()"
)]

use std::fmt;
use std::io::{BufRead as _, BufReader};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::thread;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::State;

/// Port range for the preview server (tries 5199, then 5200-5209)
const PORT_RANGE_START: u16 = 5199;
const PORT_RANGE_END: u16 = 5209;

/// Graceful shutdown timeout before SIGKILL (milliseconds)
const GRACEFUL_SHUTDOWN_TIMEOUT_MS: u64 = 3000;

/// Managed state for the preview server subprocess.
///
/// This state is shared across all Tauri commands and ensures only one
/// preview server instance runs at a time.
///
/// Uses `parking_lot::Mutex` instead of `std::sync::Mutex` because
/// parking_lot's `MutexGuard` is `Send`, which is required when holding
/// the guard across `.await` points in async Tauri commands.
pub struct PreviewServerState {
    /// The child process handle, if running
    pub process: Mutex<Option<Child>>,
    /// The port the server is running on
    pub port: Mutex<Option<u16>>,
}

impl fmt::Debug for PreviewServerState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Use try_lock to avoid deadlocks when debug-printing while lock is held
        let has_process = self.process.try_lock().map(|g| g.is_some());
        let port = self.port.try_lock().and_then(|g| *g);

        f.debug_struct("PreviewServerState")
            .field(
                "has_process",
                &has_process.map_or_else(|| "<locked>".to_owned(), |v| v.to_string()),
            )
            .field(
                "port",
                &port.map_or_else(|| "<locked>".to_owned(), |p| p.to_string()),
            )
            .finish()
    }
}

impl PreviewServerState {
    /// Create a new preview server state with no running process.
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(None),
        }
    }
}

impl Default for PreviewServerState {
    fn default() -> Self {
        Self::new()
    }
}

// Implement Drop to clean up on crash/shutdown
impl Drop for PreviewServerState {
    fn drop(&mut self) {
        let mut guard = self.process.lock();
        if let Some(mut child) = guard.take() {
            // Try graceful shutdown first
            graceful_shutdown(&mut child);
        }
    }
}

/// Information about the preview server status.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewServerInfo {
    /// Whether the server is currently running
    pub running: bool,
    /// The port the server is listening on (0 if not running)
    pub port: u16,
    /// Full URL to access the preview
    pub url: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Find an available port in the range.
fn find_available_port() -> Option<u16> {
    (PORT_RANGE_START..=PORT_RANGE_END).find(|&port| TcpListener::bind(("127.0.0.1", port)).is_ok())
}

/// Attempt graceful shutdown with SIGTERM, fallback to SIGKILL after timeout.
///
/// Uses blocking sleep because this function:
/// 1. Is called from `Drop` (must be synchronous)
/// 2. Needs to poll process status with timeout
/// 3. Has short intervals (100ms) and bounded total time (3s max)
#[expect(
    clippy::disallowed_methods,
    reason = "thread::sleep is appropriate for sync graceful shutdown polling"
)]
fn graceful_shutdown(child: &mut Child) {
    let pid = child.id().to_string();

    #[cfg(unix)]
    {
        // Send SIGTERM via kill command (avoids unsafe code)
        let _ = Command::new("kill")
            .args(["-TERM", &pid])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(windows)]
    {
        // Windows: use taskkill for graceful termination
        let _ = Command::new("taskkill")
            .args(["/PID", &pid, "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    // Wait for graceful exit with timeout
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    loop {
        match child.try_wait() {
            Ok(Some(_)) => return, // Process exited gracefully
            Ok(None) => {
                if start.elapsed() > timeout {
                    // Timeout - force kill
                    log::warn!(
                        "Preview server did not respond to graceful shutdown, forcing termination"
                    );

                    #[cfg(unix)]
                    {
                        let _ = child.kill();
                    }

                    #[cfg(windows)]
                    {
                        let _ = Command::new("taskkill")
                            .args(["/PID", &pid, "/T", "/F"])
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .status();
                    }

                    let _ = child.wait();
                    return;
                }
                thread::sleep(std::time::Duration::from_millis(100));
            },
            Err(_) => {
                // Process already gone
                return;
            },
        }
    }
}

/// Spawn log reader threads that forward stdout/stderr to Tauri logs.
///
/// The threads run in the background and terminate when the child process
/// closes its stdout/stderr pipes (i.e., when the process exits).
fn spawn_log_readers(child: &mut Child) {
    // Read stdout - detached thread, will exit when pipe closes
    if let Some(stdout) = child.stdout.take() {
        drop(thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                log::info!("[preview-server] {line}");
            }
        }));
    }

    // Read stderr - detached thread, will exit when pipe closes
    if let Some(stderr) = child.stderr.take() {
        drop(thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                // Vite often logs to stderr for warnings/info, not just errors
                if line.contains("error") || line.contains("Error") || line.contains("ERROR") {
                    log::error!("[preview-server] {line}");
                } else {
                    log::warn!("[preview-server] {line}");
                }
            }
        }));
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Create the preview server project structure.
///
/// Scaffolds a complete Vite + React 19 + Tailwind 4 project in
/// `~/.orbit/canvas/preview/`. The project is configured to:
///
/// - Run on a dynamic port (passed via environment variable)
/// - Import components from `~/.orbit/canvas/components/`
/// - Use the same theme variables as the main Orbit app
///
/// # Errors
///
/// Returns an error if directory creation or file writing fails.
#[tauri::command]
pub async fn canvas_setup_preview_server() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    std::fs::create_dir_all(preview_path.join("src"))
        .map_err(|e| format!("Failed to create preview directory: {e}"))?;

    // 1. package.json - Note: uses bun, port from env
    // All Radix packages and shadcn dependencies must be listed here for components to resolve properly
    let package_json = r##"{
  "name": "orbit-canvas-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-accordion": "^1.2.0",
    "@radix-ui/react-alert-dialog": "^1.1.0",
    "@radix-ui/react-aspect-ratio": "^1.1.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-checkbox": "^1.1.0",
    "@radix-ui/react-collapsible": "^1.1.0",
    "@radix-ui/react-context-menu": "^2.2.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-hover-card": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-menubar": "^1.1.0",
    "@radix-ui/react-navigation-menu": "^1.2.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-radio-group": "^1.2.0",
    "@radix-ui/react-scroll-area": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slider": "^1.2.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toggle": "^1.1.0",
    "@radix-ui/react-toggle-group": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "cmdk": "^1.0.0",
    "embla-carousel-react": "^8.0.0",
    "input-otp": "^1.2.0",
    "react-day-picker": "^8.10.0",
    "date-fns": "^3.6.0",
    "react-resizable-panels": "^2.0.0",
    "recharts": "^2.12.0",
    "sonner": "^1.4.0",
    "vaul": "^0.9.0",
    "react-hook-form": "^7.50.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "lucide-react": "^0.400.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}"##;
    std::fs::write(preview_path.join("package.json"), package_json)
        .map_err(|e| format!("Failed to write package.json: {e}"))?;

    // 2. vite.config.ts - dynamic port from env, path resolution
    // Note: We need to ensure that components loaded from ORBIT_PATH can resolve
    // npm dependencies from this preview project's node_modules.
    let vite_config = r##"import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// Resolve orbit path and port dynamically
const ORBIT_PATH = process.env.ORBIT_CANVAS_PATH || path.join(homedir(), '.orbit', 'canvas');
const PORT = parseInt(process.env.VITE_PORT || '5199', 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: PORT,
    strictPort: true,
    fs: {
      // Allow serving files from the orbit canvas directory
      allow: ['.', ORBIT_PATH],
    },
  },
  resolve: {
    alias: {
      '@/components/ui': path.join(ORBIT_PATH, 'components', 'ui'),
      '@/components/custom': path.join(ORBIT_PATH, 'components', 'custom'),
      '@/lib': path.join(ORBIT_PATH, 'lib'),
      '@/hooks': path.join(ORBIT_PATH, 'hooks'),
    },
  },
  // Ensure dependencies are resolved from this project's node_modules
  // even when importing files from outside the project root (ORBIT_PATH)
  optimizeDeps: {
    include: [
      // Radix UI primitives
      '@radix-ui/react-slot',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      // Other shadcn dependencies
      'cmdk',
      'embla-carousel-react',
      'input-otp',
      'react-day-picker',
      'date-fns',
      'react-resizable-panels',
      'recharts',
      'sonner',
      'vaul',
      'react-hook-form',
      'zod',
      '@hookform/resolvers',
      'lucide-react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
    ],
  },
});
"##;
    std::fs::write(preview_path.join("vite.config.ts"), vite_config)
        .map_err(|e| format!("Failed to write vite.config.ts: {e}"))?;

    // 3. index.html - Note: no hardcoded dark class, theme is set via postMessage
    let index_html = r##"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Canvas Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>"##;
    std::fs::write(preview_path.join("index.html"), index_html)
        .map_err(|e| format!("Failed to write index.html: {e}"))?;

    // 4. tsconfig.json
    let tsconfig = r##"{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "paths": {
      "@/components/ui/*": ["../components/ui/*"],
      "@/components/custom/*": ["../components/custom/*"],
      "@/lib/*": ["../lib/*"]
    }
  },
  "include": ["src"]
}"##;
    std::fs::write(preview_path.join("tsconfig.json"), tsconfig)
        .map_err(|e| format!("Failed to write tsconfig.json: {e}"))?;

    // 5. src/main.tsx
    let main_tsx = r##"import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview } from './Preview';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);"##;
    std::fs::write(preview_path.join("src/main.tsx"), main_tsx)
        .map_err(|e| format!("Failed to write main.tsx: {e}"))?;

    // 6. src/Preview.tsx - with CSS injection for instant preview updates
    let preview_tsx = r##"import { useState, useEffect, useMemo, ComponentType } from 'react';

interface PreviewMessage {
  type: 'preview:load' | 'preview:update-styles' | 'preview:update-props' | 'preview:clear' | 'preview:set-theme';
  componentName?: string;
  componentType?: string;
  styles?: Record<string, string>;
  props?: Record<string, unknown>;
  theme?: 'light' | 'dark';
}

interface PreviewResponse {
  type: 'preview:ready' | 'preview:loaded' | 'preview:error';
  componentName?: string;
  error?: string;
  exports?: string[];
}

function sendToParent(response: PreviewResponse) {
  window.parent.postMessage(response, '*'); // Parent is Tauri webview
}

// Apply theme to document
function setTheme(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

/**
 * Convert camelCase to kebab-case for CSS custom properties
 * e.g., 'fontSize' -> 'font-size', 'backgroundColor' -> 'background-color'
 */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Generate injected CSS for instant preview updates.
 *
 * Architecture:
 * - Targets ONLY elements with [data-slot] attribute (shadcn component roots)
 * - Does NOT style demo wrapper divs or layout containers
 * - Uses :where() for lower specificity so component styles can override
 * - Typography cascades to text content within components
 * - Returns empty string when no styles are set
 */
function generateInjectedCSS(styles: Record<string, string>): string {
  if (Object.keys(styles).length === 0) return '';

  // Target ONLY shadcn component roots (elements with data-slot attribute)
  // This excludes demo wrapper divs like <div class="flex flex-wrap gap-2">
  // and only styles the actual components (Button, Badge, Card, etc.)
  const componentSelector = `#preview-component-wrapper [data-slot]`;

  // For typography, also target text content within components
  // Uses :where() for lower specificity
  const textSelector = `#preview-component-wrapper [data-slot],
#preview-component-wrapper [data-slot] :where(span, p, h1, h2, h3, h4, h5, h6)`;

  // Build the CSS rules
  const rules: string[] = [];

  // Layout, spacing, border, and effects properties - component roots only
  const layoutProps = ['padding', 'margin', 'gap', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle', 'opacity', 'boxShadow', 'backgroundColor'];
  const layoutRules = layoutProps
    .filter(prop => styles[prop] !== undefined)
    .map(prop => `  ${camelToKebab(prop)}: ${styles[prop]} !important;`)
    .join('\n');

  if (layoutRules) {
    rules.push(`${componentSelector} {\n${layoutRules}\n}`);
  }

  // Typography properties - cascades to text within components
  const typographyProps = ['fontSize', 'fontWeight', 'fontFamily', 'letterSpacing', 'color', 'lineHeight', 'textAlign'];
  const typographyRules = typographyProps
    .filter(prop => styles[prop] !== undefined)
    .map(prop => `  ${camelToKebab(prop)}: ${styles[prop]} !important;`)
    .join('\n');

  if (typographyRules) {
    rules.push(`${textSelector} {\n${typographyRules}\n}`);
  }

  // Hover state with brightness filter for interactive feedback
  if (styles.backgroundColor || styles.borderColor) {
    rules.push(`${componentSelector}:hover {
  filter: brightness(0.9);
  transition: filter 150ms ease-out;
}`);
  }

  return `/* Preview CSS Injection - Targets [data-slot] components only */
${rules.join('\n\n')}`;
}

export function Preview() {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  const [componentName, setComponentName] = useState<string>('');
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Memoize the injected CSS to avoid re-computation on every render
  const injectedCSS = useMemo(() => generateInjectedCSS(styles), [styles]);

  const loadComponent = async (name: string, type: string = 'ui') => {
    setLoading(true);
    setError(null);

    try {
      const module = type === 'custom'
        ? await import(`@/components/custom/${name}.tsx`)
        : await import(`@/components/ui/${name}.tsx`);

      // Handle various export patterns
      const pascalName = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
      const Comp = module[pascalName] || module.default || Object.values(module)[0];

      if (!Comp) {
        throw new Error(`No component export found in ${name}`);
      }

      setComponent(() => Comp);
      setComponentName(name);
      setLoading(false);

      const exports = Object.keys(module).filter(k => typeof module[k] === 'function');
      sendToParent({ type: 'preview:loaded', componentName: name, exports });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setLoading(false);
      sendToParent({ type: 'preview:error', error: errorMsg });
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent<PreviewMessage>) => {
      // Accept messages from Tauri webview
      const { type, componentName, componentType, styles: newStyles, props: newProps, theme } = event.data || {};

      switch (type) {
        case 'preview:load':
          if (componentName) {
            loadComponent(componentName, componentType || 'ui');
          }
          break;
        case 'preview:update-styles':
          if (newStyles) setStyles(newStyles);
          break;
        case 'preview:update-props':
          if (newProps) setProps(newProps);
          break;
        case 'preview:set-theme':
          if (theme) setTheme(theme);
          break;
        case 'preview:clear':
          setComponent(null);
          setComponentName('');
          setProps({});
          setStyles({});
          break;
      }
    };

    window.addEventListener('message', handler);
    sendToParent({ type: 'preview:ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-8">
        <div className="text-center text-destructive max-w-md">
          <p className="text-lg font-medium mb-2">Error Loading Component</p>
          <p className="text-sm opacity-70 font-mono">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        <p>Select a component to preview</p>
      </div>
    );
  }

  return (
    <>
      {/* Inject dynamic CSS styles */}
      {injectedCSS && <style>{injectedCSS}</style>}

      <div className="flex items-center justify-center min-h-screen bg-background p-8">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground font-mono">{componentName}</p>
          <div className="p-6 rounded-lg border border-border bg-card">
            {/* Wrapper with ID for CSS injection targeting - contents class ensures no layout impact */}
            <div id="preview-component-wrapper" className="contents">
              <Component {...props} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
"##;
    std::fs::write(preview_path.join("src/Preview.tsx"), preview_tsx)
        .map_err(|e| format!("Failed to write Preview.tsx: {e}"))?;

    // 7. src/globals.css - Complete shadcn-compatible Tailwind v4 configuration
    // CRITICAL: @source directives tell Tailwind to scan external component files
    let globals_css = r##"@import "tailwindcss";

/* Animation plugin for shadcn components */
@plugin "tailwindcss-animate";

/* Tell Tailwind to scan external directories for class usage */
@source "../../components";
@source "../../lib";
@source "../../hooks";

/*
 * Tailwind v4 Theme Configuration
 * Maps CSS variables to Tailwind utility classes
 */
@theme inline {
  /* Colors */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* Charts */
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Radius */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);

  /* Animation keyframes - used by shadcn components */

  /* Accordion & Collapsible */
  @keyframes accordion-down {
    from { height: 0; }
    to { height: var(--radix-accordion-content-height, auto); }
  }
  @keyframes accordion-up {
    from { height: var(--radix-accordion-content-height, auto); }
    to { height: 0; }
  }
  @keyframes collapsible-down {
    from { height: 0; }
    to { height: var(--radix-collapsible-content-height, auto); }
  }
  @keyframes collapsible-up {
    from { height: var(--radix-collapsible-content-height, auto); }
    to { height: 0; }
  }

  /* Fade animations - Dialog, Dropdown, Popover, Tooltip, AlertDialog */
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  /* Zoom animations - DropdownMenu, ContextMenu */
  @keyframes zoom-in {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes zoom-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.95); }
  }

  /* Slide animations - Sheet, Dialog */
  @keyframes slide-in-from-top {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }
  @keyframes slide-in-from-bottom {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  @keyframes slide-in-from-left {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  @keyframes slide-in-from-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes slide-out-to-top {
    from { transform: translateY(0); }
    to { transform: translateY(-100%); }
  }
  @keyframes slide-out-to-bottom {
    from { transform: translateY(0); }
    to { transform: translateY(100%); }
  }
  @keyframes slide-out-to-left {
    from { transform: translateX(0); }
    to { transform: translateX(-100%); }
  }
  @keyframes slide-out-to-right {
    from { transform: translateX(0); }
    to { transform: translateX(100%); }
  }

  /* Input OTP caret blink */
  @keyframes caret-blink {
    0%, 70%, 100% { opacity: 1; }
    20%, 50% { opacity: 0; }
  }

  /* Spinner animation */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Pulse animation */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Animation duration/timing tokens */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
  --animate-collapsible-down: collapsible-down 0.2s ease-out;
  --animate-collapsible-up: collapsible-up 0.2s ease-out;
  --animate-fade-in: fade-in 0.2s ease-out;
  --animate-fade-out: fade-out 0.2s ease-out;
  --animate-zoom-in: zoom-in 0.2s ease-out;
  --animate-zoom-out: zoom-out 0.2s ease-out;
  --animate-slide-in-from-top: slide-in-from-top 0.3s ease-out;
  --animate-slide-in-from-bottom: slide-in-from-bottom 0.3s ease-out;
  --animate-slide-in-from-left: slide-in-from-left 0.3s ease-out;
  --animate-slide-in-from-right: slide-in-from-right 0.3s ease-out;
  --animate-slide-out-to-top: slide-out-to-top 0.3s ease-out;
  --animate-slide-out-to-bottom: slide-out-to-bottom 0.3s ease-out;
  --animate-slide-out-to-left: slide-out-to-left 0.3s ease-out;
  --animate-slide-out-to-right: slide-out-to-right 0.3s ease-out;
  --animate-caret-blink: caret-blink 1.25s ease-out infinite;
  --animate-spin: spin 1s linear infinite;
  --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Custom variants for Radix data-* attributes */
@custom-variant dark (&:is(.dark *));

@custom-variant data-open {
  &:where([data-state="open"]),
  &:where([data-open]:not([data-open="false"])) {
    @slot;
  }
}

@custom-variant data-closed {
  &:where([data-state="closed"]),
  &:where([data-closed]:not([data-closed="false"])) {
    @slot;
  }
}

@custom-variant data-checked {
  &:where([data-state="checked"]),
  &:where([data-checked]:not([data-checked="false"])) {
    @slot;
  }
}

@custom-variant data-unchecked {
  &:where([data-state="unchecked"]),
  &:where([data-unchecked]:not([data-unchecked="false"])) {
    @slot;
  }
}

@custom-variant data-selected {
  &:where([data-selected="true"]) {
    @slot;
  }
}

@custom-variant data-disabled {
  &:where([data-disabled="true"]),
  &:where([data-disabled]:not([data-disabled="false"])) {
    @slot;
  }
}

@custom-variant data-active {
  &:where([data-state="active"]),
  &:where([data-active]:not([data-active="false"])) {
    @slot;
  }
}

@custom-variant data-horizontal {
  &:where([data-orientation="horizontal"]) {
    @slot;
  }
}

@custom-variant data-vertical {
  &:where([data-orientation="vertical"]) {
    @slot;
  }
}

/*
 * CSS Variables - Light Mode (Orbit warm palette: coral/oat/clay)
 */
:root {
  --radius: 0.5rem;
  --background: oklch(0.95 0.01 75);
  --foreground: oklch(0.24 0.02 55);
  --card: oklch(0.9 0.02 75);
  --card-foreground: oklch(0.24 0.02 55);
  --popover: oklch(0.92 0.015 75);
  --popover-foreground: oklch(0.24 0.02 55);
  --primary: oklch(0.56 0.18 35);
  --primary-foreground: oklch(0.98 0.01 75);
  --secondary: oklch(0.73 0.06 70);
  --secondary-foreground: oklch(0.3 0.02 55);
  --muted: oklch(0.82 0.03 70);
  --muted-foreground: oklch(0.55 0.04 60);
  --accent: oklch(0.82 0.03 70);
  --accent-foreground: oklch(0.24 0.02 55);
  --destructive: oklch(0.55 0.22 25);
  --destructive-foreground: oklch(0.98 0.01 75);
  --border: oklch(0.84 0.025 70);
  --input: oklch(0.87 0.02 70);
  --ring: oklch(0.56 0.18 35);
  --chart-1: oklch(0.837 0.128 66.29);
  --chart-2: oklch(0.705 0.213 47.604);
  --chart-3: oklch(0.646 0.222 41.116);
  --chart-4: oklch(0.553 0.195 38.402);
  --chart-5: oklch(0.47 0.157 37.304);
  --sidebar: oklch(0.96 0.008 70);
  --sidebar-foreground: oklch(0.25 0.02 60);
  --sidebar-primary: oklch(0.56 0.18 35);
  --sidebar-primary-foreground: oklch(0.98 0.01 75);
  --sidebar-accent: oklch(0.9 0.02 70);
  --sidebar-accent-foreground: oklch(0.3 0.02 60);
  --sidebar-border: oklch(0.88 0.02 70);
  --sidebar-ring: oklch(0.56 0.18 35);
}

/*
 * CSS Variables - Dark Mode (Orbit warm palette)
 */
.dark {
  --background: oklch(0.16 0.012 60);
  --foreground: oklch(0.93 0.01 75);
  --card: oklch(0.2 0.015 58);
  --card-foreground: oklch(0.93 0.01 75);
  --popover: oklch(0.22 0.015 58);
  --popover-foreground: oklch(0.93 0.01 75);
  --primary: oklch(0.68 0.19 40);
  --primary-foreground: oklch(0.15 0.01 60);
  --secondary: oklch(0.28 0.02 58);
  --secondary-foreground: oklch(0.9 0.01 75);
  --muted: oklch(0.25 0.015 58);
  --muted-foreground: oklch(0.65 0.03 60);
  --accent: oklch(0.3 0.02 55);
  --accent-foreground: oklch(0.93 0.01 75);
  --destructive: oklch(0.65 0.2 25);
  --destructive-foreground: oklch(0.98 0.01 75);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.55 0.15 38);
  --chart-1: oklch(0.837 0.128 66.29);
  --chart-2: oklch(0.705 0.213 47.604);
  --chart-3: oklch(0.646 0.222 41.116);
  --chart-4: oklch(0.553 0.195 38.402);
  --chart-5: oklch(0.47 0.157 37.304);
  --sidebar: oklch(0.2 0.015 58);
  --sidebar-foreground: oklch(0.93 0.01 75);
  --sidebar-primary: oklch(0.68 0.19 40);
  --sidebar-primary-foreground: oklch(0.15 0.01 60);
  --sidebar-accent: oklch(0.26 0.015 58);
  --sidebar-accent-foreground: oklch(0.9 0.01 75);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.55 0.15 38);
}

/*
 * Base layer - CRITICAL for shadcn components
 * Sets default border color on all elements
 */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, sans-serif;
    font-synthesis-weight: none;
    text-rendering: optimizeLegibility;
  }
}

/* No scrollbar utility */
@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}
"##;
    std::fs::write(preview_path.join("src/globals.css"), globals_css)
        .map_err(|e| format!("Failed to write globals.css: {e}"))?;

    log::info!("Preview server scaffolded at {}", preview_path.display());
    Ok(())
}

/// Install preview server dependencies using bun.
///
/// Runs `bun install` in the preview directory. This is a separate step
/// from `canvas_setup_preview_server` because dependency installation
/// requires network access and can be slow.
///
/// **Note:** This uses `bun` exclusively per project policy. Never use `npm`.
///
/// # Errors
///
/// Returns an error if:
/// - `bun` is not installed
/// - The install command fails
/// - The preview directory doesn't exist
#[tauri::command]
pub async fn canvas_install_preview_deps() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    if !preview_path.exists() {
        return Err(
            "Preview directory does not exist. Run canvas_setup_preview_server first.".to_string(),
        );
    }

    log::info!("Installing preview server dependencies...");

    let output = Command::new("bun")
        .arg("install")
        .current_dir(&preview_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run bun install: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("bun install failed: {stderr}");
        return Err(format!("bun install failed: {stderr}"));
    }

    log::info!("Preview server dependencies installed successfully");
    Ok(())
}

/// Start the preview server.
///
/// Spawns `bun run dev` in the preview directory. The server tries to bind
/// to port 5199, falling back to 5200-5209 if unavailable.
///
/// This function polls for server readiness by making HTTP requests until
/// the server responds or timeout (30s).
///
/// Server stdout/stderr are forwarded to Tauri logs for debugging.
///
/// # State
///
/// The running process and port are stored in `PreviewServerState`. Only one
/// server instance can run at a time.
///
/// # Errors
///
/// Returns an error if:
/// - The preview directory doesn't exist
/// - Dependencies aren't installed
/// - No ports available in range 5199-5209
/// - Server fails to start within 30 seconds
#[tauri::command]
pub async fn canvas_start_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    // Find available port and prepare to spawn
    let (preview_path, port) = {
        let mut process_guard = state.process.lock();
        let port_guard = state.port.lock();

        // Check if already running
        if let Some(ref mut child) = *process_guard {
            match child.try_wait() {
                Ok(None) => {
                    let current_port = port_guard.unwrap_or(PORT_RANGE_START);
                    return Ok(PreviewServerInfo {
                        running: true,
                        port: current_port,
                        url: format!("http://localhost:{current_port}"),
                    });
                },
                _ => {
                    // Process exited, clear it
                    *process_guard = None;
                },
            }
        }

        let orbit_path = super::setup::get_orbit_canvas_path()?;
        let preview_path = orbit_path.join("preview");

        if !preview_path.join("node_modules").exists() {
            return Err(
                "Dependencies not installed. Run canvas_install_preview_deps first.".to_string(),
            );
        }

        // Find available port
        let port = find_available_port().ok_or_else(|| {
            format!("No available ports in range {PORT_RANGE_START}-{PORT_RANGE_END}")
        })?;

        (preview_path, port)
    };

    log::info!("Starting preview server on port {port}...");

    // Spawn process (outside lock scope)
    let mut child = Command::new("bun")
        .args(["run", "dev"])
        .env("VITE_PORT", port.to_string())
        .current_dir(&preview_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start preview server: {e}"))?;

    // Spawn log reader threads
    spawn_log_readers(&mut child);

    // Store process and port
    {
        let mut process_guard = state.process.lock();
        let mut port_guard = state.port.lock();
        *process_guard = Some(child);
        *port_guard = Some(port);
    }

    // Poll for server readiness (max 30 seconds)
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(30);
    let url = format!("http://localhost:{port}");

    loop {
        if start.elapsed() > timeout {
            // Timeout - kill process
            log::error!("Preview server failed to start within 30 seconds");
            let mut guard = state.process.lock();
            let mut port_guard = state.port.lock();
            if let Some(mut child) = guard.take() {
                graceful_shutdown(&mut child);
            }
            *port_guard = None;
            return Err("Preview server failed to start within 30 seconds".to_string());
        }

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 404 => {
                // 404 is OK - Vite is running but may not have index
                log::info!("Preview server ready at {url}");
                break;
            },
            _ => {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            },
        }
    }

    Ok(PreviewServerInfo {
        running: true,
        port,
        url,
    })
}

/// Stop the preview server.
///
/// Attempts graceful shutdown with SIGTERM (Unix) or taskkill (Windows),
/// falling back to SIGKILL/force after 3 seconds.
///
/// # State
///
/// Clears the process and port from `PreviewServerState`.
#[tauri::command]
pub async fn canvas_stop_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<(), String> {
    let mut process_guard = state.process.lock();
    let mut port_guard = state.port.lock();

    if let Some(mut child) = process_guard.take() {
        log::info!("Stopping preview server...");
        graceful_shutdown(&mut child);
        log::info!("Preview server stopped");
    }

    *port_guard = None;
    Ok(())
}

/// Get preview server status.
///
/// Checks if the server process is still running by attempting a
/// non-blocking wait on the child process.
///
/// # Returns
///
/// - `running: true` with the current port if the process is alive
/// - `running: false` with port 0 if the process has exited or was never started
#[tauri::command]
pub async fn canvas_preview_server_status(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    let mut process_guard = state.process.lock();
    let mut port_guard = state.port.lock();

    let (running, port) = if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(None) => (true, port_guard.unwrap_or(0)),
            _ => {
                *process_guard = None;
                *port_guard = None;
                (false, 0)
            },
        }
    } else {
        (false, 0)
    };

    Ok(PreviewServerInfo {
        running,
        port,
        url: if running {
            format!("http://localhost:{port}")
        } else {
            String::new()
        },
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[expect(
    clippy::expect_used,
    reason = "expect is idiomatic in tests for unwrapping expected values"
)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_server_info_serialization() {
        let info = PreviewServerInfo {
            running: true,
            port: 5199,
            url: "http://localhost:5199".to_string(),
        };

        let json = serde_json::to_string(&info);
        assert!(json.is_ok(), "PreviewServerInfo should serialize");

        let json_str = json.expect("Serialization should succeed");
        assert!(json_str.contains("\"running\":true"));
        assert!(json_str.contains("\"port\":5199"));
        assert!(json_str.contains("\"url\":\"http://localhost:5199\""));
    }

    #[test]
    fn test_preview_server_state_default() {
        let state = PreviewServerState::default();
        let guard = state.process.lock();
        assert!(guard.is_none(), "Default state should have no process");

        let port_guard = state.port.lock();
        assert!(port_guard.is_none(), "Default state should have no port");
    }

    #[test]
    fn test_find_available_port() {
        // This test may be flaky if ports are in use, but it should work most of the time
        let port = find_available_port();
        assert!(port.is_some(), "Should find an available port");

        let port = port.expect("Port should be available");
        assert!(
            (PORT_RANGE_START..=PORT_RANGE_END).contains(&port),
            "Port should be in expected range"
        );
    }
}
