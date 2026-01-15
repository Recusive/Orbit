# CLAUDE-CONTINUOUS.md

Extended documentation for the Orbit codebase. This file contains detailed examples, historical context, and verbose explanations that supplement the main `CLAUDE.md` guide.

> **Note:** For quick reference, see `CLAUDE.md`. This file provides deeper context for specific topics.

---

## Package Manager Migration History

> **Migration Note (January 2026):** This project migrated from **pnpm** to **Bun** for faster installs,
> unified tooling (Bun handles both package management and the agent-bridge runtime), and simpler
> workspace configuration. The `pnpm-workspace.yaml` file was removed - workspaces are now defined
> directly in `package.json`. If you encounter old documentation or scripts referencing pnpm,
> replace with the Bun equivalents below.

| Context         | Use     | Why                                                          |
| --------------- | ------- | ------------------------------------------------------------ |
| Root monorepo   | **Bun** | Fast package management with workspace support               |
| `apps/*`        | **Bun** | Part of Bun workspace                                        |
| `agent-bridge/` | **Bun** | Claude Agent SDK sidecar - compiles to standalone Bun binary |

---

## Agent Bridge Sidecar - Deep Dive

### Why Manual Rebuild?

The agent-bridge requires manual rebuilding because:

- Tauri watches Rust code, not the agent-bridge TypeScript
- The sidecar is a standalone binary (58MB) with embedded Bun runtime
- Located at `target/debug/agent-bridge` in dev mode

### Build Outputs Explained

| Script              | Output                      | Purpose                         |
| ------------------- | --------------------------- | ------------------------------- |
| `bun run build`     | `dist/index.js`             | JS bundle (requires Bun to run) |
| `bun run build:dev` | `target/debug/agent-bridge` | Standalone binary for Tauri     |

The `build:dev` script compiles the TypeScript to a standalone Bun binary that can be executed without the Bun runtime installed. This is required for Tauri to spawn it as a sidecar process.

---

## Integration Testing - Extended Examples

### Real Integration Test Example

```typescript
// ❌ BAD: Mock test that proves nothing
it('should analyze intent', () => {
  const mockAnalyzer = { analyze: () => ({ useFastPath: true }) };
  expect(mockAnalyzer.analyze('test').useFastPath).toBe(true);
});

// ✅ GOOD: Real integration test
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
  const snapshot = manager['convertToSnapshot'](state);
  const analysis = intentAnalyzer.analyze('Create a button', snapshot);

  // Verify REAL routing decision
  expect(analysis.useFastPath).toBe(true);
  expect(analysis.fastPathAgent).toBe('component');

  // Cleanup REAL session
  await manager.deleteSession('test-session');
});
```

### Why This Matters

```text
❌ WRONG: "Tests pass" with mocked data
   → Deploys to production
   → Real system fails because mock didn't match reality
   → Hours of debugging

✅ RIGHT: Tests pass with real integration
   → Actual API calls verified working
   → Full data flow tested
   → Confidence that production will work
```

### Example - Adding Orchestrator to Session Manager

```text
❌ WRONG:
   - Mocked IntentAnalyzer to return fake results
   - Mocked Orchestrator to skip real execution
   - Tests pass but nothing actually works

✅ RIGHT:
   - Created REAL sessions with REAL Claude SDK
   - Tested REAL IntentAnalyzer routing decisions
   - Verified REAL orchestrator lifecycle (create, cleanup)
   - Tested REAL snapshot conversion with actual canvas state
   - All 44 tests pass with REAL integration
```

---

## Tauri WebView Blur - Detailed Examples

### Example: Fixing Blurry Nodes in ReactFlow

**Problem:** Workflow nodes in Canvas app appeared blurry in Tauri but crisp in browser.

**Root Cause:** The `MarkdownCardNode.css` had these problematic styles:

```css
/* BAD - causes blur in Tauri WebView */
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
```

**Solution:** Replace with solid values and remove transitions:

```css
/* GOOD - crisp rendering in Tauri WebView */
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
```

### Debugging Blur Issues

1. **Identify the blurry element** - Check if it's specific to certain components
2. **Compare with working components** - Find similar components that render crisp
3. **Check CSS differences** - Look for `backdrop-filter`, `color-mix()`, `transition`, `animation`
4. **Remove one property at a time** - Isolate which property causes the blur
5. **Replace with solid alternatives** - Use CSS variables and remove transitions

**Note:** `contain: layout style paint` and `will-change: transform` do NOT fix the blur issue. The only solution for elements inside ReactFlow's viewport is to completely remove transitions and animations.

---

## Security Vulnerabilities - Extended Details

### MCP SDK ReDoS (CVE-2026-0621)

**Advisory:** [GHSA-8r9q-7v3j-jr4g](https://github.com/advisories/GHSA-8r9q-7v3j-jr4g)

**Issue:** The `@modelcontextprotocol/sdk` (versions ≤1.25.1) has a Regular Expression Denial of Service vulnerability in the UriTemplate class. Attackers can craft malicious URIs that trigger catastrophic regex backtracking, causing CPU exhaustion.

**Risk Assessment for Orbit:** **Low practical risk** because:

1. The agent-bridge runs as a local sidecar, not exposed to the internet
2. URIs come from our own Claude SDK calls, not untrusted user input
3. An attacker would need local access to craft malicious URIs

**Mitigation:** We've added an override for `qs>=6.14.1` to fix a related DoS vulnerability in the transitive dependency chain. The MCP SDK issue requires an upstream fix from Anthropic - update `@modelcontextprotocol/sdk` when a patched version is released.

**To check for updates:**

```bash
bun pm audit                  # Check current vulnerabilities (use npm audit if needed)
bun pm view @modelcontextprotocol/sdk version  # Check latest version
```

---

## Changelog - Extended History

### January 2026

- **Added Agent Skills** - Integrated Vercel's agent-skills for React best practices and web design guidelines
  - `.claude/skills/react-best-practices.md` - 45 rules across 8 categories from Vercel Engineering
  - `.claude/skills/web-design-guidelines.md` - 100+ accessibility, UX, and performance rules
  - Source: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- **Embedded browser panel** - True embedded WebKit browser via Tauri's `unstable` feature (multiwebview)
  - See `docs/architecture/EMBEDDED_BROWSER.md` for implementation details and known issues
- **Migrated from pnpm to Bun** - All package management now uses Bun for faster installs and unified tooling
  - Removed `pnpm-workspace.yaml` - workspaces defined in `package.json`
  - Removed `pnpm-lock.yaml` - replaced by `bun.lockb`
  - Updated all scripts, CI workflows, and husky hooks to use `bun`
  - Added comprehensive `lint-all.sh` script for running all checks
- **Added comprehensive audit** - Aligned all linting, TypeScript, and CI checks across the monorepo
- **Documented module organization patterns** - Barrel pattern for frontend, explicit paths for Rust backend
  - Frontend: Every folder with multiple files gets an `index.ts` barrel
  - Backend: Tauri commands use explicit paths, shared crates use selective re-exports
