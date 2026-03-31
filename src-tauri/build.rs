//! Build script for Orbit Tauri application.

use std::env;
use std::path::{Path, PathBuf};

#[expect(
    clippy::disallowed_methods,
    reason = "CARGO_CFG_* are only available at build-script runtime via std::env::var"
)]
fn target_triple() -> String {
    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| "unknown".to_owned());
    let arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| "unknown".to_owned());

    match (os.as_str(), arch.as_str()) {
        ("macos", "aarch64") => "aarch64-apple-darwin".to_owned(),
        ("macos", _) => "x86_64-apple-darwin".to_owned(),
        ("windows", "aarch64") => "aarch64-pc-windows-msvc".to_owned(),
        ("windows", _) => "x86_64-pc-windows-msvc".to_owned(),
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu".to_owned(),
        ("linux", _) => "x86_64-unknown-linux-gnu".to_owned(),
        _ => format!("{arch}-{os}"),
    }
}

fn warn_if_missing(binary_dir: &Path, base_name: &str, required: bool) {
    let binary_path = binary_dir.join(format!("{}-{}", base_name, target_triple()));
    if !binary_path.exists() {
        let severity = if required { "required" } else { "optional" };
        println!(
            "cargo:warning={} binary missing at {}",
            severity,
            binary_path.display()
        );
    }
}

fn main() {
    let binary_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    warn_if_missing(&binary_dir, "agent-bridge", true);
    warn_if_missing(&binary_dir, "claude", true);
    tauri_build::build();
}
