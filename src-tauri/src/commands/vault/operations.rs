//! Vault CRUD, context config, and unified search commands.

use std::cmp::Ordering;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use orbit_core::{Error, Result};
use serde_json::to_string_pretty;

use super::discovery::discover_project_docs_internal;
use super::types::{
    ContentEncoding, DocSource, VaultContent, VaultContextConfig, VaultEntry, VaultListResult,
    VaultSearchResult, VaultStats, WriteResult, DEFAULT_DISCOVERY_MAX_DEPTH,
    DEFAULT_DISCOVERY_MAX_RESULTS, DEFAULT_LIST_LIMIT, DEFAULT_SEARCH_MAX_RESULTS,
    MAX_FILE_SIZE_BYTES, MAX_LIST_LIMIT, MAX_SEARCH_RESULTS,
};
use super::validation::{
    is_binary_content, is_markdown_path, normalize_relative_path, resolve_vault_path,
    to_unix_millis, to_vault_relative_path, workspace_root_path,
};

const CONTEXT_CONFIG_FILE: &str = "vault-context.json";
const TEMP_FILE_EXTENSION: &str = "tmp";

fn orbit_root_path(workspace_path: &str) -> Result<PathBuf> {
    Ok(workspace_root_path(workspace_path)?.join(".orbit"))
}

fn context_config_path(workspace_path: &str) -> Result<PathBuf> {
    Ok(orbit_root_path(workspace_path)?.join(CONTEXT_CONFIG_FILE))
}

fn normalize_stored_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_entry(workspace_path: &str, absolute_path: &Path) -> Result<VaultEntry> {
    let metadata = fs::metadata(absolute_path).map_err(Error::Io)?;
    let name = absolute_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_owned();
    let path = to_vault_relative_path(workspace_path, absolute_path)?;
    let extension = absolute_path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);

    let size_bytes = if metadata.is_dir() { 0 } else { metadata.len() };
    let created_at = metadata.created().map_or(0, to_unix_millis);
    let modified_at = metadata.modified().map_or(0, to_unix_millis);

    Ok(VaultEntry {
        path,
        name,
        is_dir: metadata.is_dir(),
        size_bytes,
        created_at,
        modified_at,
        extension,
    })
}

fn load_context_config(workspace_path: &str) -> Result<VaultContextConfig> {
    let path = context_config_path(workspace_path)?;
    if !path.exists() {
        return Ok(VaultContextConfig::default());
    }

    let content = fs::read_to_string(path).map_err(Error::Io)?;
    if content.trim().is_empty() {
        return Ok(VaultContextConfig::default());
    }

    serde_json::from_str(&content).map_err(Error::Serialization)
}

fn save_context_config(workspace_path: &str, config: &VaultContextConfig) -> Result<()> {
    let path = context_config_path(workspace_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(Error::Io)?;
    }
    let content = to_string_pretty(config).map_err(Error::Serialization)?;
    fs::write(path, content).map_err(Error::Io)
}

fn update_context_paths_for_rename(
    workspace_path: &str,
    old_absolute_path: &Path,
    new_absolute_path: &Path,
) -> Result<()> {
    let mut config = load_context_config(workspace_path)?;
    if config.included_paths.is_empty() {
        return Ok(());
    }

    let old_prefix = normalize_stored_path(old_absolute_path);
    let new_prefix = normalize_stored_path(new_absolute_path);
    let old_descendant_prefix = format!("{old_prefix}/");

    let mut changed = false;
    for existing in &mut config.included_paths {
        if existing == &old_prefix {
            existing.clone_from(&new_prefix);
            changed = true;
            continue;
        }
        if existing.starts_with(&old_descendant_prefix) {
            let suffix = &existing[old_prefix.len()..];
            *existing = format!("{new_prefix}{suffix}");
            changed = true;
        }
    }

    if changed {
        let mut dedup = HashSet::<String>::new();
        config
            .included_paths
            .retain(|path| dedup.insert(path.clone()));
        save_context_config(workspace_path, &config)?;
    }

    Ok(())
}

