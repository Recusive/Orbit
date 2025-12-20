//! Search commands

use snowflake_core::{Result, SearchOptions, SearchResult, TextSearchResult};
use snowflake_search::SearchManager;
use std::sync::OnceLock;

static SEARCH_MANAGER: OnceLock<SearchManager> = OnceLock::new();

fn get_search_manager() -> &'static SearchManager {
    SEARCH_MANAGER.get_or_init(SearchManager::new)
}

#[tauri::command]
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
}

#[tauri::command]
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
}
