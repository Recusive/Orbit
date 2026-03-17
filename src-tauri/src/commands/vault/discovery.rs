//! Project document discovery and reading commands for Vault.

use std::ffi::OsStr;
use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use ignore::WalkBuilder;
use orbit_core::{Error, Result};

use super::types::{
    ContentEncoding, ProjectDocEntry, ProjectDocSource, VaultContent, DEFAULT_DISCOVERY_MAX_DEPTH,
    DEFAULT_DISCOVERY_MAX_RESULTS, MAX_DISCOVERY_RESULTS, MAX_FILE_SIZE_BYTES,
};
use super::validation::{
    is_binary_content, is_markdown_path, resolve_project_doc_path, to_unix_millis,
    to_workspace_relative_path, workspace_root_path,
};
use crate::core::sentry_utils::SentryCapture as _;

fn classify_source(relative_path: &str) -> ProjectDocSource {
    if !relative_path.contains('/') {
        return ProjectDocSource::Root;
    }

    let top_level = relative_path.split('/').next().unwrap_or_default();
    if top_level.eq_ignore_ascii_case("docs") {
        ProjectDocSource::Docs
    } else {
        ProjectDocSource::Other
    }
}

/// Discover markdown-like documents in the current workspace.
pub(crate) fn discover_project_docs_internal(
    workspace_path: &str,
    max_depth: usize,
    max_results: usize,
) -> Result<Vec<ProjectDocEntry>> {
    let workspace_root = workspace_root_path(workspace_path)?;
    let mut docs = Vec::<ProjectDocEntry>::new();

    let walker = WalkBuilder::new(&workspace_root)
        .hidden(true)
        .ignore(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .follow_links(false)
        .max_depth(Some(max_depth))
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }

            let Some(name) = entry.file_name().to_str() else {
                return true;
            };

            if name == ".orbit" {
                return false;
            }

            if name.starts_with('.') && name != ".github" {
                return false;
            }

            true
        })
        .build();

    for entry_result in walker {
        if docs.len() >= max_results {
            break;
        }

        let Ok(entry) = entry_result else {
            continue;
        };
        let path = entry.path();
        if !path.is_file() || !is_markdown_path(path) {
            continue;
        }

        let Ok(metadata) = fs::metadata(path) else {
            continue;
        };
        let modified_at = metadata.modified().map_or(0, to_unix_millis);
        let Ok(relative_path) = to_workspace_relative_path(workspace_path, path) else {
            continue;
        };
        let name = path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_owned();

        docs.push(ProjectDocEntry {
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path.clone(),
            name,
            size_bytes: metadata.len(),
            modified_at,
            source: classify_source(&relative_path),
        });
    }

    docs.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(docs)
}

/// Discover markdown-like project docs, respecting `.gitignore`.
#[tauri::command]
pub async fn vault_discover_project_docs(
    workspace_path: String,
    max_depth: Option<u32>,
    max_results: Option<u32>,
) -> Result<Vec<ProjectDocEntry>> {
    let default_depth_u32 = u32::try_from(DEFAULT_DISCOVERY_MAX_DEPTH).unwrap_or(u32::MAX);
    let requested_depth = max_depth.unwrap_or(default_depth_u32);
    let depth = usize::try_from(requested_depth).unwrap_or(DEFAULT_DISCOVERY_MAX_DEPTH);

    let default_results_u32 = u32::try_from(DEFAULT_DISCOVERY_MAX_RESULTS).unwrap_or(u32::MAX);
    let requested_results = max_results.unwrap_or(default_results_u32);
    let requested_results_usize =
        usize::try_from(requested_results).unwrap_or(DEFAULT_DISCOVERY_MAX_RESULTS);
    let bounded_results = requested_results_usize.min(MAX_DISCOVERY_RESULTS);

    discover_project_docs_internal(&workspace_path, depth, bounded_results)
        .capture("vault_discover_project_docs")
}

/// Read a markdown-like project doc from workspace scope.
#[tauri::command]
pub async fn vault_read_project_doc(
    workspace_path: String,
    absolute_path: String,
) -> Result<VaultContent> {
    let resolved = resolve_project_doc_path(&workspace_path, &absolute_path)?;
    if !resolved.is_file() {
        return Err(Error::FileNotFound(absolute_path));
    }
    if !is_markdown_path(Path::new(&resolved)) {
        return Err(Error::Other(
            "Only markdown-like files are supported".to_owned(),
        ));
    }

    let bytes = fs::read(&resolved).map_err(Error::Io)?;
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
        .map_err(|e| Error::Other(format!("Project document is not valid UTF-8: {e}")))?;
    Ok(VaultContent {
        content,
        encoding: ContentEncoding::Utf8,
        is_binary: false,
        size_bytes,
    })
}