fn prune_context_paths_for_delete(
    workspace_path: &str,
    deleted_absolute_path: &Path,
) -> Result<()> {
    let mut config = load_context_config(workspace_path)?;
    if config.included_paths.is_empty() {
        return Ok(());
    }

    let deleted_prefix = normalize_stored_path(deleted_absolute_path);
    let deleted_descendant_prefix = format!("{deleted_prefix}/");
    let original_len = config.included_paths.len();

    config
        .included_paths
        .retain(|path| path != &deleted_prefix && !path.starts_with(&deleted_descendant_prefix));

    if config.included_paths.len() != original_len {
        save_context_config(workspace_path, &config)?;
    }
    Ok(())
}

fn make_temp_path(target_path: &Path) -> PathBuf {
    let stem = target_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("vault");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let pid = process::id();
    let file_name = format!("{stem}.{pid}.{nonce}.{TEMP_FILE_EXTENSION}");
    target_path.with_file_name(file_name)
}

fn cleanup_orphan_tmp_files(root: &Path, max_age: Duration) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            cleanup_orphan_tmp_files(&path, max_age);
            continue;
        }

        let is_tmp = path
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|ext| ext.eq_ignore_ascii_case(TEMP_FILE_EXTENSION));
        if !is_tmp {
            continue;
        }

        let Ok(modified) = meta.modified() else {
            continue;
        };
        let Ok(age) = SystemTime::now().duration_since(modified) else {
            continue;
        };
        if age > max_age {
            drop(fs::remove_file(path));
        }
    }
}

fn collect_stats(path: &Path, files: &mut u32, dirs: &mut u32, total_size: &mut u64) {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return;
    };
    if metadata.file_type().is_symlink() {
        return;
    }

    if metadata.is_dir() {
        *dirs = dirs.saturating_add(1);
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            collect_stats(&entry.path(), files, dirs, total_size);
        }
    } else {
        *files = files.saturating_add(1);
        *total_size = total_size.saturating_add(metadata.len());
    }
}

#[derive(Debug, Clone)]
struct SearchCandidate {
    absolute_path: PathBuf,
    relative_path: String,
    source: DocSource,
}

fn collect_vault_markdown_candidates(workspace_path: &str) -> Result<Vec<SearchCandidate>> {
    let vault_root = workspace_root_path(workspace_path)?
        .join(".orbit")
        .join("Vault");
    if !vault_root.exists() {
        return Ok(Vec::new());
    }

    let mut candidates = Vec::<SearchCandidate>::new();
    let mut stack = vec![vault_root.clone()];

    while let Some(current_dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !is_markdown_path(&path) {
                continue;
            }

            let Ok(relative) = path.strip_prefix(&vault_root) else {
                continue;
            };
            let relative_path = relative.to_string_lossy().replace('\\', "/");
            candidates.push(SearchCandidate {
                absolute_path: path,
                relative_path,
                source: DocSource::Vault,
            });
        }
    }

    Ok(candidates)
}

fn search_in_file_set(
    candidates: &[SearchCandidate],
    query: &str,
    max_results: usize,
) -> Vec<VaultSearchResult> {
    let needle = query.to_ascii_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::<VaultSearchResult>::new();
    for candidate in candidates {
        if results.len() >= max_results {
            break;
        }

        let Ok(content) = fs::read_to_string(&candidate.absolute_path) else {
            continue;
        };
        for (index, line) in content.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }

            let line_lc = line.to_ascii_lowercase();
            if !line_lc.contains(&needle) {
                continue;
            }

            let line_number = u32::try_from(index.saturating_add(1)).unwrap_or(u32::MAX);
            results.push(VaultSearchResult {
                path: candidate.absolute_path.to_string_lossy().into_owned(),
                relative_path: candidate.relative_path.clone(),
                line_number,
                line_content: line.to_owned(),
                source: candidate.source,
            });
        }
    }

    results
}

/// Check whether `.orbit/Vault` exists for the current workspace.
#[tauri::command]
pub async fn vault_check_initialized(workspace_path: String) -> Result<bool> {
    let vault_root = workspace_root_path(&workspace_path)?
        .join(".orbit")
        .join("Vault");
    Ok(vault_root.exists() && vault_root.is_dir())
}

