//! Path validation and low-level helpers for Vault commands.

use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use orbit_core::{Error, Result};

/// Resolve and validate the workspace root path.
///
/// Returns [`Error::Config`] when no workspace is provided.
pub fn workspace_root_path(workspace_path: &str) -> Result<PathBuf> {
    if workspace_path.trim().is_empty() {
        return Err(Error::Config("No workspace open".to_owned()));
    }

    let path = PathBuf::from(workspace_path);
    if !path.exists() || !path.is_dir() {
        return Err(Error::DirectoryNotFound(workspace_path.to_owned()));
    }

    path.canonicalize().map_err(Error::Io)
}

/// Return the configured Vault root path (`<workspace>/.orbit/Vault`).
pub fn vault_base_path(workspace_path: &str) -> Result<PathBuf> {
    Ok(workspace_root_path(workspace_path)?
        .join(".orbit")
        .join("Vault"))
}

/// Resolve Vault root for secure containment checks.
///
/// If Vault root exists and is a symlink, the symlink target is allowed
/// and a warning is logged.
pub fn vault_root_for_comparison(workspace_path: &str) -> Result<PathBuf> {
    let vault_root = vault_base_path(workspace_path)?;
    if !vault_root.exists() {
        return Ok(vault_root);
    }

    let metadata = fs::symlink_metadata(&vault_root).map_err(Error::Io)?;
    if metadata.file_type().is_symlink() {
        log::warn!(
            target: "orbit::vault",
            "Vault root is a symlink: {}",
            vault_root.display()
        );
    }

    vault_root.canonicalize().map_err(Error::Io)
}

/// Normalize a user-supplied relative path and reject traversal attempts.
pub fn normalize_relative_path(relative_path: &str) -> Result<PathBuf> {
    if relative_path.contains('\0') {
        return Err(Error::Other("Path contains null bytes".to_owned()));
    }

    let normalized = relative_path.replace('\\', "/");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let candidate = Path::new(trimmed);
    if candidate.is_absolute() || trimmed.starts_with('/') {
        return Err(Error::PermissionDenied(relative_path.to_owned()));
    }

    let mut clean = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::CurDir => {},
            Component::Normal(part) => clean.push(part),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(Error::PermissionDenied(relative_path.to_owned()));
            },
        }
    }

    Ok(clean)
}

fn reject_symlink_components(vault_root: &Path, relative: &Path) -> Result<()> {
    let mut current = vault_root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            continue;
        };

        current.push(part);
        if !current.exists() {
            continue;
        }

        let metadata = fs::symlink_metadata(&current).map_err(Error::Io)?;
        if metadata.file_type().is_symlink() {
            return Err(Error::PermissionDenied(
                current.to_string_lossy().into_owned(),
            ));
        }
    }
    Ok(())
}

/// Canonicalize a path while allowing missing trailing components.
///
/// Existing ancestors are canonicalized and the missing tail is appended back.
pub fn canonicalize_with_nonexistent(path: &Path) -> Result<PathBuf> {
    if path.exists() {
        return path.canonicalize().map_err(Error::Io);
    }

    let mut pending = Vec::<OsString>::new();
    let mut cursor = path.to_path_buf();

    loop {
        if cursor.exists() {
            let mut resolved = cursor.canonicalize().map_err(Error::Io)?;
            while let Some(segment) = pending.pop() {
                resolved.push(segment);
            }
            return Ok(resolved);
        }

        let Some(name) = cursor.file_name() else {
            return Err(Error::PermissionDenied(path.to_string_lossy().into_owned()));
        };
        pending.push(name.to_os_string());

        let Some(parent) = cursor.parent() else {
            return Err(Error::PermissionDenied(path.to_string_lossy().into_owned()));
        };
        cursor = parent.to_path_buf();
    }
}

/// Resolve a Vault-relative path to an absolute filesystem path with security checks.
pub fn resolve_vault_path(workspace_path: &str, relative_path: &str) -> Result<PathBuf> {
    let vault_root = vault_base_path(workspace_path)?;
    let normalized_relative = normalize_relative_path(relative_path)?;

    reject_symlink_components(&vault_root, &normalized_relative)?;

    let candidate = vault_root.join(&normalized_relative);
    let resolved = canonicalize_with_nonexistent(&candidate)?;
    let root_for_compare = vault_root_for_comparison(workspace_path)?;
    if !resolved.starts_with(&root_for_compare) {
        return Err(Error::PermissionDenied(relative_path.to_owned()));
    }

    Ok(candidate)
}

/// Resolve and validate a workspace-scoped project document path.
pub fn resolve_project_doc_path(workspace_path: &str, absolute_path: &str) -> Result<PathBuf> {
    if absolute_path.trim().is_empty() {
        return Err(Error::Other("Project document path is empty".to_owned()));
    }

    let workspace_root = workspace_root_path(workspace_path)?;
    let requested = PathBuf::from(absolute_path);
    let resolved = if requested.is_absolute() {
        requested.canonicalize().map_err(Error::Io)?
    } else {
        workspace_root
            .join(requested)
            .canonicalize()
            .map_err(Error::Io)?
    };

    if !resolved.starts_with(&workspace_root) {
        return Err(Error::PermissionDenied(absolute_path.to_owned()));
    }

    if resolved.starts_with(workspace_root.join(".orbit")) {
        return Err(Error::PermissionDenied(absolute_path.to_owned()));
    }

    Ok(resolved)
}

/// Convert an absolute path under Vault root to a normalized relative path string.
pub fn to_vault_relative_path(workspace_path: &str, absolute_path: &Path) -> Result<String> {
    let vault_root = vault_base_path(workspace_path)?;
    let relative = absolute_path.strip_prefix(&vault_root).map_err(|e| {
        log::debug!("strip_prefix failed: {e}");
        Error::PermissionDenied(absolute_path.to_string_lossy().into_owned())
    })?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

/// Convert an absolute path under workspace root to a normalized relative path string.
pub fn to_workspace_relative_path(workspace_path: &str, absolute_path: &Path) -> Result<String> {
    let workspace_root = workspace_root_path(workspace_path)?;
    let relative = absolute_path.strip_prefix(&workspace_root).map_err(|e| {
        log::debug!("strip_prefix failed: {e}");
        Error::PermissionDenied(absolute_path.to_string_lossy().into_owned())
    })?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

/// Detect likely binary content using a small sample.
#[must_use]
pub fn is_binary_content(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(8192);
    let sample = bytes.get(..sample_len).unwrap_or(bytes);
    if sample.contains(&0) {
        return true;
    }

    if sample_len == 0 {
        return false;
    }

    let non_printable = sample
        .iter()
        .filter(|&&b| b < 0x20 && b != b'\n' && b != b'\r' && b != b'\t')
        .count();
    non_printable > sample_len / 10
}

/// Check whether a path is markdown-like (`.md`, `.mdx`, `.markdown`).
#[must_use]
pub fn is_markdown_path(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);
    matches!(ext.as_deref(), Some("md" | "mdx" | "markdown"))
}

/// Convert filesystem timestamp to Unix epoch milliseconds.
#[must_use]
pub fn to_unix_millis(value: SystemTime) -> u64 {
    value.duration_since(UNIX_EPOCH).map_or(0, |duration| {
        u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
    })
}
