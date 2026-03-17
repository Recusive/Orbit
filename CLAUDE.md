<!-- markdownlint-disable -->

<claude_code_guidance>

<quick_reference>
<cmd>bunx tauri dev</cmd>
<cmd>bun run check</cmd>
<cmd>./scripts/lint-all.sh</cmd>
<cmd>bun run lint:fix</cmd>
</quick_reference>

<metadata>
  <title>CLAUDE.md</title>
  <description>Guidance for Claude Code when working with the Orbit codebase</description>
  <note>Sub-level CLAUDE.md files contain area-specific details. See sub_level_docs below.</note>
</metadata>

<sub_level_docs note="Each major directory has its own CLAUDE.md with detailed, area-specific guidance">
<doc path="apps/agent/CLAUDE.md" scope="Agent app stores, protocol types, CSS, testing, hooks, tool widgets"/>
<doc path="apps/Canvas-UI-Builder/CLAUDE.md" scope="Canvas setup, preview server, inspector, component registry"/>
<doc path="apps/common/CLAUDE.md" scope="Shared frontend code: logger, cn(), Tauri test mocks, canvas hooks"/>
<doc path="agent-bridge/CLAUDE.md" scope="SDK sidecar, IPC protocol, SDK type workaround, testing philosophy"/>
<doc path="src-tauri/CLAUDE.md" scope="Rust backend, Tauri commands, agent bridge, managed state, ACL"/>
<doc path="crates/common/CLAUDE.md" scope="11 Rust crates: core, fs, terminal, git, conversations, settings, search, lsp, sf-symbols, ai (stub), syntax (stub)"/>
<doc path="packages/shared-schemas/CLAUDE.md" scope="Zod schemas shared across agent-bridge and all frontend apps"/>
<doc path="docs/CLAUDE.md" scope="Documentation folder index"/>
<doc path="apps/agent/src/stress-tests/CLAUDE.md" scope="In-app stress test creation guide"/>
</sub_level_docs>

<project_overview>
Orbit is a modern AI-powered code editor built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend). It's a monorepo containing three frontend apps (Orbit Agent, Orbit Canvas, Orbit Editor) that share a common Rust backend.
</project_overview>

<technology_stack>
<frontend>
<item>React 19 + TypeScript + Vite</item>
<item>Bun workspaces for monorepo management</item>
<item>Tailwind CSS v4 for styling</item>
<item>Zustand + Immer for state management</item>
<item>CodeMirror 6 for code editing with custom themes</item>
<item>xterm.js for terminal emulation</item>
<item>Shiki for code block highlighting in chat</item>
<item>Zod 4 for runtime validation</item>
</frontend>
<backend>
<item>Tauri 2 for desktop app framework</item>
<item>Rust workspace with multiple crates</item>
<item>portable-pty for terminal emulation</item>
<item>Tree-sitter for syntax parsing (planned)</item>
</backend>
</technology_stack>

<package_manager_policy importance="critical">
This project uses Bun exclusively. Never use npm or pnpm.

  <contexts>
    <context name="Root monorepo" use="Bun" reason="Fast package management with workspace support"/>
    <context name="apps/*" use="Bun" reason="Part of Bun workspace"/>
    <context name="agent-bridge/" use="Bun" reason="Claude Agent SDK sidecar - compiles to standalone Bun binary"/>
  </contexts>

  <rules>
    <rule>Never use npm or pnpm - Always use bun</rule>
    <rule>Use bun run for all scripts</rule>
    <rule>Use bun install for installing dependencies</rule>
    <rule>Run tests with bun test</rule>
  </rules>

  <examples>
    <correct>
      <command purpose="Install dependencies">bun install</command>
      <command purpose="Start Vite dev server">bun run dev</command>
      <command purpose="Build the app">bun run build</command>
      <command purpose="Run tests">bun test</command>
    </correct>
    <wrong>
      <command>npm run build</command>
      <command>npm install</command>
      <command>pnpm dev</command>
    </wrong>
  </examples>
</package_manager_policy>

<project_structure>

