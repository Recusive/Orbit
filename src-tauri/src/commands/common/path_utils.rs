//! Shared PATH helpers for Bun-based subprocess execution.

use std::env;
use std::ffi::OsString;
use std::path::PathBuf;

/// Common Bun installation locations appended to PATH.
fn bun_candidate_paths() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    vec![
        home.join(".bun/bin"),
        home.join(".local/bin"),
        home.join(".nvm/current/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ]
}

/// Merge PATH entries with extra paths while preserving existing order.
fn merge_paths(base: Option<OsString>, extras: &[PathBuf]) -> OsString {
    let mut entries: Vec<PathBuf> = base
        .as_ref()
        .map(|value| env::split_paths(value).collect())
        .unwrap_or_default();

    for extra in extras {
        if !entries.iter().any(|existing| existing == extra) {
            entries.push(extra.clone());
        }
    }

    env::join_paths(&entries).unwrap_or_else(|_| base.unwrap_or_default())
}

/// Build an augmented PATH that includes common Bun install locations.
///
/// Desktop apps launched outside a terminal can inherit a minimal PATH.
/// This helper appends common Bun install directories so `bun`/`bunx`
/// subprocesses resolve reliably in production builds.
#[must_use]
pub(crate) fn augmented_bun_path() -> OsString {
    let base = env::var_os("PATH");
    merge_paths(base, &bun_candidate_paths())
}

#[cfg(test)]
#[expect(
    clippy::expect_used,
    reason = "expect is appropriate in tests to assert expected parsing behavior"
)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn merge_paths_appends_missing_entries() {
        let base =
            env::join_paths([PathBuf::from("/usr/bin")]).expect("base path should serialize");
        let base = Some(base);
        let merged = merge_paths(base, &[PathBuf::from("/opt/homebrew/bin")]);
        let parts: Vec<PathBuf> = env::split_paths(&merged).collect();

        assert!(parts.contains(&PathBuf::from("/usr/bin")));
        assert!(parts.contains(&PathBuf::from("/opt/homebrew/bin")));
    }

    #[test]
    fn merge_paths_deduplicates_existing_entries() {
        let base = env::join_paths([
            PathBuf::from("/usr/bin"),
            PathBuf::from("/opt/homebrew/bin"),
        ])
        .expect("base path should serialize");
        let base = Some(base);
        let merged = merge_paths(base, &[PathBuf::from("/opt/homebrew/bin")]);
        let parts: Vec<PathBuf> = env::split_paths(&merged).collect();
        let homebrew = Path::new("/opt/homebrew/bin");
        let count = parts.iter().filter(|path| **path == homebrew).count();

        assert_eq!(count, 1);
    }

    #[test]
    fn augmented_bun_path_is_non_empty_when_path_exists() {
        let augmented = augmented_bun_path();
        assert!(
            env::split_paths(&augmented).next().is_some(),
            "Augmented path should contain at least one entry"
        );
    }
}
