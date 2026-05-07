//! Skills marketplace commands.
//!
//! Provides read/search/install operations for the skills marketplace.

#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned arguments from JSON deserialization"
)]
#![expect(
    clippy::unreachable,
    reason = "Tauri command macro generates unreachable!() for exhaustive match arms"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]
#![expect(
    dropping_references,
    reason = "drop() suppresses -D unused-results on Command builder &mut Self returns"
)]

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hashbrown::HashMap;

use chrono::Utc;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};
use tokio::time::timeout;

use crate::commands::common::path_utils::augmented_bun_path;

const SEARCH_API_BASE: &str = "https://skills.sh/api/search";
const SEARCH_TIMEOUT_SECS: u64 = 15;
const INSTALL_TIMEOUT_SECS: u64 = 60;
const CACHE_TTL_SECS: u64 = 300;
const CACHE_MAX_ENTRIES: usize = 50;
const BROWSE_CACHE_MAX_ENTRIES: usize = 2;
const BROWSE_MAX_RESULTS: usize = 24;
const BROWSE_MAX_BODY_BYTES: usize = 512 * 1024;
const DEFAULT_LIMIT: u32 = 50;
const MIN_LIMIT: u32 = 1;
const MAX_LIMIT: u32 = 100;
const MARKETPLACE_MANIFEST_FILE: &str = "marketplace-installs.json";
const BUN_INSTALL_DOCS_URL: &str = "https://bun.sh";

/// Search result item returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkill {
    /// Full marketplace identifier (`owner/repo/skill-id`).
    pub id: String,
    /// Skill identifier within the source repository.
    pub skill_id: String,
    /// Display name.
    pub name: String,
    /// Install count reported by the marketplace.
    pub installs: u64,
    /// Source repository (`owner/repo`).
    pub source: String,
}

/// Install command result payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    /// Whether installation succeeded.
    pub success: bool,
    /// Optional error text for failed installs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Installed marketplace ID when successful.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_id: Option<String>,
    /// Optional warnings for partial-success cases.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warnings: Option<Vec<String>>,
}

impl InstallResult {
    fn success(installed_id: String, warnings: Option<Vec<String>>) -> Self {
        Self {
            success: true,
            error: None,
            installed_id: Some(installed_id),
            warnings,
        }
    }

    fn failure(error: String) -> Self {
        Self {
            success: false,
            error: Some(error),
            installed_id: None,
            warnings: None,
        }
    }
}

/// Internal install scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InstallScope {
    Project,
    Personal,
}

impl InstallScope {
    fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Personal => "personal",
        }
    }
}

/// Manifest record for installed marketplace skills.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct ManifestEntry {
    marketplace_id: String,
    skill_id: String,
    source: String,
    scope: String,
    installed_at: String,
}

/// Cached search entry with metadata.
#[derive(Debug, Clone)]
struct CacheEntry {
    results: Vec<MarketplaceSkill>,
    created_at: Instant,
    inserted_at: Instant,
}

/// Managed marketplace state shared across commands.
#[derive(Debug, Default)]
pub struct MarketplaceCache {
    search_cache: RwLock<HashMap<String, CacheEntry>>,
    browse_cache: RwLock<HashMap<String, CacheEntry>>,
    install_lock: Mutex<()>,
}

impl MarketplaceCache {
    /// Create an empty marketplace cache state.
    #[must_use]
    pub fn new() -> Self {
        Self {
            search_cache: RwLock::new(HashMap::new()),
            browse_cache: RwLock::new(HashMap::new()),
            install_lock: Mutex::new(()),
        }
    }
}

/// Raw API response wrapper used for validation before conversion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchApiResponse {
    skills: Vec<MarketplaceSkill>,
}

/// Permissive browse candidate parsed from Next.js RSC JSON chunks.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowseSkillCandidate {
    source: Option<String>,
    skill_id: Option<String>,
    name: Option<String>,
    installs: Option<u64>,
}

