//! Image cache commands for chat attachment previews.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine as _};
use orbit_core::{Error, Result};
use sha2::{Digest as _, Sha256};

fn image_cache_root() -> Result<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".orbit").join("image-cache"))
        .ok_or_else(|| Error::Config(String::from("No home directory available")))
}

fn strip_data_url_prefix(base64_data: &str) -> &str {
    base64_data
        .split_once(',')
        .map_or(base64_data, |(_, payload)| payload)
}

fn short_sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    digest.get(..6).map_or_else(String::new, |bytes| {
        bytes.iter().fold(String::with_capacity(12), |mut hex, b| {
            let _ok = write!(&mut hex, "{b:02x}");
            hex
        })
    })
}

fn mime_to_extension(mime_type: &str, filename: &str) -> String {
    match mime_type {
        "image/png" => String::from("png"),
        "image/jpeg" => String::from("jpg"),
        "image/gif" => String::from("gif"),
        "image/webp" => String::from("webp"),
        "image/svg+xml" => String::from("svg"),
        "image/bmp" => String::from("bmp"),
        "image/heic" => String::from("heic"),
        "image/heif" => String::from("heif"),
        _ => Path::new(filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .filter(|ext| !ext.is_empty())
            .map_or_else(|| String::from("bin"), str::to_owned),
    }
}

/// Cache a base64-encoded image to `~/.orbit/image-cache/{session}/`.
///
/// Returns the absolute file path so the frontend can normalize it through Tauri's
/// asset protocol (`convertFileSrc`).
#[tauri::command]
pub async fn cache_image(
    session_id: String,
    filename: String,
    mime_type: String,
    base64_data: String,
) -> Result<String> {
    let cache_root = image_cache_root()?;
    let normalized_data = strip_data_url_prefix(&base64_data);
    let decoded = general_purpose::STANDARD
        .decode(normalized_data)
        .map_err(|error| Error::Config(format!("Failed to decode cached image: {error}")))?;

    let session_dir = cache_root.join(&session_id);
    fs::create_dir_all(&session_dir).map_err(Error::Io)?;

    let file_path = session_dir.join(format!(
        "{}.{}",
        short_sha256_hex(normalized_data),
        mime_to_extension(&mime_type, &filename)
    ));

    if !file_path.exists() {
        fs::write(&file_path, decoded).map_err(Error::Io)?;
    }

    Ok(file_path.to_string_lossy().into_owned())
}
