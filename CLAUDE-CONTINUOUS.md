<!-- markdownlint-disable -->

<claude_continuous_docs>
<metadata>

  <title>CLAUDE-CONTINUOUS.md</title>
  <description>Extended documentation for the Orbit codebase with detailed examples, historical context, and verbose explanations</description>
  <note>For quick reference, see CLAUDE.md. This file provides deeper context for specific topics.</note>
</metadata>
<package_manager_migration date="January 2026">
This project migrated from pnpm to Bun for faster installs, unified tooling (Bun handles both package management and the agent-bridge runtime), and simpler workspace configuration. The pnpm-workspace.yaml file was removed - workspaces are now defined directly in package.json.
<legacy_note>If you encounter old documentation or scripts referencing pnpm, replace with Bun equivalents.</legacy_note>
  <contexts>
    <context name="Root monorepo" use="Bun" reason="Fast package management with workspace support"/>
    <context name="apps/*" use="Bun" reason="Part of Bun workspace"/>
    <context name="agent-bridge/" use="Bun" reason="Claude Agent SDK sidecar - compiles to standalone Bun binary"/>
  </contexts>
</package_manager_migration>
<agent_bridge_deep_dive>
<why_manual_rebuild>
The agent-bridge requires manual rebuilding because:
<reason>Tauri watches Rust code, not the agent-bridge TypeScript</reason>
<reason>The sidecar is a standalone binary (58MB) with embedded Bun runtime</reason>
<reason>Located at target/debug/agent-bridge in dev mode</reason>
</why_manual_rebuild>
<build_outputs>
<output script="bun run build" location="dist/index.js" purpose="JS bundle (requires Bun to run)"/>
<output script="bun run build:dev" location="target/debug/agent-bridge" purpose="Standalone binary for Tauri"/>
</build_outputs>
  <explanation>
    The build:dev script compiles the TypeScript to a standalone Bun binary that can be executed without the Bun runtime installed. This is required for Tauri to spawn it as a sidecar process.
  </explanation>
</agent_bridge_deep_dive>
<integration_testing>
<example name="Real Integration Test">
<bad label="Mock test that proves nothing"><![CDATA[
it('should analyze intent', () => {
const mockAnalyzer = { analyze: () => ({ useFastPath: true }) };
expect(mockAnalyzer.analyze('test').useFastPath).toBe(true);
});
]]></bad>
<good label="Real integration test"><![CDATA[
it('should route simple requests to fast path via real session', async () => {
// Create REAL session with REAL Claude SDK
const manager = new CanvasSessionManager();
await manager.createSession('test-session', {
model: 'claude-sonnet-4-20250514',
});
// Verify REAL IntentAnalyzer is initialized
const intentAnalyzer = manager['intentAnalyzer'];
expect(intentAnalyzer).toBeDefined();
// Test REAL analysis with REAL routing logic
const state: CanvasState = { nodes: [], edges: [] };
const snapshot = manager'convertToSnapshot';
const analysis = intentAnalyzer.analyze('Create a button', snapshot);
// Verify REAL routing decision
expect(analysis.useFastPath).toBe(true);
expect(analysis.fastPathAgent).toBe('component');
// Cleanup REAL session
await manager.deleteSession('test-session');
});
]]></good>
</example>
<why_this_matters>
<wrong>
<item>"Tests pass" with mocked data</item>
<item>Deploys to production</item>
<item>Real system fails because mock didn't match reality</item>
<item>Hours of debugging</item>
</wrong>
<right>
<item>Tests pass with real integration</item>
<item>Actual API calls verified working</item>
<item>Full data flow tested</item>
<item>Confidence that production will work</item>
</right>
</why_this_matters>
<case_study name="Adding Orchestrator to Session Manager">
<wrong>
<item>Mocked IntentAnalyzer to return fake results</item>
<item>Mocked Orchestrator to skip real execution</item>
<item>Tests pass but nothing actually works</item>
</wrong>
<right>
<item>Created REAL sessions with REAL Claude SDK</item>
<item>Tested REAL IntentAnalyzer routing decisions</item>
<item>Verified REAL orchestrator lifecycle (create, cleanup)</item>
<item>Tested REAL snapshot conversion with actual canvas state</item>
<item>All 44 tests pass with REAL integration</item>
</right>
</case_study>
</integration_testing>
<tauri_webview_blur>
  <summary>
    Tauri's WKWebView has rendering quirks. Avoid these CSS properties on interactive elements:
    <avoid property="backdrop-filter: blur()">Use solid backgrounds</avoid>
    <avoid property="color-mix()">Use CSS variables or rgba()</avoid>
    <avoid property="transition / animation inside ReactFlow viewport">Remove entirely</avoid>
    <note>will-change: transform does NOT fix blur.</note>
  </summary>
  <example name="Fixing Blurry Nodes in ReactFlow">
    <problem>Workflow nodes in Canvas app appeared blurry in Tauri but crisp in browser.</problem>
    <root_cause>The MarkdownCardNode.css had problematic styles.</root_cause>