/// Create `.orbit/Vault` and initialize `vault-context.json` if missing.
#[tauri::command]
pub async fn vault_initialize(workspace_path: String) -> Result<()> {
    let orbit_root = orbit_root_path(&workspace_path)?;
    let vault_root = orbit_root.join("Vault");
    fs::create_dir_all(&vault_root).map_err(Error::Io)?;

    cleanup_orphan_tmp_files(&vault_root, Duration::from_secs(60));

    let config_path = orbit_root.join(CONTEXT_CONFIG_FILE);
    if !config_path.exists() {
        save_context_config(&workspace_path, &VaultContextConfig::default())?;
    }

    Ok(())
}

/// List entries under a Vault directory path.
#[tauri::command]
pub async fn vault_list(
    workspace_path: String,
    relative_path: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<VaultListResult> {
    let relative = relative_path.unwrap_or_default();
    let directory_path = resolve_vault_path(&workspace_path, &relative)?;
    if !directory_path.exists() {
        return Err(Error::DirectoryNotFound(relative));
    }
    if !directory_path.is_dir() {
        return Err(Error::DirectoryNotFound(
            directory_path.to_string_lossy().into_owned(),
        ));
    }

    let mut entries = Vec::<VaultEntry>::new();
    let iter = fs::read_dir(&directory_path).map_err(Error::Io)?;
    for entry in iter {
        let dir_entry = entry.map_err(Error::Io)?;
        let absolute_path = dir_entry.path();
        let metadata = fs::symlink_metadata(&absolute_path).map_err(Error::Io)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        entries.push(build_entry(&workspace_path, &absolute_path)?);
    }

    entries.sort_by(|left, right| match (left.is_dir, right.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => left
            .name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase()),
    });

    let total_count = u32::try_from(entries.len()).unwrap_or(u32::MAX);
    let page_offset = usize::try_from(offset.unwrap_or(0)).unwrap_or(0);
    let page_limit = limit.unwrap_or(DEFAULT_LIST_LIMIT).min(MAX_LIST_LIMIT);
    let page_limit = usize::try_from(page_limit).unwrap_or(usize::MAX);

    let start = page_offset.min(entries.len());
    let end = start.saturating_add(page_limit).min(entries.len());
    let page_entries = entries.get(start..end).unwrap_or_default().to_vec();

    Ok(VaultListResult {
        entries: page_entries,
        total_count,
        has_more: end < entries.len(),
    })
}

/// Read a Vault file.
#[tauri::command]
pub async fn vault_read(workspace_path: String, relative_path: String) -> Result<VaultContent> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    if !path.is_file() {
        return Err(Error::FileNotFound(relative_path));
    }

    let bytes = fs::read(&path).map_err(Error::Io)?;
    let size_bytes = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    if size_bytes > MAX_FILE_SIZE_BYTES {
        return Err(Error::Other(format!(
            "File exceeds size limit of {} MB",
            MAX_FILE_SIZE_BYTES / 1024 / 1024
        )));
    }

    if is_binary_content(&bytes) {
        return Ok(VaultContent {
            content: BASE64_STANDARD.encode(bytes),
            encoding: ContentEncoding::Base64,
            is_binary: true,
            size_bytes,
        });
    }

    let content = String::from_utf8(bytes)
        .map_err(|e| Error::Other(format!("File is not valid UTF-8: {e}")))?;
    Ok(VaultContent {
        content,
        encoding: ContentEncoding::Utf8,
        is_binary: false,
        size_bytes,
    })
}

