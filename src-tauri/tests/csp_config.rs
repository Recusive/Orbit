//! Contract tests for packaged Tauri CSP configuration.

#[cfg(test)]
mod tests {
    use serde_json::Value;

    /// Ensures the packaged WebView allows the OpenCode loopback HTTP origin.
    /// CSP treats `localhost` and `127.0.0.1` as different origins — allowing
    /// one does NOT allow the other. The OpenCode client and Rust lifecycle
    /// code both use `127.0.0.1`, so `connect-src` must include it.
    #[test]
    fn csp_allows_opencode_loopback_origin() {
        let json = include_str!("../tauri.conf.json");
        let config: Result<Value, _> = serde_json::from_str(json);
        assert!(config.is_ok(), "tauri.conf.json is not valid JSON");

        let connect_src = config.ok().and_then(|c| {
            c.get("app")?
                .get("security")?
                .get("csp")?
                .get("connect-src")?
                .as_str()
                .map(String::from)
        });

        assert!(
            connect_src.is_some(),
            "connect-src not found in tauri.conf.json CSP config"
        );
        assert!(
            connect_src
                .as_deref()
                .is_some_and(|s| s.contains("http://127.0.0.1:*")),
            "OpenCode client and Rust lifecycle use 127.0.0.1; CSP must allow it"
        );
    }
}