<![CDATA[
Orbit/
├── apps/                           # Frontend applications
│   ├── agent/                      # Chat/Agent app (main app)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/             # Radix UI primitives
│   │   │   │   ├── layout/         # Panels, sidebar, header
│   │   │   │   ├── chat/           # Chat messages, tools
│   │   │   │   ├── input/          # Chat input, mentions
│   │   │   │   ├── terminal/       # xterm.js terminal
│   │   │   │   ├── editor/         # CodeMirror editor
│   │   │   │   ├── files/          # File explorer, icons
│   │   │   │   ├── activity/       # Source control, diffs
│   │   │   │   ├── sidebar/        # Conversation list
│   │   │   │   ├── settings/       # Settings dialogs
│   │   │   │   └── shared/         # Common components
│   │   │   ├── hooks/              # React hooks
│   │   │   ├── stores/             # Zustand state
│   │   │   ├── services/           # Business logic
│   │   │   ├── types/              # TypeScript types
│   │   │   ├── lib/                # Utilities
│   │   │   └── providers/          # Context providers
│   │   └── index.html
│   │
│   ├── Canvas-UI-Builder/          # Canvas UI Builder app (Active)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── setup/          # Setup wizard
│   │       │   ├── inspector/      # Props editor panel
│   │       │   ├── preview/        # Live preview panel
│   │       │   ├── sidebar/        # Component library
│   │       │   ├── dialogs/        # Save component dialog
│   │       │   └── layout/         # Layout components
│   │       ├── hooks/              # Canvas-specific hooks
│   │       └── stores/             # Canvas Zustand stores
│   │
│   └── editor/                     # Editor app (stub)
│       └── src/
│
├── agent-bridge/                   # AI Bridge (Claude Agent SDK sidecar)
│   ├── src/                        # TypeScript source
│   ├── dist/                       # Compiled output
│   └── package.json
│
├── crates/                         # Rust library crates
│   └── common/                     # Shared crates
│       ├── core/                   # Core types, config, state
│       ├── fs/                     # File system operations
│       ├── terminal/               # PTY management
│       ├── git/                    # Git operations
│       ├── ai/                     # Claude API integration (stub - uses agent-bridge)
│       ├── lsp/                    # Language server
│       ├── search/                 # Ripgrep search
│       ├── syntax/                 # Syntax highlighting (stub - uses frontend Shiki)
│       ├── settings/               # Settings persistence
│       └── conversations/          # Conversation storage
│
├── src-tauri/                      # Tauri app entry point
│   ├── src/
│   │   ├── commands/
│   │   │   ├── common/             # Shared commands
│   │   │   │   ├── files.rs
│   │   │   │   ├── terminal.rs
│   │   │   │   ├── git.rs
│   │   │   │   ├── lsp.rs
│   │   │   │   ├── search.rs
│   │   │   │   ├── settings.rs
│   │   │   │   └── workspace.rs
│   │   │   ├── agent/              # Agent-specific commands
│   │   │   │   ├── agent.rs
│   │   │   │   ├── ai.rs
│   │   │   │   └── conversations.rs
│   │   │   ├── canvas/             # Canvas UI Builder commands
│   │   │   │   ├── setup.rs        # ~/.orbit/canvas directory management
│   │   │   │   ├── download.rs     # Download shadcn components
│   │   │   │   ├── save.rs         # Save/export customized components
│   │   │   │   ├── preview.rs      # Vite preview server lifecycle
│   │   │   │   └── tests.rs        # Type serialization tests
│   │   │   └── editor/             # Editor commands (stub)
│   │   ├── agent/                  # Agent bridge (Rust side)
│   │   ├── lib.rs
│   │   └── main.rs
│   └── tauri.conf.json
│
├── Cargo.toml                      # Rust workspace root
├── package.json                    # Bun workspace root (workspaces defined here)
├── bun.lockb                       # Bun lockfile
├── vite.config.ts                  # Vite config (root: apps/agent)
└── tsconfig.json                   # TypeScript config
]]>

</project_structure>