<bad label="Causes blur in Tauri WebView"><![CDATA[
.card-action-toolbar {
background: color-mix(in oklch, var(--card) 95%, transparent);
backdrop-filter: blur(12px);
}
.card-action-toolbar__button:hover {
background: color-mix(in oklch, var(--muted) 60%, transparent);
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.markdown-card-node {
transition:
box-shadow 0.15s ease,
border-color 0.15s ease;
}
]]></bad>
<good label="Crisp rendering in Tauri WebView"><![CDATA[
.card-action-toolbar {
background: var(--card);
/* No backdrop-filter */
}
.card-action-toolbar__button:hover {
background: var(--muted);
/* No transition */
}
.markdown-card-node {
/* No transition */
}
]]></good>
</example>
<debugging_steps>
<step order="1">Identify the blurry element - Check if it's specific to certain components</step>
<step order="2">Compare with working components - Find similar components that render crisp</step>
<step order="3">Check CSS differences - Look for backdrop-filter, color-mix(), transition, animation</step>
<step order="4">Remove one property at a time - Isolate which property causes the blur</step>
<step order="5">Replace with solid alternatives - Use CSS variables and remove transitions</step>
</debugging_steps>
<note>contain: layout style paint and will-change: transform do NOT fix the blur issue. The only solution for elements inside ReactFlow's viewport is to completely remove transitions and animations.</note>
</tauri_webview_blur>
<security_vulnerabilities>
<vulnerability name="MCP SDK ReDoS" cve="CVE-2026-0621" advisory="GHSA-8r9q-7v3j-jr4g" package="@modelcontextprotocol/sdk" versions="&lt;=1.25.1">
<description>
Regular Expression Denial of Service vulnerability in the UriTemplate class. Attackers can craft malicious URIs that trigger catastrophic regex backtracking, causing CPU exhaustion.
</description>
<risk_assessment level="low">
  <reason>The agent-bridge runs as a local sidecar, not exposed to the internet</reason>
  <reason>URIs come from our own Claude SDK calls, not untrusted user input</reason>
  <reason>An attacker would need local access to craft malicious URIs</reason>
</risk_assessment>

<mitigation>
  We've added an override for qs>=6.14.1 to fix a related DoS vulnerability in the transitive dependency chain. The MCP SDK issue requires an upstream fix from Anthropic - update @modelcontextprotocol/sdk when a patched version is released.
</mitigation>

<check_commands><![CDATA[
bun pm audit                                    # Check current vulnerabilities
bun pm view @modelcontextprotocol/sdk version   # Check latest version
]]></check_commands>
</vulnerability>
</security_vulnerabilities>
<agent_skills_examples>
<typescript_examples><![CDATA[
// [GOOD] Parallel async operations
const [files, status] = await Promise.all([
invoke('list_directory', { path }),
invoke('get_git_status', { path })
])
// [GOOD] Dynamic import for heavy components
const CodeMirrorEditor = React.lazy(() => import('./CodeMirrorEditor'))
// [GOOD] Stable callback with functional setState
const increment = useCallback(() => setCount(c => c + 1), [])
// [GOOD] Read state in handler without subscribing
const handleSave = () => {
const { activeFile } = useFileStore.getState()
// ...
}
// [GOOD] Accessible icon button
<button aria-label="Close dialog" onClick={onClose}>
<X className="h-4 w-4" />
</button>
]]></typescript_examples>
<animation_examples>
<css_example label="Only transform/opacity, custom easing, reduced motion"><![CDATA[
.button {
transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@media (prefers-reduced-motion: reduce) {
.button {
 transition: none;
}
}
]]></css_example>
<framer_motion_example label="Reduced motion support"><![CDATA[
const shouldReduceMotion = useReducedMotion();
<motion.div
animate={{ scale: 1 }}
transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
/>
]]></framer_motion_example>
</animation_examples>
</agent_skills_examples>
<module_organization_examples>
<frontend_barrel_pattern>
<structure><![CDATA[
components/chat/messages/
├── index.ts              <- Barrel file (exports all public items)
├── MessageItem.tsx       <- Main component
├── ToolWidgetRenderer.tsx
├── message-utils.ts      <- Utilities
└── types.ts              <- Types
]]></structure>
<barrel_file_pattern><![CDATA[
// index.ts
export { MessageItem } from './MessageItem';
export { ToolWidgetRenderer } from './ToolWidgetRenderer';
export type { ChatMessage, MessageItemProps } from './types';
export { buildSegments } from './message-utils';
]]></barrel_file_pattern>
<nested_structure><![CDATA[
primary-sidebar/
├── index.ts              <- Imports from subfolders
├── PrimarySidebar.tsx
├── types.ts
├── components/
│   ├── index.ts          <- Subfolder barrel
│   └── *.tsx
└── hooks/
├── index.ts          <- Subfolder barrel
└── *.ts
]]></nested_structure>
</frontend_barrel_pattern>
<backend_rust_pattern>
<commands_structure><![CDATA[
// commands/mod.rs - Just declare modules
pub mod agent;
pub mod common;
// commands/common/mod.rs - Declare submodules
pub mod files;
pub mod git;
pub mod terminal;
// No pub use needed - commands use full paths
]]></commands_structure>
<shared_crates><![CDATA[
// crates/common/core/src/lib.rs
pub mod types;
pub mod error;
// Re-export commonly used types for convenience
pub use error::{Error, Result};
pub use types::{FileStatus, GitStatus};
]]></shared_crates>
</backend_rust_pattern>
</module_organization_examples>
<zod_schema_examples>
<example name="KeychainCredentialsSchema Fix">
<bad label="Too strict for external data"><![CDATA[
.object({ expiresAt: z.string() }).strict()
]]></bad>
<good label="Flexible for external data that may change"><![CDATA[
.object({ expiresAt: z.union([z.number(), z.string()]) }).loose()
]]></good>
</example>
<common_patterns><![CDATA[
// For API responses with unknown extra fields
const ApiResponseSchema = z
.object({
data: z.unknown(),
status: z.number(),
})
.passthrough(); // or .loose()
// For internal data with strict shape
const InternalStateSchema = z
.object({
count: z.number(),
items: z.array(z.string()),
})
.strict();
]]></common_patterns>
</zod_schema_examples>
<changelog>
<period date="January 2026">
<entry name="Canvas UI Builder">
Complete visual component builder with shadcn/ui integration
<detail>Rust backend: setup, download, save, preview, export commands in src-tauri/src/commands/canvas/</detail>
<detail>React frontend: setup wizard, inspector panel, live preview, component library</detail>
<detail>First-run setup initializes ~/.orbit/canvas/ with shadcn components</detail>
<detail>Vite-based live preview server for real-time component rendering</detail>
<detail>Save customized components to local registry, export to external projects</detail>
</entry>
<entry name="Agent Skills">
Integrated Vercel's agent-skills for React best practices and web design guidelines
<detail>.claude/skills/react-best-practices.md - 45 rules across 8 categories from Vercel Engineering</detail>
<detail>.claude/skills/web-design-guidelines.md - 100+ accessibility, UX, and performance rules</detail>
<detail>Source: vercel-labs/agent-skills</detail>
</entry>

<entry name="Embedded browser panel">
  True embedded WebKit browser via Tauri's unstable feature (multiwebview)
  <detail>See docs/architecture/EMBEDDED_BROWSER.md for implementation details and known issues</detail>
</entry>

<entry name="pnpm to Bun migration">
  All package management now uses Bun for faster installs and unified tooling
  <detail>Removed pnpm-workspace.yaml - workspaces defined in package.json</detail>
  <detail>Removed pnpm-lock.yaml - replaced by bun.lockb</detail>
  <detail>Updated all scripts, CI workflows, and husky hooks to use bun</detail>
  <detail>Added comprehensive lint-all.sh script for running all checks</detail>
</entry>

<entry name="Comprehensive audit">
  Aligned all linting, TypeScript, and CI checks across the monorepo
</entry>

<entry name="Module organization patterns">
  Barrel pattern for frontend, explicit paths for Rust backend
  <detail>Frontend: Every folder with multiple files gets an index.ts barrel</detail>
  <detail>Backend: Tauri commands use explicit paths, shared crates use selective re-exports</detail>
</entry>
  </period>
</changelog>
</claude_continuous_docs>
