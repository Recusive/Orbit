# Tauri Plugins Reference

> **Last Updated:** January 6, 2025
> **Tauri Version:** 2.9.5 (latest)

This document catalogs Tauri plugins - both those currently used in Orbit and potential additions based on analysis of the Conductor app.

---

## Current Orbit Plugins

| Plugin                           | Version | Purpose                    |
| -------------------------------- | ------- | -------------------------- |
| `tauri-plugin-fs`                | 2.4.4   | File system operations     |
| `tauri-plugin-shell`             | 2.3.3   | Child processes & commands |
| `tauri-plugin-dialog`            | 2.4.2   | Native OS dialogs          |
| `tauri-plugin-clipboard-manager` | 2.3.2   | System clipboard           |
| `tauri-plugin-log`               | 2.7.1   | Structured logging         |

### tauri-plugin-fs

**What it does:** Read, write, create, delete, rename, and watch files and directories.

**Orbit usage:**

- File explorer tree
- Reading source files into CodeMirror editor
- Writing file changes on save (Cmd+S)
- Watching for external file changes

**Example:**

```rust
// Rust command
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
```

```typescript
// Frontend
const content = await invoke('read_file', { path: '/src/main.ts' });
```

---

### tauri-plugin-shell

**What it does:** Spawn child processes, run shell commands, open URLs/files with default apps.

**Orbit usage:**

- Terminal emulation (PTY via portable-pty)
- Running git commands
- Executing build tools (npm, cargo, etc.)
- Agent bridge sidecar process

**Example:**

```rust
use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn run_command(app: AppHandle, cmd: String) -> Result<String, String> {
    let output = app.shell()
        .command("sh")
        .args(["-c", &cmd])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

---

### tauri-plugin-dialog

**What it does:** Native file picker dialogs (open, save, message boxes, confirmations).

**Orbit usage:**

- "Open Folder" to select workspace
- "Save As" for new files
- Confirmation dialogs before destructive actions

**Example:**

```typescript
import { open, save, message } from '@tauri-apps/plugin-dialog';

// Open folder picker
const folder = await open({
  directory: true,
  title: 'Select Workspace',
});

// Save file dialog
const path = await save({
  defaultPath: 'untitled.ts',
  filters: [{ name: 'TypeScript', extensions: ['ts', 'tsx'] }],
});

// Confirmation
const confirmed = await message('Delete this file?', {
  kind: 'warning',
  okLabel: 'Delete',
  cancelLabel: 'Cancel',
});
```

---

### tauri-plugin-clipboard-manager

**What it does:** Read from and write to the system clipboard.

**Orbit usage:**

- Copy/paste code in editor
- Copy file paths
- Copy error messages

**Example:**

```typescript
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager';

await writeText('const x = 42;');
const text = await readText();
```

---

### tauri-plugin-log

**What it does:** Structured logging with levels (trace, debug, info, warn, error) that works across Rust and JavaScript.

**Orbit usage:**

- Debug logging during development
- Error tracking in production
- Performance monitoring

**Example:**

```rust
use log::{info, warn, error};

info!("Session created: {}", session_id);
warn!("File not found, creating new: {}", path);
error!("Failed to connect: {}", err);
```

```typescript
import { info, warn, error } from '@tauri-apps/plugin-log';

await info('User opened file');
await error('API call failed');
```

---

## Potential Plugins to Add

Based on analysis of Conductor (v0.28.7, Tauri 2.6.2), these plugins would add valuable functionality:

### Priority 1: window-state

| Effort | Impact | Recommended |
| ------ | ------ | ----------- |
| Low    | High   | ✅ Yes      |

**What it does:** Automatically persists and restores window size, position, and monitor placement between app sessions.

**Why add it:**

- Users expect apps to remember their window layout
- Zero configuration needed - just register the plugin
- Works across multiple monitors

**Installation:**

```toml
# Cargo.toml
tauri-plugin-window-state = "2"
```

```rust
// main.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

---

### Priority 2: notification

| Effort | Impact | Recommended |
| ------ | ------ | ----------- |
| Low    | Medium | ✅ Yes      |

**What it does:** Send native OS notifications (macOS Notification Center, Windows Toast, Linux libnotify).

**Why add it:**

- Notify when long AI responses complete
- Build/test completion alerts
- Git push/pull success/failure
- Background task completion

**Example:**

```typescript
import { sendNotification, requestPermission } from '@tauri-apps/plugin-notification';

await requestPermission();
await sendNotification({
  title: 'Build Complete',
  body: 'orbit-agent compiled successfully',
  icon: 'icons/success.png',
});
```

---

### Priority 3: updater

| Effort | Impact | Recommended          |
| ------ | ------ | -------------------- |
| Medium | High   | ✅ Yes (for release) |

**What it does:** Check for app updates, download, and install without manual reinstallation.

**Why add it:**

- Essential for shipping updates to users
- Automatic update checks on launch
- User-initiated "Check for Updates"
- Supports code signing verification

**Requires:**