<commands>
  <category name="Frontend Development">
    <command name="bun install" description="Install dependencies"/>
    <command name="bun run dev" description="Start Vite dev server only (port 5176)"/>
    <command name="bun run build" description="TypeScript check + production build"/>
    <command name="bun run preview" description="Preview production build"/>
  </category>

  <category name="Quality Checks">
    <command name="bun run typecheck" description="TypeScript only (tsc --noEmit)"/>
    <command name="bun run lint" description="ESLint with zero warnings tolerance"/>
    <command name="bun run lint:fix" description="ESLint with auto-fix"/>
    <command name="bun run check" description="typecheck + lint + tests"/>
    <command name="bun run ci" description="Full CI: typecheck + lint + tests + rust checks"/>
  </category>

  <category name="Comprehensive Linting">
    <command name="./scripts/lint-all.sh" description="Run all checks (TypeScript, ESLint, Rust, tests)"/>
    <command name="./scripts/lint-all.sh --fix" description="Run with auto-fix"/>
    <command name="./scripts/lint-all.sh --no-test" description="Skip tests for faster checking"/>
  </category>

  <category name="Tauri Development" recommended="true">
    <command name="bunx tauri dev" description="Start full app (Vite + Tauri + Rust)"/>
    <command name="bunx tauri build" description="Build production app (.dmg/.exe/.AppImage)"/>
  </category>

  <category name="Rust Only" note="Run from project root">
    <command name="cargo build" description="Build all Rust crates"/>
    <command name="cargo check" description="Fast type checking"/>
    <command name="cargo test" description="Run Rust tests"/>
    <command name="cargo clippy" description="Lint Rust code"/>
  </category>

  <category name="Testing">
    <command name="bun run test" description="Run frontend tests (Vitest)"/>
    <command name="bun run test:watch" description="Run frontend tests in watch mode"/>
    <command name="bun run test:ui" description="Open Vitest UI"/>
    <command name="bun run test:coverage" description="Run tests with coverage report"/>
    <command name="cd agent-bridge &amp;&amp; bun test" description="Run agent-bridge tests (Bun test)"/>
    <command name="cargo test" description="Run Rust backend tests"/>
  </category>

  <category name="Dead Code Analysis">
    <command name="bun run knip" description="Find unused files, dependencies, and exports"/>
    <command name="bun run knip:fix" description="Auto-remove unused exports and dependencies"/>
    <command name="bun run knip:watch" description="Watch mode for continuous dead code detection"/>
  </category>
</commands>

<testing_architecture>
Different parts of the codebase use different test runners optimized for their runtime:

| Layer         | Location                                                 | Test Runner    | Command                       | Config             |
| ------------- | -------------------------------------------------------- | -------------- | ----------------------------- | ------------------ |
| Frontend Apps | `apps/agent/`, `apps/Canvas-UI-Builder/`, `apps/editor/` | **Vitest**     | `bun run test`                | `vitest.config.ts` |
| Agent Bridge  | `agent-bridge/`                                          | **Bun Test**   | `cd agent-bridge && bun test` | Native Bun         |
| Rust Backend  | `crates/`, `src-tauri/`                                  | **Cargo Test** | `cargo test`                  | `Cargo.toml`       |

<why_different_runners>

- **Vitest**: Optimized for React/Vite with jsdom environment, fast HMR, component testing with React Testing Library
- **Bun Test**: Native to Bun runtime, used for agent-bridge since it compiles to a standalone Bun binary
- **Cargo Test**: Rust's built-in test framework, required for all Rust crates
  </why_different_runners>

<frontend_test_setup>
Vitest + jsdom. Test files: `apps/*/src/**/*.test.{ts,tsx}`. ESLint has relaxed `no-unsafe-*` rules for test files (Vitest 4 + ESLint projectService incompatibility). See `eslint.config.ts`.
<reference>See apps/agent/CLAUDE.md "Testing" section for full configuration and patterns.</reference>
</frontend_test_setup>

<agent_bridge_sdk_types importance="high">
ESLint cannot resolve SDK types across the agent-bridge tsconfig boundary. Uses local mirror types (`LocalSDKMessage`) with cast-at-boundary pattern. User message content is `string | unknown[]` — always guard with `Array.isArray()`.
<reference>See agent-bridge/CLAUDE.md "SDK Type Workaround" section for full details, affected files, and maintenance risks.</reference>
</agent_bridge_sdk_types>
</testing_architecture>

<development_workflow>
<starting_development command="bunx tauri dev">
Starts everything: Vite (5176) + Tauri + Rust
<steps>
<step>Builds the agent-bridge sidecar</step>
<step>Starts Vite dev server on port 5176</step>
<step>Compiles Rust backend</step>
<step>Opens the Tauri desktop window</step>
<step>Enables hot-reload for both frontend and backend</step>
</steps>
</starting_development>

