<?xml version="1.0" encoding="UTF-8"?>

<claude_code_guidance>
<metadata>
<title>CLAUDE.md</title>
<description>Guidance for Claude Code when working with the Orbit codebase</description>
<extended_documentation>
<file>CLAUDE-CONTINUOUS.md</file>
<note>For detailed examples, historical context, and verbose explanations</note>
</extended_documentation>
</metadata>

<project_overview>
<description>Orbit is a modern AI-powered code editor built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend). It's a monorepo containing three frontend apps (Orbit Agent, Orbit Canvas, Orbit Editor) that share a common Rust backend.</description>
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

<package_manager_policy>
<importance>CRITICAL</importance>
<manager>Bun</manager>
<note>This project uses Bun exclusively. Never use npm or pnpm.</note>

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
    
    <category name="Rust Only">
      <note>Run from project root</note>
      <command name="cargo build" description="Build all Rust crates"/>
      <command name="cargo check" description="Fast type checking"/>
      <command name="cargo test" description="Run Rust tests"/>
      <command name="cargo clippy" description="Lint Rust code"/>
    </category>
  </commands>

<development_workflow>
<starting_development>
<command>bunx tauri dev</command>
<description>Starts everything: Vite (5176) + Tauri + Rust</description>
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

    <agent_bridge_sidecar>
      <importance>IMPORTANT</importance>
      <description>The agent-bridge is a compiled Bun binary that Tauri spawns as a sidecar process. Unlike other code, changes to agent-bridge require manual rebuilding.</description>
      <rebuild_command>
        <![CDATA[

cd agent-bridge
bun run build:dev # Compiles to target/debug/agent-bridge
]]>
</rebuild_command>
<post_rebuild>Restart Tauri (Cmd+C → bunx tauri dev)</post_rebuild>
<build_outputs>
<output script="bun run build" location="dist/index.js" purpose="JS bundle (requires Bun to run)"/>
<output script="bun run build:dev" location="target/debug/agent-bridge" purpose="Standalone binary for Tauri"/>
</build_outputs>
</agent_bridge_sidecar>

    <production_build>
      <command>bunx tauri build</command>
      <output_location>src-tauri/target/release/bundle/</output_location>
      <platforms>
        <platform name="macOS" formats=".dmg, .app"/>
        <platform name="Windows" formats=".exe, .msi"/>
        <platform name="Linux" formats=".AppImage, .deb"/>
      </platforms>
    </production_build>

    <frontend_only_development>
      <command>bun run dev</command>
      <port>5176</port>
      <note>Backend features (file system, terminal, etc.) won't work in browser-only mode.</note>
    </frontend_only_development>

    <configuration_files>
      <file name="src-tauri/tauri.conf.json" purpose="Tauri app config (window, permissions, build)"/>
      <file name="vite.config.ts" purpose="Vite bundler config (root: apps/agent)"/>
      <file name="Cargo.toml" purpose="Rust workspace root"/>
      <file name="package.json" purpose="Bun workspace config (workspaces array)"/>
      <file name="tsconfig.json" purpose="TypeScript config (paths: apps/agent/src)"/>
      <file name="components.json" purpose="shadcn/ui configuration"/>
    </configuration_files>

</development_workflow>

<frontend_backend_communication>
<tauri_hook file="apps/agent/src/hooks/use-tauri.ts">
<example name="Send message to backend">
<![CDATA[
const { postMessage } = useTauri();
postMessage({ type: 'message:send', uuid, session_id, content });
        ]]>
</example>
<example name="Listen for backend messages">
<![CDATA[
useTauri({
  onMessage: (message) => {
    if (message.type === 'agent:chunk') {
      // Handle streaming response
    }
  },
});
        ]]>
</example>
</tauri_hook>

    <backend_api file="apps/agent/src/lib/backend.ts">
      <description>Direct Tauri invoke calls for file operations, LSP, terminal, git, etc.</description>
      <example>
        <![CDATA[

import { readFile, writeFile, listDirectory } from '@/lib/backend';

// File operations
const content = await readFile('/path/to/file');
await writeFile('/path/to/file', content);
const entries = await listDirectory('/path/to/dir');

// LSP operations
const completions = await getCompletions(path, line, column);
const hover = await getHover(path, line, column);

// Terminal operations
const info = await createTerminal(id, cwd, shell);
await writeTerminal(id, data);
]]>
</example>
</backend_api>
</frontend_backend_communication>

