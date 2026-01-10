//! AI commands

use orbit_ai::AiManager;
use orbit_core::{ChatMessage, ChatResponse, Result};
use std::sync::OnceLock;
use tokio::sync::Mutex;

use crate::core::perf_logger::PerfSource;
use crate::perf_log;

static AI_MANAGER: OnceLock<Mutex<AiManager>> = OnceLock::new();

fn get_ai_manager() -> &'static Mutex<AiManager> {
    AI_MANAGER.get_or_init(|| Mutex::new(AiManager::new()))
}

/// Send a chat message to the AI
#[tauri::command]
pub async fn ai_chat(messages: Vec<ChatMessage>, model: Option<String>) -> Result<ChatResponse> {
    perf_log!(PerfSource::Ai, "ai_chat", {
        let manager = get_ai_manager().lock().await;
        manager.chat(messages, model.as_deref()).await
    })
}

/// Get AI code completion
#[tauri::command]
pub async fn ai_complete(prefix: String, suffix: String, language: String) -> Result<String> {
    perf_log!(PerfSource::Ai, "ai_complete", {
        let manager = get_ai_manager().lock().await;
        manager.complete(&prefix, &suffix, &language).await
    })
}

/// Stop the current AI generation
#[tauri::command]
pub async fn ai_stop() -> Result<()> {
    perf_log!(PerfSource::Ai, "ai_stop", {
        let manager = get_ai_manager().lock().await;
        manager.stop();
        Ok(())
    })
}