<hot_reload_behavior>
<change type="React/TypeScript" location="apps/agent/src/" behavior="Instant HMR via Vite"/>
<change type="CSS/Tailwind" behavior="Instant HMR via Vite"/>
<change type="Rust" location="src-tauri/" behavior="Auto-rebuilds, restarts app"/>
<change type="Rust crates" location="crates/" behavior="Auto-rebuilds, restarts app"/>
<change type="agent-bridge" location="agent-bridge/" behavior="Manual rebuild required"/>
</hot_reload_behavior>

<agent_bridge_sidecar importance="high">
The agent-bridge is a compiled Bun binary that Tauri spawns as a sidecar process. Unlike other code, changes to agent-bridge require manual rebuilding.
<rebuild_command><![CDATA[
cd agent-bridge
bun run build:dev    # Compiles to target/debug/agent-bridge
]]></rebuild_command>
<post_rebuild>Restart Tauri (Cmd+C then bunx tauri dev)</post_rebuild>
<build_outputs>
<output script="bun run build" location="dist/index.js" purpose="JS bundle (requires Bun to run)"/>
<output script="bun run build:dev" location="target/debug/agent-bridge" purpose="Standalone binary for Tauri"/>
</build_outputs>
</agent_bridge_sidecar>

<production_build command="bunx tauri build" output="src-tauri/target/release/bundle/">
<platform name="macOS" formats=".dmg, .app"/>
<platform name="Windows" formats=".exe, .msi"/>
<platform name="Linux" formats=".AppImage, .deb"/>
</production_build>

<frontend_only_development command="bun run dev" port="5176">
Backend features (file system, terminal, etc.) won't work in browser-only mode.
</frontend_only_development>

<configuration_files>
<file name="src-tauri/tauri.conf.json" purpose="Tauri app config (window, permissions, build)"/>
<file name="vite.config.ts" purpose="Vite bundler config (root: apps/agent)"/>
<file name="Cargo.toml" purpose="Rust workspace root"/>
<file name="package.json" purpose="Bun workspace config (workspaces array)"/>
<file name="tsconfig.json" purpose="TypeScript config (paths: apps/agent/src)"/>
<file name="components.json" purpose="shadcn/ui configuration"/>
<file name="knip.config.ts" purpose="Dead code analysis (unused files, deps, exports)"/>
</configuration_files>
</development_workflow>

<!-- Frontend-backend communication and CodeMirror details: See apps/agent/CLAUDE.md -->

<state_management location="apps/agent/src/stores/">
Zustand stores organized by domain (ui/, agent/, chat/, file/, terminal/, browser/, git/, onboarding/). Always use granular selectors: `useStore((s) => s.value)`.
<reference>See apps/agent/CLAUDE.md "State Management" section for full store table and patterns.</reference>
</state_management>

<protocol_types location="apps/agent/src/types/protocol.ts">
All message types defined with Zod schemas. WebviewMessage (frontend→backend) and ExtensionMessage (backend→frontend).
<reference>See apps/agent/CLAUDE.md "Protocol Types" section for full type definitions.</reference>
</protocol_types>

<code_style>
<production_standard>
This is a production-grade AI-powered code editor. It must withstand the same pressure as VS Code, Zed, and Cursor—users will have dozens of files open, run heavy refactors, and expect instant responsiveness. Write code accordingly.
<rules>
<rule name="Strictly typed">No shortcuts, no `any`, no suppression comments.</rule>
<rule name="No MVP patterns">This is not a prototype. Every component ships production-ready.</rule>
<rule name="Battle-tested mindset">Assume adversarial input, large codebases, and long-running sessions.</rule>
</rules>
</production_standard>

<eslint_rules enforcement="enforced">
<rule>No `any` - All unsafe operations are errors</rule>
<rule>Explicit return types on functions</rule>
<rule>Consistent type imports - Use `import type { }` separately</rule>
<rule>Import order - External, Types, Internal, alphabetized. Use `bun run lint --fix` if unsure</rule>
<rule>No console.log - Use structured logger</rule>
<rule>Strict boolean expressions - No implicit truthy checks</rule>
<rule>Exhaustive switches - All cases must be handled</rule>
</eslint_rules>

<structured_logging importance="high">
Use `createLogger('Name')` from `@/lib/logger` instead of console.\*. Levels: debug (dev-only), info, warn, error. Provides [Context] prefix, structured JSON metadata, and proper error serialization.
</structured_logging>

<tailwind_dynamic_styles>
<rule>Never use dynamic Tailwind classes like `w-[${value}px]`</rule>
<rule>Use inline styles for dynamic dimensions: style={{ width: value }}</rule>
<rule>Static Tailwind classes work normally: w-px, h-[32px]</rule>
</tailwind_dynamic_styles>