/// Browse category for marketplace landing results.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum BrowseCategory {
    /// Trending skills by short-term momentum.
    Trending,
    /// Top skills by all-time installs.
    Top,
}

impl BrowseCategory {
    fn url(self) -> &'static str {
        match self {
            Self::Trending => "https://skills.sh/trending",
            Self::Top => "https://skills.sh",
        }
    }

    fn cache_key(self) -> &'static str {
        match self {
            Self::Trending => "trending",
            Self::Top => "top",
        }
    }
}

fn parse_scope(scope: &str) -> Result<InstallScope, String> {
    match scope {
        "project" => Ok(InstallScope::Project),
        "personal" => Ok(InstallScope::Personal),
        _ => Err("Invalid scope: must be 'project' or 'personal'".to_owned()),
    }
}

fn validate_source(source: &str) -> Result<(), String> {
    let pattern = Regex::new("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
        .map_err(|err| format!("Internal source validation error: {err}"))?;

    if pattern.is_match(source) {
        Ok(())
    } else {
        Err("Invalid source: expected owner/repo".to_owned())
    }
}

fn validate_skill_id(skill_id: &str) -> Result<(), String> {
    let pattern = Regex::new("^[A-Za-z0-9_.-]+$")
        .map_err(|err| format!("Internal skillId validation error: {err}"))?;

    if pattern.is_match(skill_id) {
        Ok(())
    } else {
        Err(
            "Invalid skillId: only letters, numbers, underscores, dots, and hyphens are allowed"
                .to_owned(),
        )
    }
}

fn clamp_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(MIN_LIMIT, MAX_LIMIT)
}

fn cache_key(query: &str, limit: u32) -> String {
    format!("{query}:{limit}")
}

fn remove_expired_cache_entries(entries: &mut HashMap<String, CacheEntry>) {
    let ttl = Duration::from_secs(CACHE_TTL_SECS);
    entries.retain(|_, entry| entry.created_at.elapsed() <= ttl);
}

fn evict_oldest_cache_entry(entries: &mut HashMap<String, CacheEntry>) {
    let oldest_key = entries
        .iter()
        .min_by_key(|(_, entry)| entry.inserted_at)
        .map(|(key, _)| key.clone());

    if let Some(key) = oldest_key {
        let _ = entries.remove(&key);
    }
}

fn insert_cache_entry(
    entries: &mut HashMap<String, CacheEntry>,
    key: String,
    results: Vec<MarketplaceSkill>,
    max_entries: usize,
) {
    remove_expired_cache_entries(entries);

    if !entries.contains_key(&key) && entries.len() >= max_entries {
        evict_oldest_cache_entry(entries);
    }

    let now = Instant::now();
    drop(entries.insert(
        key,
        CacheEntry {
            results,
            created_at: now,
            inserted_at: now,
        },
    ));
}

fn create_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(SEARCH_TIMEOUT_SECS))
        .build()
        .map_err(|err| format!("Failed to create HTTP client: {err}"))
}

fn ensure_search_payload_shape(raw: &serde_json::Value) -> Result<(), String> {
    let Some(results) = raw.get("skills") else {
        return Err("Marketplace response missing 'skills' field".to_owned());
    };

    let Some(results_array) = results.as_array() else {
        return Err("Marketplace response field 'results' is not an array".to_owned());
    };

    for (index, item) in results_array.iter().enumerate() {
        let Some(obj) = item.as_object() else {
            return Err(format!(
                "Marketplace response item at index {index} is not an object"
            ));
        };

        let required_keys = ["id", "skillId", "name", "installs", "source"];
        for key in required_keys {
            if !obj.contains_key(key) {
                return Err(format!(
                    "Marketplace response item at index {index} missing '{key}' field"
                ));
            }
        }
    }

    Ok(())
}

