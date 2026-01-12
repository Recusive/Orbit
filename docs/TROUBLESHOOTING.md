# Troubleshooting Guide

Common issues and solutions for Orbit development.

---

## macOS App Icon Issues

### Doubled/Stacked Logo in Production Build

**Symptoms:**

- App icon shows two logos stacked on top of each other
- Only occurs in production build (`bun run build`), not dev mode (`bun run dev`)
- Visible in DMG installer and macOS Dock

**Root Cause:**
The `icon.icns` file is corrupt or was generated incorrectly, containing duplicate image layers. A normal icns should be ~600KB, but a corrupt one may be 3-4MB+.

**Diagnosis:**

```bash
# Check icns file size - should be ~600KB, not several MB
ls -la src-tauri/icons/icon.icns
```

**Solution:**
Regenerate the `icon.icns` from the PNG source files:

```bash
# Create iconset directory
mkdir -p /tmp/orbit.iconset

# Copy existing PNGs with proper naming
cp src-tauri/icons/32x32.png /tmp/orbit.iconset/icon_32x32.png
cp src-tauri/icons/64x64.png /tmp/orbit.iconset/icon_32x32@2x.png
cp src-tauri/icons/128x128.png /tmp/orbit.iconset/icon_128x128.png
cp src-tauri/icons/128x128@2x.png /tmp/orbit.iconset/icon_128x128@2x.png

# Generate missing sizes from icon.png (512x512 source)
sips -z 16 16 src-tauri/icons/icon.png --out /tmp/orbit.iconset/icon_16x16.png
sips -z 32 32 src-tauri/icons/icon.png --out /tmp/orbit.iconset/icon_16x16@2x.png
sips -z 256 256 src-tauri/icons/icon.png --out /tmp/orbit.iconset/icon_256x256.png
cp src-tauri/icons/icon.png /tmp/orbit.iconset/icon_256x256@2x.png
cp src-tauri/icons/icon.png /tmp/orbit.iconset/icon_512x512.png
sips -z 1024 1024 src-tauri/icons/icon.png --out /tmp/orbit.iconset/icon_512x512@2x.png

# Generate new icns
iconutil -c icns /tmp/orbit.iconset -o src-tauri/icons/icon.icns

# Verify size is reasonable (~600KB)
ls -la src-tauri/icons/icon.icns
```

Then rebuild: `bun run build`

**Prevention:**
When creating new app icons, always use `iconutil` or Tauri's built-in icon generator (`bunx tauri icon <source.png>`) rather than third-party tools that may embed duplicate data.

---

### macOS Icon Cache Issues

**Symptoms:**

- Old icon still showing after updating
- Icon looks corrupted or shows artifacts

**Solution:**
Clear the macOS icon cache:

```bash
# Kill Dock and Finder to refresh icons
sudo killall Dock
sudo killall Finder

# If that doesn't work, clear icon services cache
sudo rm -rf /Library/Caches/com.apple.iconservices.store
rm -rf ~/Library/Caches/com.apple.iconservices.store

# May require restart for full effect
```

---

## Build Issues

### Agent Bridge Not Updating

**Symptoms:**

- Changes to `agent-bridge/` code don't appear in the app
- Old behavior persists after code changes

**Root Cause:**
The agent-bridge is compiled to a standalone binary. Unlike frontend code, it doesn't hot-reload.

**Solution:**
Manually rebuild the sidecar:

```bash
cd agent-bridge
bun run build:dev
```

Then restart the Tauri app.

---

## WebView Rendering Issues

### Blurry Text/Elements in Tauri (macOS)

**Symptoms:**

- Text or UI elements appear fuzzy/blurry
- Only happens in Tauri app, not in browser

**Root Cause:**
Certain CSS properties cause GPU compositing issues in WKWebView:

- `backdrop-filter: blur()`
- `color-mix()` CSS function
- `transition` on hover/click states
- `animation` with `scale()`

**Solution:**
Remove or replace these properties:

- Use solid backgrounds instead of `backdrop-filter`
- Use CSS variables or `rgba()` instead of `color-mix()`
- Remove transitions from interactive elements inside transformed containers (like ReactFlow)

See `CLAUDE.md` section "Tauri WebView Blur/Rendering Issues" for detailed examples.
