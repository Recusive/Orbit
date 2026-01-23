# Plan: Move AST Transform to Rust Backend

## Problem

The app fails to load with `ReferenceError: Can't find variable: process` because `@babel/types` expects Node.js `process.env` in the browser. The current workaround (polyfill in vite.config.ts) is not a proper fix.

## Solution

Move Tailwind class transformation from browser JavaScript (Babel) to Rust backend using a regex-based approach. This eliminates browser/Node.js incompatibility.

---

## Implementation Steps

### Step 1: Create Rust Transform Module

**New file:** `src-tauri/src/commands/canvas/transform.rs`

Port the core logic from `apps/Canvas-UI-Builder/src/lib/ast/transform.ts`:

```rust
// Key structures
pub struct StyleChange {
    pub property: String,
    pub value: String,
    pub tailwind_class: String,
}

pub struct TransformResult {
    pub success: bool,
    pub code: Option<String>,
    pub added_classes: Vec<String>,
    pub removed_classes: Vec<String>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}
```

**Regex patterns to implement:**

1. `className="..."` - Direct string literals
2. `className={cn("...", ...)}` - Utility function calls
3. `cva("...", {...})` - CVA base classes (only first argument)

**Key algorithms to port:**

- `get_conflict_prefix()` - Extract prefix for conflict detection (e.g., `rounded-lg` → `rounded`)
- `has_variant_prefix()` - Detect variant prefixes (hover:, md:, dark:)
- `replace_classes()` - Replace conflicting classes while preserving variants

**Token maps to include:**

- Border radius: none/sm/md/lg/xl/2xl/3xl/full
- Spacing: 0-96 scale
- Font size: xs-9xl
- Font weight: thin-black

### Step 2: Add Tauri Command

**In `transform.rs`:**

```rust
#[tauri::command]
pub async fn canvas_persist_styles(
    component_path: String,
    changes: Vec<StyleChange>,
    test_mode: bool,
) -> Result<TransformResult, String>
```

This command:

1. Reads component source from file
2. Transforms Tailwind classes
3. Creates backup (using existing backup logic from persist.rs)
4. Writes modified source back
5. Returns result with added/removed classes

### Step 3: Register Command

**Modify:** `src-tauri/src/commands/canvas/mod.rs`

- Add `pub mod transform;`
- Re-export `canvas_persist_styles`

**Modify:** `src-tauri/src/lib.rs`

- Add `canvas_persist::canvas_persist_styles` to invoke_handler

### Step 4: Update Frontend Hook

**Modify:** `apps/Canvas-UI-Builder/src/hooks/use-style-persistence.ts`

Replace Babel transform call with Tauri invoke:

```typescript
// Before (browser-side Babel)
import { transformTailwindClasses } from '@canvas/lib/ast/transform';
const result = transformTailwindClasses(source, changes);

// After (Rust backend)
const result = await invoke<TransformResult>('canvas_persist_styles', {
  componentPath,
  changes,
  testMode: false,
});
```

### Step 5: Remove Babel from Bundle

**Delete or mark unused:**

- `apps/Canvas-UI-Builder/src/lib/ast/transform.ts` - Keep file but remove Babel imports
- Keep `replaceClasses`, `getConflictPrefix`, `hasVariantPrefix` for potential future use

**Remove from package.json** (if solely used by Canvas):

- `@babel/parser`
- `@babel/traverse`
- `@babel/generator`
- `@babel/types`

### Step 6: Clean Up Vite Config

**Modify:** `vite.config.ts`

Remove the process polyfill:

```typescript
// DELETE these lines:
'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
'process.env': '{}',
'process': JSON.stringify({ env: {} }),
```

---

## Critical Files

| File                                                        | Action                   |
| ----------------------------------------------------------- | ------------------------ |
| `src-tauri/src/commands/canvas/transform.rs`                | CREATE                   |
| `src-tauri/src/commands/canvas/mod.rs`                      | MODIFY                   |
| `src-tauri/src/lib.rs`                                      | MODIFY                   |
| `apps/Canvas-UI-Builder/src/hooks/use-style-persistence.ts` | MODIFY                   |
| `apps/Canvas-UI-Builder/src/lib/ast/transform.ts`           | MODIFY (remove Babel)    |
| `vite.config.ts`                                            | MODIFY (remove polyfill) |

---

## Verification

1. **Build check:** `cargo check` passes
2. **App loads:** `bunx tauri dev` starts without `process` error
3. **Style persistence works:**
   - Open Canvas UI Builder
   - Select a component (e.g., Button)
   - Change a style (e.g., border radius)
   - Verify file is updated correctly
   - Verify backup is created
4. **Integration tests:** `bun test` in Canvas-UI-Builder passes
5. **Bundle size:** Verify Babel packages removed from bundle (`dist/stats.html`)

---

## Regex Implementation Details

The Rust transform will use regex to find class targets:

```rust
// Pattern 1: className="..."
let re_classname = Regex::new(r#"className\s*=\s*"([^"]*)""#)?;

// Pattern 2: className={cn("...", ...)}
let re_cn = Regex::new(r#"(?:cn|clsx|classNames|twMerge)\s*\(\s*"([^"]*)""#)?;

// Pattern 3: cva("...", {...})  - only first argument
let re_cva = Regex::new(r#"cva\s*\(\s*"([^"]*)""#)?;
```

For each match, extract class string → apply `replace_classes()` → replace in source.

### Variant Preservation

Classes with variant prefixes (hover:, md:, dark:, etc.) are preserved unchanged:

```rust
const VARIANT_PREFIXES: &[&str] = &[
    "sm", "md", "lg", "xl", "2xl",  // responsive
    "hover", "focus", "active", "disabled",  // state
    "dark", "group-hover", "peer-hover",  // theme/group
    // ... etc
];
```

### Conflict Detection

```rust
fn get_conflict_prefix(class: &str) -> &str {
    // Strip variant prefixes first
    let base = strip_variants(class);
    // Extract prefix before first dash
    // rounded-lg → rounded
    // p-4 → p
    // text-sm → text
}
```

Classes with matching conflict prefix replace each other.
