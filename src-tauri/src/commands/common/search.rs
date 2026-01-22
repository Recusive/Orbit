//! Search commands
//!
//! Errors are captured to Sentry for monitoring via the `SentryCapture` trait.

use orbit_core::{Result, SearchOptions, SearchResult, TextSearchResult};
use orbit_search::SearchManager;
use std::sync::OnceLock;

use crate::core::sentry_utils::SentryCapture as _;

static SEARCH_MANAGER: OnceLock<SearchManager> = OnceLock::new();

fn get_search_manager() -> &'static SearchManager {
    SEARCH_MANAGER.get_or_init(SearchManager::new)
}

/// Search for files matching a query
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command with many optional params"
)]
pub async fn search_files(
    root_path: String,
    query: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    regex: Option<bool>,
    include: Option<Vec<String>>,
    exclude: Option<Vec<String>>,
    max_results: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let options = SearchOptions {
        case_sensitive,
        whole_word,
        regex,
        include,
        exclude,
        max_results,
    };
    get_search_manager()
        .search_files(&root_path, &query, Some(options))
        .await
        .capture("search_files")
}

/// Search for text within files
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command with many optional params"
)]
pub async fn search_text(
    root_path: String,
    pattern: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    regex: Option<bool>,
    include: Option<Vec<String>>,
    exclude: Option<Vec<String>>,
    max_results: Option<u32>,
) -> Result<Vec<TextSearchResult>> {
    let options = SearchOptions {
        case_sensitive,
        whole_word,
        regex,
        include,
        exclude,
        max_results,
    };
    get_search_manager()
        .search_text(&root_path, &pattern, Some(options))
        .await
        .capture("search_text")
}