<codemirror_editor>
<file>apps/agent/src/components/editor/CodeMirrorEditor.tsx</file>
<features>
<feature>Full editing with syntax highlighting</feature>
<feature>Custom dark/light themes matching app colors</feature>
<feature>Language support: TypeScript, JavaScript, Python, Rust, Go, JSON, HTML, CSS, Markdown</feature>
<feature>LSP autocompletion integration</feature>
<feature>Cmd-S save functionality</feature>
<feature>Theme-aware (syncs with app light/dark mode via MutationObserver)</feature>
</features>
<theme_colors>
<dark background="oklch(0.16 0.012 60)" style="github-dark"/>
<light background="oklch(0.98 0.005 75)" style="github-light"/>
</theme_colors>
</codemirror_editor>

<state_management>
<location>apps/agent/src/stores/</location>
<stores>
<store name="ui-store" purpose="Panel layout, dimensions, active tabs"/>
<store name="file-store" purpose="File tree state, changes, selections"/>
<store name="file-viewer-store" purpose="Open file tabs, content, modified state"/>
<store name="terminal-store" purpose="xterm sessions, output buffers"/>
<store name="git-store" purpose="Git branch, status, ahead/behind"/>
<store name="tool-store" purpose="Tool execution, permissions, token tracking"/>
<store name="browser-store" purpose="Browser/webpage viewing state"/>
<store name="checkpoint-store" purpose="Conversation checkpoints for rewind"/>
<store name="queued-message-store" purpose="Pending message queue buffer"/>
<store name="onboarding-store" purpose="First-launch setup (persisted to localStorage)"/>
<store name="provider-store" purpose="OAuth provider configuration"/>
</stores>
</state_management>

<protocol_types>
<location>apps/agent/src/types/protocol.ts</location>
<note>All message types with Zod schemas</note>

    <frontend_to_backend name="WebviewMessage">
      <message type="message:send" description="Send chat message"/>
      <message type="file:read" description="File operations"/>
      <message type="file:write" description="File operations"/>
      <message type="terminal:create" description="Terminal operations"/>
      <message type="terminal:write" description="Terminal operations"/>
      <message type="agent:stop" description="Stop AI generation"/>
    </frontend_to_backend>

    <backend_to_frontend name="ExtensionMessage">
      <message type="agent:chunk" description="AI responses"/>
      <message type="agent:complete" description="AI responses"/>
      <message type="tool:start" description="Tool execution"/>
      <message type="tool:end" description="Tool execution"/>
      <message type="file:content" description="File data"/>
      <message type="file:tree:response" description="File data"/>
      <message type="terminal:output" description="Terminal data"/>
      <message type="terminal:created" description="Terminal data"/>
    </backend_to_frontend>

</protocol_types>