fn parse_search_response(body: &str) -> Result<Vec<MarketplaceSkill>, String> {
    let raw: serde_json::Value =
        serde_json::from_str(body).map_err(|err| format!("Invalid marketplace JSON: {err}"))?;
    ensure_search_payload_shape(&raw)?;

    let parsed: SearchApiResponse = serde_json::from_value(raw)
        .map_err(|err| format!("Malformed marketplace payload: {err}"))?;
    Ok(parsed.skills)
}

fn parse_browse_candidate(candidate: &str) -> Option<BrowseSkillCandidate> {
    if let Ok(parsed) = serde_json::from_str::<BrowseSkillCandidate>(candidate) {
        return Some(parsed);
    }

    if candidate.contains("\\\"") {
        let unescaped = candidate.replace("\\\"", "\"");
        if let Ok(parsed) = serde_json::from_str::<BrowseSkillCandidate>(&unescaped) {
            return Some(parsed);
        }
    }

    None
}

fn parse_browse_page(body: &str) -> Result<Vec<MarketplaceSkill>, String> {
    if body.len() > BROWSE_MAX_BODY_BYTES {
        return Err("Response from skills.sh exceeds size limit".to_owned());
    }

    let has_skill_id_marker = body.contains("\"skillId\"") || body.contains("\\\"skillId\\\"");
    if body.len() > 100 && !has_skill_id_marker {
        return Err("Unexpected response from skills.sh".to_owned());
    }

    let mut results = Vec::new();
    let mut seen = HashSet::new();

    // Anchor on "skillId" markers and extract the nearest enclosing {…}.
    // This is O(n), works at any nesting depth, and directly targets skill
    // objects regardless of surrounding HTML/JS structure.
    for (pos, _) in body.match_indices("skillId") {
        if results.len() >= BROWSE_MAX_RESULTS {
            break;
        }

        let Some(open) = body[..pos].rfind('{') else {
            continue;
        };
        let Some(close_rel) = body[pos..].find('}') else {
            continue;
        };
        let close = pos + close_rel;

        let candidate = &body[open..=close];
        if let Some(parsed) = parse_browse_candidate(candidate) {
            let (Some(source), Some(skill_id), Some(name), Some(installs)) =
                (parsed.source, parsed.skill_id, parsed.name, parsed.installs)
            else {
                continue;
            };

            let id = format!("{source}/{skill_id}");
            if seen.insert(id.clone()) {
                results.push(MarketplaceSkill {
                    id,
                    skill_id,
                    name,
                    installs,
                    source,
                });
            }
        }
    }

    if !body.trim().is_empty() && results.is_empty() {
        log::warn!("skills_marketplace_browse parsed zero candidates from non-empty body");
    }

    Ok(results)
}

fn project_manifest_path(workspace_path: &Path) -> PathBuf {
    workspace_path
        .join(".claude")
        .join(MARKETPLACE_MANIFEST_FILE)
}

fn personal_manifest_path() -> Result<PathBuf, String> {
    let Some(home) = dirs::home_dir() else {
        return Err("Failed to resolve home directory".to_owned());
    };
    Ok(home.join(".claude").join(MARKETPLACE_MANIFEST_FILE))
}

fn manifest_path_for_scope(
    scope: InstallScope,
    workspace_path: Option<&Path>,
) -> Result<PathBuf, String> {
    match scope {
        InstallScope::Project => {
            let Some(workspace) = workspace_path else {
                return Err("Project installs require an open workspace".to_owned());
            };
            Ok(project_manifest_path(workspace))
        },
        InstallScope::Personal => personal_manifest_path(),
    }
}

fn read_manifest_entries(manifest_path: &Path) -> Result<Vec<ManifestEntry>, String> {
    if !manifest_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(manifest_path).map_err(|err| {
        format!(
            "Failed to read manifest '{}': {err}",
            manifest_path.display()
        )
    })?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    match serde_json::from_str::<Vec<ManifestEntry>>(&content) {
        Ok(entries) => Ok(entries),
        Err(err) => {
            log::warn!(
                "Failed to parse marketplace install manifest '{}': {err}",
                manifest_path.display()
            );
            Ok(Vec::new())
        },
    }
}

