//! Canvas commands test module
//!
//! Tests for canvas-specific Tauri commands.
//!
//! Run with: `cargo test -p orbit-app canvas`
//!
//! NOTE: These are unit tests that mock the SessionManager.
//! Integration tests with real Claude SDK are in agent-bridge.

// Allow test-specific patterns (expect/panic are valid in tests)
#![expect(
    clippy::expect_used,
    clippy::panic,
    reason = "expect_used and panic are idiomatic in unit tests for unwrapping expected values"
)]

use crate::agent::protocol::{
    CanvasEdge, CanvasNode, CanvasPosition, CanvasSessionConfig, CanvasState, SandpackNodeData,
};

// ============================================================================
// Type Serialization Tests
// ============================================================================

mod canvas_types {
    use super::*;

    #[test]
    fn test_canvas_state_serialization() {
        let state = CanvasState {
            nodes: vec![CanvasNode::Sandpack {
                id: "test-node-1".to_owned(),
                position: CanvasPosition { x: 100.0, y: 200.0 },
                data: SandpackNodeData {
                    name: "TestButton".to_owned(),
                    code: "export default function TestButton() { return <button>Test</button>; }"
                        .to_owned(),
                    error: None,
                    is_loading: None,
                },
            }],
            edges: vec![],
            selected_node_id: Some("test-node-1".to_owned()),
            selected_node_type: None,
        };

        let json = serde_json::to_string(&state);
        assert!(json.is_ok(), "Canvas state should serialize to JSON");

        let json_str = json.expect("Serialization should succeed");
        assert!(
            json_str.contains("test-node-1"),
            "JSON should contain node id"
        );
        assert!(
            json_str.contains("TestButton"),
            "JSON should contain node name"
        );
    }

    #[test]
    fn test_canvas_state_deserialization() {
        let json = r#"{
            "nodes": [{
                "type": "sandpack",
                "id": "node-1",
                "position": {"x": 50, "y": 100},
                "data": {
                    "name": "Button",
                    "code": "export default () => <button>Click</button>"
                }
            }],
            "edges": [],
            "selectedNodeId": "node-1"
        }"#;

        let state: Result<CanvasState, _> = serde_json::from_str(json);
        assert!(
            state.is_ok(),
            "Canvas state should deserialize from JSON: {:?}",
            state.err()
        );

        let state = state.expect("Deserialization should succeed");
        assert_eq!(state.nodes.len(), 1, "Should have one node");
        assert_eq!(
            state.selected_node_id,
            Some("node-1".to_owned()),
            "Should have selected node"
        );
    }

    #[test]
    fn test_canvas_session_config_defaults() {
        let config = CanvasSessionConfig::default();

        assert!(
            config.session_id.is_none(),
            "Default session_id should be None"
        );
        assert!(config.cwd.is_none(), "Default cwd should be None");
        assert!(config.model.is_none(), "Default model should be None");
        assert!(
            config.thinking_enabled.is_none(),
            "Default thinking_enabled should be None"
        );
    }

    #[test]
    fn test_canvas_edge_serialization() {
        let edge = CanvasEdge {
            id: "edge-1".to_owned(),
            source: "node-a".to_owned(),
            target: "node-b".to_owned(),
            source_handle: Some("output".to_owned()),
            target_handle: Some("input".to_owned()),
            data: None,
        };

        let json = serde_json::to_string(&edge);
        assert!(json.is_ok(), "Edge should serialize");

        let roundtrip: Result<CanvasEdge, _> =
            serde_json::from_str(&json.expect("Serialization should succeed"));
        assert!(roundtrip.is_ok(), "Edge should roundtrip through JSON");
    }

    #[test]
    fn test_canvas_node_discriminated_union() {
        // Test sandpack variant
        let sandpack_json = r#"{
            "type": "sandpack",
            "id": "sp-1",
            "position": {"x": 0, "y": 0},
            "data": {"name": "Test", "code": "const x = 1;"}
        }"#;

        let node: Result<CanvasNode, _> = serde_json::from_str(sandpack_json);
        assert!(node.is_ok(), "Sandpack node should deserialize");

        if let Ok(CanvasNode::Sandpack { id, .. }) = node {
            assert_eq!(id, "sp-1", "Node id should match");
        } else {
            panic!("Expected Sandpack variant");
        }

        // Test page variant
        let page_json = r#"{
            "type": "page",
            "id": "page-1",
            "position": {"x": 100, "y": 100},
            "data": {"name": "MainPage", "layout": "flex"}
        }"#;

        let node: Result<CanvasNode, _> = serde_json::from_str(page_json);
        assert!(node.is_ok(), "Page node should deserialize");

        if let Ok(CanvasNode::Page { id, .. }) = node {
            assert_eq!(id, "page-1", "Node id should match");
        } else {
            panic!("Expected Page variant");
        }
    }
}

// ============================================================================
// Future Setup Command Tests (placeholder)
// ============================================================================
// TODO: Uncomment when setup commands are implemented
//
// mod setup_commands {
//     use super::*;
//     use tempfile::TempDir;
//
//     fn setup_test_orbit_dir() -> TempDir {
//         let temp = TempDir::new().expect("Should create temp dir");
//         std::env::set_var("ORBIT_CANVAS_PATH", temp.path().to_str().unwrap());
//         temp
//     }
//
//     #[test]
//     fn test_get_orbit_canvas_path_uses_env_override() {
//         let temp = setup_test_orbit_dir();
//         let path = get_orbit_canvas_path().expect("Should get path");
//         assert_eq!(path, temp.path());
//     }
//
//     #[tokio::test]
//     async fn test_initialize_directories_creates_structure() {
//         let _temp = setup_test_orbit_dir();
//
//         canvas_initialize_directories().await.expect("Should initialize");
//
//         let orbit_path = get_orbit_canvas_path().expect("Should get path");
//         assert!(orbit_path.join("components/ui").exists());
//         assert!(orbit_path.join("components/custom").exists());
//         assert!(orbit_path.join("lib").exists());
//         assert!(orbit_path.join("preview/src").exists());
//     }
//
//     #[tokio::test]
//     async fn test_check_setup_returns_not_initialized_for_empty_dir() {
//         let _temp = setup_test_orbit_dir();
//
//         let status = canvas_check_setup().await.expect("Should check setup");
//
//         assert!(!status.initialized);
//         assert_eq!(status.component_count, 0);
//     }
// }

// ============================================================================
// Future Download Command Tests (placeholder)
// ============================================================================
// TODO: Uncomment when download commands are implemented
//
// mod download_commands {
//     use super::*;
//
//     #[tokio::test]
//     async fn test_download_component_fetches_button() {
//         let _temp = setup_test_orbit_dir();
//         canvas_initialize_directories().await.expect("Should init");
//
//         let result = canvas_download_component("button".to_string())
//             .await
//             .expect("Should download");
//
//         assert!(result.success);
//         assert!(result.dependencies.contains(&"@radix-ui/react-slot".to_string()));
//     }
// }