<react_patterns>
<pattern>Functional components with explicit FC type</pattern>
<pattern>Ternary for conditional rendering</pattern>
<pattern>Props interfaces marked readonly</pattern>
</react_patterns>

<prohibited_patterns>
The following patterns suppress type checking and should not be added
<language name="TypeScript">
<pattern severity="error">@ts-ignore</pattern>
<pattern severity="error">@ts-nocheck</pattern>
<pattern severity="error">@ts-expect-error</pattern>
<pattern severity="error">: any</pattern>
<pattern severity="error">as any</pattern>
<pattern severity="error">as unknown as</pattern>
<pattern severity="error">non-null assertions (!)</pattern>
</language>
<language name="ESLint">
<pattern severity="error">All eslint-disable variants</pattern>
</language>
<language name="Rust">
<pattern severity="error">#[allow(...)]</pattern>
<pattern severity="error">.unwrap()</pattern>
<pattern severity="error">.expect()</pattern>
<pattern severity="warn">todo!()</pattern>
<pattern severity="warn">unimplemented!()</pattern>
<pattern severity="error">panic!()</pattern>
</language>
<exception>If a suppression is absolutely unavoidable, add a comment explaining why.</exception>
</prohibited_patterns>

<typing_rules>
<rule name="Zod">Always z.infer&lt;typeof Schema&gt;, never duplicate types manually. Use .strict() for internal data, .passthrough() for external APIs.</rule>
<rule name="Tauri">Always invoke&lt;T&gt;() with explicit type. Define response types in apps/agent/src/types/. Match Rust struct names.</rule>
<rule name="Zustand">Always use selectors useStore((s) =&gt; s.value), never destructure full store.</rule>
<rule name="Rust commands">Return Result&lt;T, String&gt;, never panic. Use concrete types, not impl Trait.</rule>
</typing_rules>
</code_style>

<agent_skills source="https://github.com/vercel-labs/agent-skills">
This project includes AI coding assistant skills adapted from Vercel's agent-skills. These provide performance optimization and design guidelines that should be applied when writing or reviewing code.

<available_skills>
<skill name="React Best Practices" file=".claude/skills/react-best-practices.md" apply_when="Writing React components, data fetching, bundle optimization"/>
<skill name="Web Design Guidelines" file=".claude/skills/web-design-guidelines.md" apply_when="UI review, accessibility checks, form implementation"/>
<skill name="Web Animation" file=".claude/skills/web-animation-best-practices.md" apply_when="CSS animations, Framer Motion, transitions, micro-interactions"/>
<skill name="Test Engineer" file=".claude/skills/test-engineer/SKILL.md" apply_when="Write tests for, add test coverage, create tests, TDD, pre-refactor testing" triggers="write tests for, add test coverage, create tests, test this, needs tests"/>
</available_skills>

<key_rules>
<priority level="critical">
<rule id="async-parallel">Use Promise.all() for independent async operations</rule>
<rule id="bundle-dynamic-imports">Lazy-load heavy components (CodeMirror, Shiki, etc.)</rule>
<rule id="bundle-barrel-imports">Import from specific files, not barrel index.ts</rule>
<rule id="anim-transform-opacity">Only animate transform and opacity properties</rule>
<rule id="anim-reduced-motion">Always respect prefers-reduced-motion media query</rule>
</priority>
<priority level="high">
<rule id="server-cache-react">Use React.cache() for per-request deduplication</rule>
<rule id="rerender-defer-reads">Don't subscribe to state only used in callbacks</rule>
<rule>Accessibility: All icon buttons need aria-label</rule>
<rule id="anim-easing-custom">Use custom cubic-bezier curves, not default ease/linear</rule>
<rule id="anim-duration-300ms">Keep animations under 300ms for perceived performance</rule>
</priority>
<priority level="medium">
<rule id="rerender-functional-setstate">Use functional setState for stable callbacks</rule>
<rule id="js-index-maps">Build Map for O(1) lookups in repeated operations</rule>
<rule>Forms: Use correct input type, autocomplete, and inputMode</rule>
<rule id="anim-transform-origin">Animate from contextually meaningful locations</rule>
<rule id="anim-interruptible">Ensure animations can be smoothly interrupted</rule>
</priority>
</key_rules>