fn unique_temp_manifest_path(manifest_path: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());

    let file_name = format!("{MARKETPLACE_MANIFEST_FILE}.{nanos}.tmp");
    manifest_path.with_file_name(file_name)
}

fn write_manifest_entries(manifest_path: &Path, entries: &[ManifestEntry]) -> Result<(), String> {
    let Some(parent_dir) = manifest_path.parent() else {
        return Err(format!(
            "Invalid manifest path without parent: {}",
            manifest_path.display()
        ));
    };

    fs::create_dir_all(parent_dir).map_err(|err| {
        format!(
            "Failed to create manifest directory '{}': {err}",
            parent_dir.display()
        )
    })?;

    let temp_path = unique_temp_manifest_path(manifest_path);
    let serialized = serde_json::to_vec_pretty(entries)
        .map_err(|err| format!("Failed to serialize marketplace manifest: {err}"))?;

    fs::write(&temp_path, serialized).map_err(|err| {
        format!(
            "Failed to write temporary manifest '{}': {err}",
            temp_path.display()
        )
    })?;

    #[cfg(windows)]
    {
        match fs::remove_file(manifest_path) {
            Ok(()) => {},
            Err(err) if err.kind() == io::ErrorKind::NotFound => {},
            Err(err) => {
                let _ = fs::remove_file(&temp_path);
                return Err(format!(
                    "Failed to replace manifest '{}': {err}",
                    manifest_path.display()
                ));
            },
        }
    }

    fs::rename(&temp_path, manifest_path).map_err(|err| {
        let _ = fs::remove_file(&temp_path);
        format!(
            "Failed to replace manifest '{}': {err}",
            manifest_path.display()
        )
    })?;

    Ok(())
}

fn upsert_manifest_entry(manifest_path: &Path, entry: ManifestEntry) -> Result<(), String> {
    let mut entries = read_manifest_entries(manifest_path)?;

    if let Some(existing) = entries
        .iter_mut()
        .find(|current| current.marketplace_id == entry.marketplace_id)
    {
        *existing = entry;
    } else {
        entries.push(entry);
    }

    write_manifest_entries(manifest_path, &entries)
}

fn workspace_dir_from_input(
    scope: InstallScope,
    workspace_path: Option<String>,
) -> Result<Option<PathBuf>, String> {
    if scope != InstallScope::Project {
        return Ok(None);
    }

    let Some(path) = workspace_path else {
        return Err("Project installs require a workspace path".to_owned());
    };

    let workspace_dir = PathBuf::from(path);
    if !workspace_dir.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            workspace_dir.display()
        ));
    }
    if !workspace_dir.is_dir() {
        return Err(format!(
            "Workspace path is not a directory: {}",
            workspace_dir.display()
        ));
    }

    Ok(Some(workspace_dir))
}

fn build_installed_marketplace_id(source: &str, skill_id: &str) -> String {
    format!("{source}/{skill_id}")
}

fn install_command_error(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::NotFound {
        format!("bunx not found. Install Bun: {BUN_INSTALL_DOCS_URL}")
    } else {
        format!("Failed to run bunx: {error}")
    }
}

fn output_error_message(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if !stderr.is_empty() {
        return stderr;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if !stdout.is_empty() {
        return stdout;
    }

    format!("Install command failed with status {}", output.status)
}

/// Search marketplace skills via skills.sh API.
#[tauri::command]
pub async fn skills_marketplace_search(
    cache: State<'_, MarketplaceCache>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Ok(Vec::new());
    }

    let normalized_limit = clamp_limit(limit);
    let key = cache_key(&query, normalized_limit);

    {
        let read_guard = cache.search_cache.read().await;
        if let Some(entry) = read_guard.get(&key) {
            if entry.created_at.elapsed() <= Duration::from_secs(CACHE_TTL_SECS) {
                return Ok(entry.results.clone());
            }
        }
    }

    let client = create_http_client()?;
    let encoded_query = urlencoding::encode(&query);
    let url = format!("{SEARCH_API_BASE}?q={encoded_query}&limit={normalized_limit}");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Marketplace request failed: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Marketplace request failed with HTTP {}",
            response.status()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read marketplace response body: {err}"))?;
    let parsed_results = parse_search_response(&body)?;

    {
        let mut write_guard = cache.search_cache.write().await;
        insert_cache_entry(
            &mut write_guard,
            key,
            parsed_results.clone(),
            CACHE_MAX_ENTRIES,
        );
    }

    Ok(parsed_results)
}