- Update server or GitHub Releases
- Code signing for macOS/Windows
- Update manifest JSON file

**Example:**

```typescript
import { check, installUpdate } from '@tauri-apps/plugin-updater';

const update = await check();
if (update?.available) {
  await installUpdate();
  // App will restart with new version
}
```

---

### Priority 4: deep-link

| Effort | Impact | Recommended     |
| ------ | ------ | --------------- |
| Medium | Medium | 🔸 Nice to have |

**What it does:** Register custom URL schemes so external links open in your app.

**Why add it:**

- `orbit://open?file=/path/to/file.ts&line=42`
- Browser extensions could send files to Orbit
- GitHub/GitLab integration links
- Cross-app workflows

**Example URL schemes:**

```
orbit://open?file=/Users/dev/project/src/main.ts
orbit://open?file=/path/file.ts&line=42&column=10
orbit://project?path=/Users/dev/my-project
orbit://search?query=TODO&path=/Users/dev/project
```

**Configuration:**

```json
// tauri.conf.json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["orbit"]
      }
    }
  }
}
```

---

### Priority 5: opener

| Effort | Impact | Recommended     |
| ------ | ------ | --------------- |
| Low    | Low    | 🔸 Nice to have |

**What it does:** Open files and URLs with the system's default application.

**Why add it:**

- "Open in Finder" / "Open in Explorer"
- "Open in Browser" for HTML files
- "Open with Default App" for any file
- "Reveal in Finder" for file location

**Example:**

```typescript
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';

await openUrl('https://github.com/user/repo');
await openPath('/path/to/document.pdf');
await revealItemInDir('/path/to/file.ts'); // Opens Finder with file selected
```

---

### Other Available Plugins

| Plugin                         | Purpose                             | Relevance                      |
| ------------------------------ | ----------------------------------- | ------------------------------ |
| `tauri-plugin-http`            | Rust HTTP client, bypasses CORS     | Medium - useful for API calls  |
| `tauri-plugin-os`              | Get OS info (platform, version)     | Low - can use Rust std::env    |
| `tauri-plugin-sql`             | SQLite/Postgres/MySQL from frontend | Medium - conversation storage  |
| `tauri-plugin-store`           | Key-value persistent storage        | Low - we use settings crate    |
| `tauri-plugin-global-shortcut` | System-wide keyboard shortcuts      | Medium - quick launch          |
| `tauri-plugin-autostart`       | Launch app on system startup        | Low - niche use case           |
| `tauri-plugin-process`         | Get/control current process         | Low - rarely needed            |
| `tauri-plugin-positioner`      | Position window (tray, center)      | Low - window-state covers most |

---

## Conductor Plugin Analysis

Conductor (v0.28.7) uses these plugins that Orbit doesn't:

```
tauri-plugin-http        2.4.3   → HTTP client
tauri-plugin-deep-link   2.4.0   → URL scheme handling
tauri-plugin-notification 2.3.0  → Native notifications
tauri-plugin-opener      2.2.7   → Open in external apps
tauri-plugin-os          2.3.0   → OS detection
tauri-plugin-window-state (inferred from strings)
tauri-plugin-sql         (inferred from strings)
tauri-plugin-updater     2.9.0   → Auto-updates
```

### Why Conductor bundles Node.js

Conductor bundles a 110MB Node.js runtime because:

1. `index.bundled.js` - Orchestration logic runs on Node
2. Some tools may require Node as a dependency
3. Flexibility to run arbitrary JS outside WebView sandbox

**Orbit approach:** We use Bun for agent-bridge sidecar instead, compiled to a standalone binary. This is more efficient than bundling a full Node runtime.

---

## Version Comparison

| Component           | Orbit     | Conductor | Notes                     |
| ------------------- | --------- | --------- | ------------------------- |
| Tauri               | **2.9.5** | 2.6.2     | Orbit is 3 versions ahead |
| tauri-plugin-fs     | **2.4.4** | 2.2.1     | Orbit newer               |
| tauri-plugin-shell  | **2.3.3** | 2.3.0     | Orbit newer               |
| tauri-plugin-dialog | **2.4.2** | 2.2.1     | Orbit newer               |

---

## Implementation Checklist

### Phase 1: Quick Wins

- [ ] Add `tauri-plugin-window-state` (1 hour)
- [ ] Add `tauri-plugin-notification` (2 hours)
- [ ] Add `tauri-plugin-opener` for "Reveal in Finder" (1 hour)

### Phase 2: Release Preparation

- [ ] Add `tauri-plugin-updater` (1 day)
- [ ] Set up update server or GitHub Releases
- [ ] Configure code signing

### Phase 3: Power Features

- [ ] Add `tauri-plugin-deep-link` for `orbit://` URLs
- [ ] Add `tauri-plugin-global-shortcut` for system-wide hotkey

---

## Resources

- [Tauri Plugin Documentation](https://v2.tauri.app/plugin/)
- [Tauri GitHub Releases](https://github.com/tauri-apps/tauri/releases)
- [Plugin Development Guide](https://v2.tauri.app/develop/plugins/)