<quick_examples><![CDATA[
// Parallel async:  const [files, status] = await Promise.all([invoke('list_directory', { path }), invoke('get_git_status', { path })]);
// Dynamic import:  const CodeMirrorEditor = React.lazy(() => import('./CodeMirrorEditor'));
// State in handler: const handleSave = () => { const { activeFile } = useFileStore.getState(); };
// Accessible icon: <button aria-label="Close dialog" onClick={onClose}><X className="h-4 w-4" /></button>
]]></quick_examples>
<reference>See .claude/skills/ for complete guidelines.</reference>
</agent_skills>

<module_organization_patterns>
<pattern layer="Frontend TS" approach="Barrel (index.ts) — every folder with multiple files"/>
<pattern layer="Tauri commands" approach="Explicit pub mod, no re-exports"/>
<pattern layer="Shared Rust crates" approach="Selective re-export at crate root"/>
<reference>See apps/agent/CLAUDE.md and src-tauri/CLAUDE.md for examples.</reference>
</module_organization_patterns>

<dead_code_analysis tool="knip" config="knip.config.ts">
Knip scans for unused files, dependencies, and exports. Key: `apps/agent`, `apps/Canvas-UI-Builder`, `apps/editor` are NOT real Bun workspaces — they share root `package.json`. Only `apps/common`, `packages/shared-schemas`, and `agent-bridge` are real workspaces.
<known_exceptions>CSS-only deps (tailwindcss, tw-animate-css), @orbit/common (tsconfig alias), agent-bridge (excluded).</known_exceptions>
</dead_code_analysis>

<!-- monorepo_structure: See project_structure above for full tree -->

<!-- implementation_status: Core features complete. In progress: editor app, shared packages. Todo: tree-sitter, LSP, advanced search. -->

<troubleshooting>
  <issue name="Zod Schema Validation Errors" symptoms="Invalid credentials, Unrecognized keys, or parsing errors">
    <solution>Check Zod schemas first</solution>
    <files_to_check>
      <file>agent-bridge/src/schemas.ts</file>
      <file>packages/shared-schemas/</file>
    </files_to_check>
    <quick_fix>Use .loose() for external data, .strict() for internal. See agent-bridge/CLAUDE.md for Zod schema examples.</quick_fix>
  </issue>

<issue name="Agent Bridge SDK Type Mismatch Crash" symptoms="J.every is not a function, J.map is not a function, or similar TypeError in compiled agent-bridge binary">
    <solution>The local mirror types in `agent-bridge/src/common/types/claude-sdk.ts` are out of sync with the SDK's actual runtime types. The `as LocalSDKMessage` cast hides mismatches from TypeScript.</solution>
    <common_cause>User message `content` is `string` for text messages but `unknown[]` for tool results. Always use `Array.isArray()` before calling array methods on user message content.</common_cause>
    <files_to_check>
      <file>agent-bridge/src/common/types/claude-sdk.ts</file>
      <file>agent-bridge/src/agent/core/agent.ts (getMessageContentArray function)</file>
    </files_to_check>
    <quick_fix>Compare local types against actual SDK runtime data. Add `DEBUG_TESTS=1 bun test` to see real message shapes. After fixing types, rebuild sidecar with `bun run build:sidecar` (NOT `build:dev` — that outputs to wrong path).</quick_fix>
  </issue>

<integration_test_coverage importance="high">
When creating integration tests, add a `TESTED:` warning comment to the source file with the test file path and run command (`cd agent-bridge && bun test`).
<tested_features>
<feature name="File Rewind" source="agent-bridge/src/agent.ts:rewindFiles()" test="agent-bridge/src/__tests__/file-rewind.test.ts"/>
</tested_features>
</integration_test_coverage>

<mandatory_test_requirements importance="critical">
Agent-bridge uses REAL integration testing — no mocks. Real Claude API calls through real pipelines.
Run: `cd agent-bridge && bun test`. Requires OAuth credentials (macOS Keychain). Auto-skips in CI.
<reference>See agent-bridge/CLAUDE.md "Testing Philosophy" section.</reference>
</mandatory_test_requirements>

<known_security_vulnerabilities last_audited="January 2025">
<vulnerability package="@modelcontextprotocol/sdk" severity="high" cve="CVE-2026-0621" status="Waiting upstream">
ReDoS in UriTemplate class. No patch available. Low practical risk (local sidecar only). Update @modelcontextprotocol/sdk when patched.
</vulnerability>
</known_security_vulnerabilities>
</troubleshooting>