/// Browse marketplace skills from the landing categories.
#[tauri::command]
pub async fn skills_marketplace_browse(
    cache: State<'_, MarketplaceCache>,
    category: BrowseCategory,
) -> Result<Vec<MarketplaceSkill>, String> {
    let cache_key = category.cache_key().to_owned();

    {
        let read_guard = cache.browse_cache.read().await;
        if let Some(entry) = read_guard.get(&cache_key) {
            if entry.created_at.elapsed() <= Duration::from_secs(CACHE_TTL_SECS) {
                return Ok(entry.results.clone());
            }
        }
    }

    let client = create_http_client()?;
    let response = client
        .get(category.url())
        .send()
        .await
        .map_err(|err| format!("Marketplace browse request failed: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Marketplace browse request failed with HTTP {}",
            response.status()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read marketplace browse response body: {err}"))?;
    let mut parsed_results = parse_browse_page(&body)?;
    if parsed_results.len() > BROWSE_MAX_RESULTS {
        parsed_results.truncate(BROWSE_MAX_RESULTS);
    }

    {
        let mut write_guard = cache.browse_cache.write().await;
        insert_cache_entry(
            &mut write_guard,
            cache_key,
            parsed_results.clone(),
            BROWSE_CACHE_MAX_ENTRIES,
        );
    }

    Ok(parsed_results)
}

/// Install a marketplace skill using `bunx skills add`.
#[tauri::command]
pub async fn skills_marketplace_install(
    cache: State<'_, MarketplaceCache>,
    source: String,
    skill_id: String,
    scope: String,
    workspace_path: Option<String>,
) -> Result<InstallResult, String> {
    validate_source(&source)?;
    validate_skill_id(&skill_id)?;
    let parsed_scope = parse_scope(&scope)?;
    let workspace_dir = workspace_dir_from_input(parsed_scope, workspace_path)?;
    let marketplace_id = build_installed_marketplace_id(&source, &skill_id);
    let _install_guard = cache.install_lock.lock().await;

    let mut command = Command::new("bunx");
    drop(
        command
            .arg("skills")
            .arg("add")
            .arg(&source)
            .arg("--skill")
            .arg(&skill_id)
            .arg("-a")
            .arg("claude-code")
            .arg("-y")
            .env("PATH", augmented_bun_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()),
    );

    if parsed_scope == InstallScope::Personal {
        drop(command.arg("-g"));
    }

    if let Some(workspace_dir_path) = workspace_dir.as_ref() {
        drop(command.current_dir(workspace_dir_path));
    }

    let timed_output = timeout(Duration::from_secs(INSTALL_TIMEOUT_SECS), command.output()).await;

    let output = match timed_output {
        Ok(Ok(output)) => output,
        Ok(Err(err)) => return Ok(InstallResult::failure(install_command_error(err))),
        Err(_) => {
            return Ok(InstallResult::failure(format!(
                "Install timed out after {INSTALL_TIMEOUT_SECS} seconds"
            )))
        },
    };

    if !output.status.success() {
        return Ok(InstallResult::failure(output_error_message(&output)));
    }

    let manifest_path = manifest_path_for_scope(parsed_scope, workspace_dir.as_deref())?;
    let entry = ManifestEntry {
        marketplace_id: marketplace_id.clone(),
        skill_id,
        source,
        scope: parsed_scope.as_str().to_owned(),
        installed_at: Utc::now().to_rfc3339(),
    };

    let warnings = match upsert_manifest_entry(&manifest_path, entry) {
        Ok(()) => None,
        Err(err) => Some(vec![format!(
            "Skill installed but manifest update failed: {err}"
        )]),
    };

    Ok(InstallResult::success(marketplace_id, warnings))
}

/// Return marketplace IDs marked installed in project and personal manifests.
#[tauri::command]
pub async fn skills_marketplace_installed(
    workspace_path: Option<String>,
) -> Result<Vec<String>, String> {
    let mut ids = Vec::<String>::new();

    if let Some(workspace) = workspace_path {
        let workspace_path_ref = PathBuf::from(workspace);
        if workspace_path_ref.exists() && workspace_path_ref.is_dir() {
            let project_manifest = project_manifest_path(&workspace_path_ref);
            ids.extend(
                read_manifest_entries(&project_manifest)?
                    .into_iter()
                    .map(|entry| entry.marketplace_id),
            );
        }
    }

    let personal_manifest = personal_manifest_path()?;
    ids.extend(
        read_manifest_entries(&personal_manifest)?
            .into_iter()
            .map(|entry| entry.marketplace_id),
    );

    let mut deduped = HashSet::new();
    let mut unique_ids = Vec::new();
    for id in ids {
        if deduped.insert(id.clone()) {
            unique_ids.push(id);
        }
    }
    unique_ids.sort_unstable();

    Ok(unique_ids)
}

#[cfg(test)]
#[expect(
    clippy::expect_used,
    reason = "expect is appropriate in tests for assertions and setup"
)]
mod tests {
    use super::*;

