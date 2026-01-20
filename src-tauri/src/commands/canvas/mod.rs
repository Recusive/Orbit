//! Canvas-specific commands
//!
//! Commands for canvas session management, setup, component operations,
//! and the Vite-based preview server.

pub mod download;
pub mod lifecycle;
pub mod persist;
pub mod preview;
pub mod save;
pub mod setup;
pub mod transform;

#[cfg(test)]
mod tests;

// Re-export commonly used items
pub use download::{
    canvas_download_all_components, canvas_download_component, canvas_download_utils,
};
pub use lifecycle::{
    canvas_create_session, canvas_delete_session, canvas_interrupt, canvas_send_message,
    canvas_tool_response,
};
pub use persist::{
    canvas_get_component_path, canvas_get_file_hash, canvas_get_globals_path, canvas_list_backups,
    canvas_read_component_source, canvas_read_file, canvas_restore_backup,
    canvas_write_component_source, canvas_write_file,
};
pub use preview::{
    canvas_install_preview_deps, canvas_preview_server_status, canvas_setup_preview_server,
    canvas_start_preview_server, canvas_stop_preview_server, PreviewServerState,
};
pub use save::{canvas_export_component, canvas_save_custom_component};
pub use setup::{
    canvas_check_port_available, canvas_check_setup, canvas_get_download_state,
    canvas_get_orbit_path, canvas_get_registry, canvas_initialize_directories, canvas_mark_ready,
    canvas_reset_setup, canvas_resume_download, canvas_save_registry,
};
pub use transform::canvas_persist_styles;