/// Atomically write a Vault file with optional conflict detection.
#[tauri::command]
pub async fn vault_write(
    workspace_path: String,
    relative_path: String,
    content: String,
    expected_modified_at: Option<u64>,
    force: Option<bool>,
) -> Result<WriteResult> {
    if relative_path.trim().is_empty() {
        return Err(Error::Other("Cannot write to Vault root".to_owned()));
    }

    let force_write = force.unwrap_or(false);
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    if path.is_dir() {
        return Err(Error::Other(
            "Cannot write content to a directory".to_owned(),
        ));
    }

    if !force_write {
        if let Some(expected) = expected_modified_at {
            if path.exists() {
                let metadata = fs::metadata(&path).map_err(Error::Io)?;
                let modified_at = metadata.modified().map_or(0, to_unix_millis);
                if modified_at != expected {
                    return Err(Error::Other("File changed externally".to_owned()));
                }
            } else if expected != 0 {
                return Err(Error::Other("File changed externally".to_owned()));
            }
        }
    }

    let Some(parent) = path.parent() else {
        return Err(Error::Other("Invalid destination path".to_owned()));
    };
    fs::create_dir_all(parent).map_err(Error::Io)?;

    let temp_path = make_temp_path(&path);
    if let Err(error) = fs::write(&temp_path, content.as_bytes()) {
        return Err(Error::Io(error));
    }

    if let Err(error) = fs::rename(&temp_path, &path) {
        drop(fs::remove_file(&temp_path));
        return Err(Error::Io(error));
    }

    let metadata = fs::metadata(&path).map_err(Error::Io)?;
    let modified_at = metadata.modified().map_or(0, to_unix_millis);
    Ok(WriteResult { modified_at })
}

/// Create a Vault directory (including missing parents).
#[tauri::command]
pub async fn vault_create_directory(workspace_path: String, relative_path: String) -> Result<()> {
    let directory_path = resolve_vault_path(&workspace_path, &relative_path)?;
    fs::create_dir_all(directory_path).map_err(Error::Io)
}

/// Rename a Vault file or directory inside its current parent directory.
#[tauri::command]
pub async fn vault_rename(
    workspace_path: String,
    old_relative_path: String,
    new_name: String,
) -> Result<()> {
    if new_name.trim().is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err(Error::Other("Invalid new name".to_owned()));
    }

    let old_relative = normalize_relative_path(&old_relative_path)?;
    if old_relative.as_os_str().is_empty() {
        return Err(Error::Other("Cannot rename Vault root".to_owned()));
    }

    let old_path = resolve_vault_path(&workspace_path, &old_relative_path)?;
    if !old_path.exists() {
        return Err(Error::FileNotFound(old_relative_path));
    }

    let new_relative = old_relative
        .parent()
        .map_or_else(|| PathBuf::from(&new_name), |parent| parent.join(&new_name));
    let new_relative_str = new_relative.to_string_lossy().replace('\\', "/");
    let new_path = resolve_vault_path(&workspace_path, &new_relative_str)?;
    if new_path.exists() {
        return Err(Error::Other("Destination already exists".to_owned()));
    }

    fs::rename(&old_path, &new_path).map_err(Error::Io)?;
    update_context_paths_for_rename(&workspace_path, &old_path, &new_path)?;
    Ok(())
}

/// Move a Vault file or directory to a different Vault-relative path.
#[tauri::command]
pub async fn vault_move(
    workspace_path: String,
    from_relative_path: String,
    to_relative_path: String,
) -> Result<()> {
    let from_path = resolve_vault_path(&workspace_path, &from_relative_path)?;
    if !from_path.exists() {
        return Err(Error::FileNotFound(from_relative_path));
    }

    let to_path = resolve_vault_path(&workspace_path, &to_relative_path)?;
    if to_path.exists() {
        return Err(Error::Other("Destination already exists".to_owned()));
    }
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).map_err(Error::Io)?;
    }

    fs::rename(&from_path, &to_path).map_err(Error::Io)?;
    update_context_paths_for_rename(&workspace_path, &from_path, &to_path)?;
    Ok(())
}

/// Delete a Vault file or directory.
#[tauri::command]
pub async fn vault_delete(workspace_path: String, relative_path: String) -> Result<()> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    if !path.exists() {
        return Err(Error::FileNotFound(relative_path));
    }

    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(Error::Io)?;
    } else {
        fs::remove_file(&path).map_err(Error::Io)?;
    }
    prune_context_paths_for_delete(&workspace_path, &path)?;
    Ok(())
}

/// Check whether a Vault-relative path exists.
#[tauri::command]
pub async fn vault_exists(workspace_path: String, relative_path: String) -> Result<bool> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    Ok(path.exists())
}

/// Return metadata for a Vault entry.
#[tauri::command]
pub async fn vault_get_metadata(
    workspace_path: String,
    relative_path: String,
) -> Result<VaultEntry> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    if !path.exists() {
        return Err(Error::FileNotFound(relative_path));
    }
    build_entry(&workspace_path, &path)
}