<code_style>
<production_standard>
<description>This is a production-grade AI-powered code editor. It must withstand the same pressure as VS Code, Zed, and Cursor—users will have dozens of files open, run heavy refactors, and expect instant responsiveness. Write code accordingly.</description>
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
      <rule>Import order - External → Types → Internal, alphabetized. Use `bun run lint --fix` if unsure</rule>
      <rule>No console.log - Use structured logger</rule>
      <rule>Strict boolean expressions - No implicit truthy checks</rule>
      <rule>Exhaustive switches - All cases must be handled</rule>
    </eslint_rules>

    <structured_logging>
      <importance>IMPORTANT</importance>
      <instruction>Use the structured logger instead of console.* calls</instruction>
      <example>
        <![CDATA[

import { createLogger } from '@/lib/logger';

const logger = createLogger('MyComponent');

// Log levels
logger.debug('Dev-only message', { count: 42 }); // Filtered in production
logger.info('Operational message'); // Always shown
logger.warn('Potential issue', { userId: '123' }); // Always shown
logger.error('Error occurred', new Error('fail')); // Always shown with stack
]]>
</example>
<benefits>
<benefit name="Context prefix">Easily identify source: [MyComponent] message</benefit>
<benefit name="Log levels">Debug messages hidden in production</benefit>
<benefit name="Structured data">JSON metadata for log aggregation</benefit>
<benefit name="Error handling">Proper error serialization with stack traces</benefit>
</benefits>
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
      <description>The following patterns suppress type checking and should not be added</description>
      <language name="TypeScript">
        <pattern>@ts-ignore</pattern>
        <pattern>@ts-nocheck</pattern>
        <pattern>@ts-expect-error</pattern>
        <pattern>: any</pattern>
        <pattern>as any</pattern>
        <pattern>as unknown as</pattern>
        <pattern>non-null assertions (!)</pattern>
      </language>
      <language name="ESLint">
        <pattern>All eslint-disable variants</pattern>
      </language>
      <language name="Rust">
        <pattern>#[allow(...)]</pattern>
        <pattern>.unwrap()</pattern>
        <pattern>.expect()</pattern>
        <pattern>todo!()</pattern>
        <pattern>unimplemented!()</pattern>
        <pattern>panic!()</pattern>
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

<agent_skills>
<description>This project includes AI coding assistant skills adapted from Vercel's agent-skills. These provide performance optimization and design guidelines that should be applied when writing or reviewing code.</description>
<source>https://github.com/vercel-labs/agent-skills</source>

    <available_skills>
      <skill name="React Best Practices" file=".claude/skills/react-best-practices.md" apply_when="Writing React components, data fetching, bundle optimization"/>
      <skill name="Web Design Guidelines" file=".claude/skills/web-design-guidelines.md" apply_when="UI review, accessibility checks, form implementation"/>
      <skill name="Web Animation" file=".claude/skills/web-animation-best-practices.md" apply_when="CSS animations, Framer Motion, transitions, micro-interactions"/>
    </available_skills>

    <key_rules>
      <priority level="CRITICAL">
        <rule id="async-parallel">Use Promise.all() for independent async operations</rule>
        <rule id="bundle-dynamic-imports">Lazy-load heavy components (CodeMirror, Shiki, etc.)</rule>
        <rule id="bundle-barrel-imports">Import from specific files, not barrel index.ts</rule>
        <rule id="anim-transform-opacity">Only animate transform and opacity properties</rule>
        <rule id="anim-reduced-motion">Always respect prefers-reduced-motion media query</rule>
      </priority>
      <priority level="HIGH">
        <rule id="server-cache-react">Use React.cache() for per-request deduplication</rule>
        <rule id="rerender-defer-reads">Don't subscribe to state only used in callbacks</rule>
        <rule>Accessibility: All icon buttons need aria-label</rule>
        <rule id="anim-easing-custom">Use custom cubic-bezier curves, not default ease/linear</rule>
        <rule id="anim-duration-300ms">Keep animations under 300ms for perceived performance</rule>
      </priority>
      <priority level="MEDIUM">
        <rule id="rerender-functional-setstate">Use functional setState for stable callbacks</rule>
        <rule id="js-index-maps">Build Map for O(1) lookups in repeated operations</rule>
        <rule>Forms: Use correct input type, autocomplete, and inputMode</rule>
        <rule id="anim-transform-origin">Animate from contextually meaningful locations</rule>
        <rule id="anim-interruptible">Ensure animations can be smoothly interrupted</rule>
      </priority>
    </key_rules>

    <reference>See .claude/skills/ for complete guidelines. Code examples in CLAUDE-CONTINUOUS.md.</reference>

</agent_skills>

<module_organization_patterns>
<patterns>
<pattern layer="Frontend TS" approach="Barrel (index.ts)" reason="Users import from modules"/>
<pattern layer="Tauri commands" approach="Explicit paths" reason="Internal, registered by function"/>
<pattern layer="Shared Rust crates" approach="Selective re-export" reason="Convenience for cross-crate types"/>
</patterns>
<guidelines>
<guideline context="Frontend">Every folder with multiple files should have an index.ts barrel</guideline>
<guideline context="Rust commands">Use explicit pub mod declarations, no re-exports</guideline>
<guideline context="Shared crates">Re-export commonly used types at crate root</guideline>
</guidelines>
<reference>See CLAUDE-CONTINUOUS.md for detailed examples.</reference>
</module_organization_patterns>