    #[test]
    fn parse_scope_accepts_valid_values() {
        assert_eq!(parse_scope("project"), Ok(InstallScope::Project));
        assert_eq!(parse_scope("personal"), Ok(InstallScope::Personal));
    }

    #[test]
    fn parse_scope_rejects_invalid_values() {
        let _ = parse_scope("global").expect_err("global should be rejected");
    }

    #[test]
    fn validate_source_enforces_owner_repo_format() {
        validate_source("owner/repo").expect("owner/repo should be valid");
        let _ = validate_source("owner").expect_err("bare owner should be rejected");
        let _ = validate_source("owner/repo/extra").expect_err("extra segment should be rejected");
    }

    #[test]
    fn validate_skill_id_enforces_allowed_characters() {
        validate_skill_id("my-skill_1.2").expect("alphanumeric with dots/hyphens should be valid");
        let _ = validate_skill_id("skill with spaces").expect_err("spaces should be rejected");
        let _ = validate_skill_id("skill/with/slash").expect_err("slashes should be rejected");
    }

    #[test]
    fn clamp_limit_bounds_values() {
        assert_eq!(clamp_limit(None), DEFAULT_LIMIT);
        assert_eq!(clamp_limit(Some(0)), MIN_LIMIT);
        assert_eq!(clamp_limit(Some(10_000)), MAX_LIMIT);
        assert_eq!(clamp_limit(Some(25)), 25);
    }

    #[test]
    fn cache_eviction_removes_oldest_entry_when_full() {
        let mut entries = HashMap::new();
        for index in 0..CACHE_MAX_ENTRIES {
            insert_cache_entry(
                &mut entries,
                format!("k{index}"),
                vec![MarketplaceSkill {
                    id: format!("id-{index}"),
                    skill_id: format!("skill-{index}"),
                    name: format!("Skill {index}"),
                    installs: 0,
                    source: "owner/repo".to_owned(),
                }],
                CACHE_MAX_ENTRIES,
            );
        }

        insert_cache_entry(
            &mut entries,
            "new-key".to_owned(),
            vec![MarketplaceSkill {
                id: "id-new".to_owned(),
                skill_id: "skill-new".to_owned(),
                name: "New Skill".to_owned(),
                installs: 1,
                source: "owner/repo".to_owned(),
            }],
            CACHE_MAX_ENTRIES,
        );

        assert_eq!(entries.len(), CACHE_MAX_ENTRIES);
        assert!(entries.contains_key("new-key"));
    }

