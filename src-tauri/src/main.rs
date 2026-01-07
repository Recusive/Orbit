//! Orbit - Modern AI-powered code editor
//!
//! Main entry point for the Tauri desktop application.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    orbit_app_lib::run();
}
