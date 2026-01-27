// Block DevTools keyboard shortcuts in the embedded browser.
// On macOS, WebKit shares a single Web Inspector per window — if the
// embedded browser triggers DevTools, it hijacks the inspector from the
// main webview and overlaps the entire app. The Tauri ACL also blocks
// `internal_toggle_devtools` for non-local URLs, causing unhandled
// promise rejections. This script prevents both issues.
(function() {
    document.addEventListener('keydown', function(e) {
        // Block F12
        if (e.key === 'F12') {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
        // Block Cmd+Option+I (macOS) / Ctrl+Shift+I (Windows/Linux)
        if ((e.metaKey && e.altKey && (e.key === 'i' || e.key === 'I')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
        // Block Cmd+Option+J (Chrome-style console shortcut)
        if ((e.metaKey && e.altKey && (e.key === 'j' || e.key === 'J')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'j' || e.key === 'J'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
    }, true); // Use capture phase to intercept before Tauri's handler
})();