<css_architecture importance="high">
Unified color system: `apps/agent/src/globals.css` is the SINGLE SOURCE OF TRUTH for all colors (oklch).
Canvas imports agent's globals — NEVER define :root color variables in canvas globals.css.
To add new colors: add to agent globals.css (both :root and html.dark), add Tailwind @theme mapping.
<reference>See apps/agent/CLAUDE.md "CSS & Styling" for color values and apps/Canvas-UI-Builder/CLAUDE.md for canvas-specific notes.</reference>
</css_architecture>

<canvas_ui_builder>
Visual component customization tool (browse, customize, export shadcn/ui components).
Three-panel layout: Left Sidebar (component library) | Preview Panel (live Vite preview) | Inspector Panel (props editor).
First-run setup via CanvasSetupWizard initializes ~/.orbit/canvas/ with shadcn components + Vite preview server.
Rust commands in src-tauri/src/commands/canvas/. Frontend in apps/Canvas-UI-Builder/src/.
<reference>See apps/Canvas-UI-Builder/CLAUDE.md for full details.</reference>
</canvas_ui_builder>

<feature_documentation location="docs/">
<index file="docs/CLAUDE.md" rule="When adding, removing, or moving files in docs/, update docs/CLAUDE.md to keep the index in sync."/>
<feature name="Embedded Browser" file="docs/architecture/EMBEDDED_BROWSER.md" description="Tauri multiwebview browser panel, WKWebView workarounds, idle timeout system"/>
<feature name="CSP Security" file="docs/architecture/CSP-SECURITY.md" description="Content Security Policy config, why unsafe-eval is required for streamdown"/>
<feature name="ProMotion 120fps" file="docs/architecture/PROMOTION-120FPS.md" description="120Hz rendering in WKWebView via CADisplayLink + WebKit _WKFeature private API"/>
</feature_documentation>

<plan_tracking importance="critical">
Plans live in `docs/plans/` with this structure:

| Folder            | Purpose                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tracked/todo/`   | Plans queued for implementation                                                                                                                                                                        |
| `tracked/done/`   | Completed plans                                                                                                                                                                                        |
| `others/<topic>/` | Uncategorized plans grouped by topic (browser, canvas, vault, file-system, diffs-and-code, sessions, worktree, ui-and-animations, skills-marketplace, agent, architecture, auth, navigation, feedback) |

**After finishing a plan implementation:** Ask the user "Is this plan good to mark as done?" If the user confirms (or says the plan is done/shipped/complete), move the plan file from its current location to `docs/plans/tracked/done/` and update `docs/CLAUDE.md` index accordingly. If the user doesn't respond to the prompt, move it anyway — default to marking done after successful implementation.
</plan_tracking>

<sdk_documentation importance="high">
Claude Agent SDK docs are in `SDK/` folder (18 markdown files) and indexed in local RAG vector database.

**Lookup workflow — always two steps:**

1. **Search index**: `query_documents({ query: "specific SDK terms here", limit: 10 })` → finds which file has the answer
2. **Read source**: `Read` the file path from results → gets full content with code examples and tables intact

RAG chunks are small fragments — good for discovery, not complete answers. Always Read the source file after searching.

Use specific API names in queries (e.g., "canUseTool", "permissionMode", "PreToolUse") for best results.
Search SDK docs whenever working on agent-bridge, SDK integration, permissions, hooks, MCP, sessions, or tools.
</sdk_documentation>

<git_policy importance="critical">
<rule name="PR merge method">NEVER use squash merge. Use "Rebase and merge" (preferred) or "Create a merge commit". Squash merge collapses all branch commits into one, losing individual contributions from the GitHub graph. Squash merge is disabled in repo settings.</rule>
</git_policy>

<changelog>
  <period date="February 2026">
    <entry>Knip dead code analysis - Fixed config for non-standard monorepo workspace structure</entry>
  </period>
  <period date="January 2026">
    <entry>Canvas UI Builder - Visual component builder with shadcn/ui (Rust backend + React frontend)</entry>
    <entry>Agent Skills - Vercel's react-best-practices and web-design-guidelines</entry>
    <entry>Embedded browser - WebKit via Tauri multiwebview</entry>
    <entry>pnpm to Bun migration</entry>
  </period>
</changelog>

</claude_code_guidance>