/// Return aggregate Vault statistics.
#[tauri::command]
pub async fn vault_stats(workspace_path: String) -> Result<VaultStats> {
    let vault_root = workspace_root_path(&workspace_path)?
        .join(".orbit")
        .join("Vault");
    if !vault_root.exists() {
        return Ok(VaultStats {
            total_files: 0,
            total_dirs: 0,
            total_size_bytes: 0,
        });
    }

    let mut total_files = 0_u32;
    let mut total_dirs = 0_u32;
    let mut total_size_bytes = 0_u64;
    collect_stats(
        &vault_root,
        &mut total_files,
        &mut total_dirs,
        &mut total_size_bytes,
    );

    Ok(VaultStats {
        total_files,
        total_dirs,
        total_size_bytes,
    })
}

/// Get the saved Vault context configuration.
#[tauri::command]
pub async fn vault_get_context_config(workspace_path: String) -> Result<VaultContextConfig> {
    load_context_config(&workspace_path)
}

/// Persist Vault context configuration.
#[tauri::command]
pub async fn vault_set_context_config(
    workspace_path: String,
    config: VaultContextConfig,
) -> Result<VaultContextConfig> {
    let workspace_root = workspace_root_path(&workspace_path)?;
    let mut seen = HashSet::<String>::new();
    let mut normalized_paths = Vec::<String>::new();

    for raw_path in config.included_paths {
        if raw_path.trim().is_empty() {
            continue;
        }

        let candidate = PathBuf::from(raw_path.replace('\\', "/"));
        let absolute = if candidate.is_absolute() {
            candidate
        } else {
            resolve_vault_path(&workspace_path, &candidate.to_string_lossy())?
        };

        let canonical = if absolute.exists() {
            absolute.canonicalize().map_err(Error::Io)?
        } else {
            absolute.clone()
        };

        if !canonical.starts_with(&workspace_root) {
            continue;
        }

        let normalized = normalize_stored_path(&absolute);
        if seen.insert(normalized.clone()) {
            normalized_paths.push(normalized);
        }
    }

    let saved = VaultContextConfig {
        version: if config.version.trim().is_empty() {
            "1.0.0".to_owned()
        } else {
            config.version
        },
        included_paths: normalized_paths,
    };
    save_context_config(&workspace_path, &saved)?;
    Ok(saved)
}

/// Get context file list that currently exists on disk.
#[tauri::command]
pub async fn vault_get_context_files(workspace_path: String) -> Result<Vec<String>> {
    let config = load_context_config(&workspace_path)?;
    let files = config
        .included_paths
        .into_iter()
        .filter(|path| Path::new(path).exists())
        .collect();
    Ok(files)
}

/// Search across Vault docs and workspace project docs.
#[tauri::command]
pub async fn vault_search_all_docs(
    workspace_path: String,
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<VaultSearchResult>> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(Vec::new());
    }

    let default_search_max = u32::try_from(DEFAULT_SEARCH_MAX_RESULTS).unwrap_or(u32::MAX);
    let requested_limit = usize::try_from(max_results.unwrap_or(default_search_max))
        .unwrap_or(DEFAULT_SEARCH_MAX_RESULTS);
    let bounded_limit = requested_limit.min(MAX_SEARCH_RESULTS);

    let mut candidates = collect_vault_markdown_candidates(&workspace_path)?;
    let project_docs = discover_project_docs_internal(
        &workspace_path,
        DEFAULT_DISCOVERY_MAX_DEPTH,
        DEFAULT_DISCOVERY_MAX_RESULTS,
    )?;

    let mut seen_paths = HashSet::<String>::new();
    for candidate in &candidates {
        let key = normalize_stored_path(&candidate.absolute_path);
        let _ = seen_paths.insert(key);
    }

    for doc in project_docs {
        let absolute_path = PathBuf::from(&doc.path);
        let key = normalize_stored_path(&absolute_path);
        if !seen_paths.insert(key) {
            continue;
        }
        candidates.push(SearchCandidate {
            absolute_path,
            relative_path: doc.relative_path,
            source: DocSource::Project,
        });
    }

    Ok(search_in_file_set(
        &candidates,
        trimmed_query,
        bounded_limit,
    ))
}
