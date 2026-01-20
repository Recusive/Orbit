//! Utility modules for the Orbit Tauri backend.
//!
//! Contains shared helpers for path resolution, validation, and other
//! cross-cutting concerns.

pub mod paths;

// Re-export commonly used items
pub use paths::{
    get_component_path, get_orbit_canvas_path, get_orbit_canvas_path_test, validate_component_name,
    validate_component_type,
};