    #[test]
    fn parse_search_response_rejects_malformed_payload() {
        let payload = r#"{"skills":[{"id":"x"}]}"#;
        let _ = parse_search_response(payload).expect_err("missing required fields should fail");
    }

    #[test]
    fn parse_search_response_accepts_valid_payload() {
        let payload = r#"{
          "skills": [
            {
              "id": "owner/repo/skill",
              "skillId": "skill",
              "name": "skill",
              "installs": 10,
              "source": "owner/repo"
            }
          ]
        }"#;

        let parsed = parse_search_response(payload).expect("response should parse");
        assert_eq!(parsed.len(), 1);
        let first = parsed.first().expect("should have at least one result");
        assert_eq!(first.skill_id, "skill");
    }

    #[test]
    fn parse_browse_page_accepts_expected_order() {
        let body = r#"
          <html>
            <script>
              self.__next_f.push([1,"{\"source\":\"owner/repo\",\"skillId\":\"skill-a\",\"name\":\"Skill A\",\"installs\":101}"]);
            </script>
          </html>
        "#;

        let parsed = parse_browse_page(body).expect("browse page should parse");
        assert_eq!(parsed.len(), 1);
        let first = parsed
            .first()
            .expect("should have at least one browse result");
        assert_eq!(first.id, "owner/repo/skill-a");
        assert_eq!(first.installs, 101);
    }

    #[test]
    fn parse_browse_page_accepts_reordered_fields() {
        let body = r#"
          <html>
            <script>
              self.__next_f.push([1,"{\"name\":\"Skill A\",\"installs\":101,\"skillId\":\"skill-a\",\"source\":\"owner/repo\"}"]);
            </script>
          </html>
        "#;

        let parsed =
            parse_browse_page(body).expect("browse page should parse with reordered fields");
        assert_eq!(parsed.len(), 1);
        let first = parsed
            .first()
            .expect("should have at least one browse result");
        assert_eq!(first.skill_id, "skill-a");
    }

    #[test]
    fn parse_browse_page_accepts_extra_fields() {
        let body = r#"
          <html>
            <script>
              self.__next_f.push([1,"{\"source\":\"owner/repo\",\"skillId\":\"skill-a\",\"name\":\"Skill A\",\"installs\":101,\"description\":\"extra\"}"]);
            </script>
          </html>
        "#;

        let parsed = parse_browse_page(body).expect("browse page should parse with extra fields");
        assert_eq!(parsed.len(), 1);
    }

    #[test]
    fn parse_browse_page_returns_empty_for_no_skill_objects() {
        let body = "<html><body>no skills here</body></html>";
        let parsed = parse_browse_page(body).expect("no-skill page should parse to empty");
        assert!(parsed.is_empty());
    }

    #[test]
    fn parse_browse_page_deduplicates_matching_ids() {
        let body = r#"
          <html>
            <script>
              self.__next_f.push([1,"{\"source\":\"owner/repo\",\"skillId\":\"skill-a\",\"name\":\"Skill A\",\"installs\":101}"]);
              self.__next_f.push([1,"{\"source\":\"owner/repo\",\"skillId\":\"skill-a\",\"name\":\"Skill A\",\"installs\":101}"]);
            </script>
          </html>
        "#;

        let parsed = parse_browse_page(body).expect("duplicate browse entries should parse");
        assert_eq!(parsed.len(), 1);
    }

    #[test]
    fn parse_browse_page_rejects_unexpected_response_shape() {
        let body = "x".repeat(120);
        let error = parse_browse_page(&body).expect_err("invalid browse response should fail");
        assert_eq!(error, "Unexpected response from skills.sh");
    }

    #[test]
    fn parse_browse_page_rejects_oversized_body() {
        let body = "a".repeat(BROWSE_MAX_BODY_BYTES + 1);
        let error = parse_browse_page(&body).expect_err("oversized browse response should fail");
        assert_eq!(error, "Response from skills.sh exceeds size limit");
    }

    #[test]
    fn parse_browse_page_handles_brace_heavy_pages_without_skills() {
        let mut body = String::from("\"skillId\"");
        for _ in 0_i32..3000_i32 {
            body.push_str("{}");
        }

        let parsed = parse_browse_page(&body).expect("brace-heavy pages should return empty data");
        assert!(parsed.is_empty());
    }

    #[test]
    fn parse_browse_page_reaches_skill_payload_after_many_non_matching_objects() {
        let mut body = String::from("\"skillId\"");
        for _ in 0_i32..100_i32 {
            body.push_str("{}");
        }
        body.push_str(
            r#"{"source":"owner/repo","skillId":"skill-a","name":"Skill A","installs":1}"#,
        );

        let parsed =
            parse_browse_page(&body).expect("parser should reach valid skill payload candidates");
        assert_eq!(parsed.len(), 1);
        let first = parsed
            .first()
            .expect("parsed list should contain the valid skill payload");
        assert_eq!(first.skill_id, "skill-a");
    }

    #[test]
    fn parse_browse_page_extracts_nested_skills_from_rsc_payload() {
        // Simulates real skills.sh RSC structure: skill objects nested inside
        // {"initialSkills":[...]} with escaped quotes (\"...\").
        let body = concat!(
            "<html><script>self.__next_f.push([1,\"",
            r#"16:[\"$\",\"$L1e\",null,{\"initialSkills\":["#,
            r#"{\"source\":\"owner/repo\",\"skillId\":\"skill-a\",\"name\":\"Skill A\",\"installs\":100},"#,
            r#"{\"source\":\"owner/repo\",\"skillId\":\"skill-b\",\"name\":\"Skill B\",\"installs\":200}"#,
            r#"]}]"#,
            "\"])</script></html>",
        );

        let parsed = parse_browse_page(body).expect("nested RSC skill objects should parse");
        assert_eq!(parsed.len(), 2);
        let first = parsed.first().expect("should have first skill");
        let second = parsed.get(1).expect("should have second skill");
        assert_eq!(first.skill_id, "skill-a");
        assert_eq!(second.skill_id, "skill-b");
    }

    #[test]
    fn corrupted_manifest_reads_as_empty() {
        let temp_dir = tempfile::tempdir().expect("temp dir should be created");
        let manifest_path = temp_dir.path().join(MARKETPLACE_MANIFEST_FILE);
        fs::write(&manifest_path, "{invalid json").expect("manifest should be written");

        let entries = read_manifest_entries(&manifest_path).expect("read should not fail");
        assert!(entries.is_empty());
    }

    #[test]
    fn manifest_write_creates_and_overwrites_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir should be created");
        let manifest_path = temp_dir.path().join(MARKETPLACE_MANIFEST_FILE);

        let first = vec![ManifestEntry {
            marketplace_id: "owner/repo/a".to_owned(),
            skill_id: "a".to_owned(),
            source: "owner/repo".to_owned(),
            scope: "project".to_owned(),
            installed_at: "2026-01-01T00:00:00Z".to_owned(),
        }];
        write_manifest_entries(&manifest_path, &first).expect("first write should succeed");

        let second = vec![ManifestEntry {
            marketplace_id: "owner/repo/b".to_owned(),
            skill_id: "b".to_owned(),
            source: "owner/repo".to_owned(),
            scope: "project".to_owned(),
            installed_at: "2026-01-01T00:00:01Z".to_owned(),
        }];
        write_manifest_entries(&manifest_path, &second).expect("second write should succeed");

        let entries = read_manifest_entries(&manifest_path).expect("manifest should be readable");
        assert_eq!(entries, second);
    }
}
