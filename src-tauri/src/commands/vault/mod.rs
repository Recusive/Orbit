//! Vault commands.
//!
//! Provides CRUD operations for `.orbit/Vault`, project document discovery,
//! and unified document search.

pub mod discovery;
pub mod operations;
pub mod types;
pub mod validation;

pub use discovery::{vault_discover_project_docs, vault_read_project_doc};
pub use operations::{
    vault_check_initialized, vault_create_directory, vault_delete, vault_exists,
    vault_get_context_config, vault_get_context_files, vault_get_metadata, vault_initialize,
    vault_list, vault_move, vault_read, vault_rename, vault_search_all_docs,
    vault_set_context_config, vault_stats, vault_write,
};