<monorepo_structure>
<apps location="apps/">
<app name="agent" description="Chat/AI agent interface" status="Active"/>
<app name="Canvas-UI-Builder" description="Visual component builder with shadcn" status="Active"/>
<app name="editor" description="Code editor" status="Stub"/>
</apps>

    <shared_crates location="crates/common/">
      <crate name="core" description="Core types, config, state"/>
      <crate name="fs" description="File system operations"/>
      <crate name="terminal" description="PTY management"/>
      <crate name="git" description="Git operations"/>
      <crate name="ai" description="Claude API integration"/>
      <crate name="lsp" description="Language server protocol"/>
      <crate name="search" description="Ripgrep search"/>
    </shared_crates>

    <commands location="src-tauri/src/commands/">
      <folder name="common/" description="Shared commands (files, terminal, git, etc.)"/>
      <folder name="agent/" description="Agent-specific commands (ai, conversations)"/>
      <folder name="canvas/" description="Canvas UI Builder (setup, download, save, preview)"/>
      <folder name="editor/" description="Editor-specific commands (stub)"/>
    </commands>

</monorepo_structure>

<implementation_status>
<completed>
<item>Tauri 2 project setup with Rust workspace</item>
<item>Monorepo restructure (apps/, crates/common/, commands/)</item>
<item>CodeMirror 6 editor with custom themes</item>
<item>File editing with save (Cmd-S)</item>
<item>Modified indicator on tabs</item>
<item>Theme switching (light/dark)</item>
<item>Frontend-backend communication layer</item>
<item>Terminal with xterm.js</item>
<item>Git status and operations</item>
<item>Bun workspace management</item>
<item>CI/CD with GitHub Actions</item>
<item>Embedded browser panel (WebKit via Tauri multiwebview)</item>
<item>Canvas UI Builder (setup, download, preview, save, export)</item>
</completed>

    <in_progress>
      <item>Editor app implementation</item>
      <item>Shared packages extraction</item>
    </in_progress>

    <todo>
      <item>Tree-sitter syntax highlighting</item>
      <item>LSP/diagnostics integration</item>
      <item>Advanced search features</item>
    </todo>

</implementation_status>

  <troubleshooting>
    <issue name="Zod Schema Validation Errors">
      <symptoms>Invalid credentials, Unrecognized keys, or parsing errors</symptoms>
      <solution>Check Zod schemas first</solution>
      <files_to_check>
        <file>agent-bridge/src/schemas.ts</file>
        <file>packages/shared-schemas/</file>
      </files_to_check>
      <quick_fix>Use .loose() for external data, .strict() for internal. See CLAUDE-CONTINUOUS.md for examples.</quick_fix>
    </issue>
    
    <integration_test_coverage>
      <importance>IMPORTANT</importance>
      <instruction>When creating integration tests for a function or feature, always add a warning comment to the source file being tested. This ensures future developers know to run and update tests when modifying the code.</instruction>
      <comment_format>
        <![CDATA[
/**
 * [existing docstring...]
 *
 * <warning>
 * TESTED: This function is covered by integration tests.
 * If you modify this, run: cd agent-bridge && bun test
 * Test file: src/__tests__/[test-file-name].test.ts
 * </warning>
 */
        ]]>
      </comment_format>
      <tested_features>
        <feature name="File Rewind" source="agent-bridge/src/agent.ts:rewindFiles()" test="agent-bridge/src/__tests__/file-rewind.test.ts"/>
        <feature name="Conversation Context Format" source="apps/agent/src/hooks/use-tauri.ts:formatConversationContext()" test="agent-bridge/src/__tests__/conversation-rewind.test.ts"/>
        <feature name="Combined Rewind Flow" source="apps/agent/src/hooks/use-tauri.ts:conversation:rewind handler" test="agent-bridge/src/__tests__/combined-rewind.test.ts"/>
      </tested_features>
    </integration_test_coverage>
    
    <mandatory_test_requirements>
      <importance>CRITICAL</importance>
      <principle>We follow real integration testing, not unit testing with mocks.</principle>
      <do_not>
        <item>Mock the Claude SDK</item>
        <item>Test single files in isolation</item>
        <item>Use fake data that always passes</item>
      </do_not>
      <do>
        <item>Use REAL Claude API calls</item>
        <item>Test full module integration</item>
        <item>Use real data through real pipelines</item>
      </do>
      <running_tests>
        <command>cd agent-bridge &amp;&amp; bun test</command>
        <note>Integration tests (run locally, skipped in CI)</note>
      </running_tests>
      <requirements>Tests require Claude Code CLI OAuth credentials (macOS Keychain). They auto-skip in GitHub Actions.</requirements>
    </mandatory_test_requirements>
    
    <known_security_vulnerabilities>
      <last_audited>January 2025</last_audited>
      <vulnerability package="@modelcontextprotocol/sdk" severity="High" cve="CVE-2026-0621" status="Waiting upstream">
        <description>ReDoS in UriTemplate class. No patch available.</description>
        <notes>ReDoS in UriTemplate. Low practical risk (local sidecar only). Update @modelcontextprotocol/sdk when patched.</notes>
      </vulnerability>
    </known_security_vulnerabilities>
  </troubleshooting>

<css_architecture>
<importance>IMPORTANT</importance>
<principle>The app uses a unified color system with agent as the source of truth.</principle>

    <file_structure>
      <file path="apps/agent/src/globals.css" role="SOURCE OF TRUTH for all colors"/>
      <file path="apps/Canvas-UI-Builder/src/globals.css" role="Canvas-specific styles only (NO color definitions)"/>
    </file_structure>

    <import_order location="apps/agent/src/main.tsx">
      <import order="1" file="./globals.css" description="Agent colors (source of truth)"/>
      <import order="2" file="@canvas/globals.css" description="Canvas styles (no color overrides)"/>
    </import_order>

    <color_variables location="apps/agent/src/globals.css">
      <variable name="--background" light="oklch(0.95 ...)" dark="oklch(0.16 ...)" purpose="Main app background"/>
      <variable name="--chat-area" light="oklch(0.93 ...)" dark="oklch(0.18 ...)" purpose="Chat messages area"/>
      <variable name="--card" light="oklch(0.90 ...)" dark="oklch(0.20 ...)" purpose="Cards, headers, input"/>
      <variable name="--sidebar" light="oklch(0.96 ...)" dark="oklch(0.20 ...)" purpose="Sidebar background"/>
      <variable name="--primary" light="oklch(0.56 ...)" dark="oklch(0.68 ...)" purpose="Coral accent"/>
    </color_variables>

    <rules>
      <rule>NEVER define :root color variables in canvas globals.css - They will override agent colors</rule>
      <rule>Canvas uses agent's variables - e.g., var(--background), var(--card), var(--primary)</rule>
      <rule>Canvas globals.css contains only: Tailwind @theme mappings (pointing to agent's variables), ReactFlow style overrides (.react-flow__*), Scrollbar styling, Base layout (html, body, #root)</rule>
    </rules>

    <adding_new_colors>
      <step order="1">Add the variable to apps/agent/src/globals.css in both :root and html.dark sections</step>
      <step order="2">Add the Tailwind mapping in @theme inline { } block</step>
      <step order="3">Canvas will automatically have access to the new variable</step>
    </adding_new_colors>

</css_architecture>

<canvas_ui_builder>
<description>The Canvas UI Builder is a visual component customization tool that lets you browse, customize, and export shadcn/ui components.</description>

    <architecture>
      <![CDATA[

┌─────────────────────────────────────────────────────────────────┐
│ Canvas UI Builder │
│ ┌─────────────┬──────────────────────┬───────────────────────┐ │
│ │ Left Sidebar│ Preview Panel │ Inspector Panel │ │
│ │ │ │ │ │
│ │ Component │ Live component │ Props Editor │ │
│ │ Library │ preview via Vite │ (variant, size, │ │
│ │ │ dev server │ disabled, etc.) │ │
│ │ │ │ │ │
│ │ [Button] │ ┌──────────────┐ │ Variant: [default] │ │
│ │ [Card] │ │ Button │ │ Size: [md] │ │
│ │ [Dialog] │ │ Preview │ │ Disabled: [ ] │ │
│ │ [Input] │ └──────────────┘ │ │ │
│ │ ... │ │ [Save Component] │ │
│ └─────────────┴──────────────────────┴───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
]]>
</architecture>

    <first_run_setup>
      <trigger>CanvasSetupWizard on first launch</trigger>
      <location>~/.orbit/canvas/</location>
      <steps>
        <step order="1">Creates directory structure</step>
        <step order="2">Downloads shadcn/ui components from registry</step>
        <step order="3">Sets up Vite preview server config</step>
        <step order="4">Installs npm dependencies</step>
      </steps>
    </first_run_setup>

    <backend_commands language="Rust">
      <command name="canvas_check_setup" description="Check if ~/.orbit/canvas is initialized"/>
      <command name="canvas_initialize" description="Create directory structure"/>
      <command name="canvas_download_components" description="Download shadcn components from registry"/>
      <command name="canvas_start_preview_server" description="Start Vite dev server for live preview"/>
      <command name="canvas_stop_preview_server" description="Stop the preview server"/>
      <command name="canvas_save_component" description="Save customized component to registry"/>
      <command name="canvas_export_to_project" description="Export component to external project"/>
    </backend_commands>

    <frontend_hooks>
      <hook name="useCanvasSetup" description="Setup state and initialization flow"/>
      <hook name="useComponentRegistry" description="Local component registry CRUD"/>
      <hook name="usePreviewServer" description="Preview server lifecycle management"/>
    </frontend_hooks>

    <canvas_directory_structure>
      <![CDATA[

apps/Canvas-UI-Builder/src/
├── components/
│ ├── setup/ # CanvasSetupWizard
│ ├── inspector/ # InspectorPanel, PropsEditor
│ ├── preview/ # PreviewPanel (Vite iframe)
│ ├── sidebar/ # ComponentList
│ ├── dialogs/ # SaveComponentDialog
│ └── layout/ # CanvasRootLayout, sidebars
├── hooks/
│ ├── use-canvas-setup.ts
│ ├── use-component-registry.ts
│ └── use-preview-server.ts
├── stores/
│ ├── css-customization-store.ts
│ └── design-tokens-store.ts
├── CanvasApp.tsx # Root component
└── globals.css # Canvas styles (no colors!)
]]>
</canvas_directory_structure>

    <orbit_canvas_structure>
      <![CDATA[

~/.orbit/canvas/
├── components/
│ └── ui/ # Downloaded shadcn components
│ ├── button.tsx
│ ├── card.tsx
│ └── ...
├── lib/
│ └── utils.ts # cn() utility
├── registry/
│ └── local.json # Saved customized components
├── package.json # Dependencies
└── vite.config.ts # Preview server config
]]>
</orbit_canvas_structure>
</canvas_ui_builder>

<feature_documentation>
<location>docs/</location>
<features>
<feature name="Embedded Browser" file="docs/architecture/EMBEDDED_BROWSER.md" description="Tauri multiwebview browser panel, WKWebView workarounds, idle timeout system"/>
<feature name="CSP Security" file="docs/architecture/CSP-SECURITY.md" description="Content Security Policy config, why unsafe-eval is required for streamdown"/>
</features>
</feature_documentation>

  <changelog>
    <period date="January 2026">
      <entry>Canvas UI Builder - Visual component builder with shadcn/ui (Rust backend + React frontend)</entry>
      <entry>Agent Skills - Vercel's react-best-practices and web-design-guidelines</entry>
      <entry>Embedded browser - WebKit via Tauri multiwebview</entry>
      <entry>pnpm → Bun migration</entry>
    </period>
    <reference>See CLAUDE-CONTINUOUS.md for detailed changelog.</reference>
  </changelog>
</claude_code_guidance>
