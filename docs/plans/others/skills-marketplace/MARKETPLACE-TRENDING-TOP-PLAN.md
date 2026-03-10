# Plan: Marketplace — Trending + Top Skills on Landing

## Context

When users open the Skills Marketplace tab, it currently shows an empty state ("Browse skills by searching above") because `loadInitial` calls `runSearch('')`, which the Rust backend rejects (query < 2 chars → empty array). The skill.sh website has two useful views:

- **`/trending`** — Skills ranked by 24-hour momentum (what's hot right now)
- **`/`** — All-time leaderboard (most installed overall)

Neither has a public API endpoint — data is server-rendered via Next.js RSC and embedded in HTML as `self.__next_f.push()` calls. Both pages use identical JSON skill objects (field order may vary):

```json
{ "source": "tul-sh/skills", "skillId": "qwen-image-2", "name": "qwen-image-2", "installs": 14220 }
```

**Goal**: When the user lands on the Marketplace tab, show a pill toggle for `Trending | Top` with skills loaded immediately. Search works normally and overrides the pill view. Data updates frequently → short cache TTL.

> **Scraping caveat**: The RSC serialization format is an internal Next.js implementation detail. Field ordering and additional fields may change without notice. The parser must tolerate reordering and unknown fields — see `parse_browse_page` design below.

---

## UX Design: Segmented Pill Inside MarketplacePane

```
┌─────────────────────────────────────────────────┐
│  🔍 Search marketplace                       [×]│  ← existing search
├─────────────────────────────────────────────────┤
│  [Installed] [Marketplace]                      │  ← existing parent tabs
├─────────────────────────────────────────────────┤
│  (Trending) (Top)                               │  ← NEW pill toggle
│                                                 │
│  ┌──────────┐  ┌──────────┐                     │
│  │  skill 1  │  │  skill 2  │                   │
│  └──────────┘  └──────────┘                     │
│  ┌──────────┐  ┌──────────┐                     │
│  │  skill 3  │  │  skill 4  │                   │  ← 2-col grid (reused)
│  └──────────┘  └──────────┘                     │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

**Behavior:**

- Default: `Trending` selected, trending skills shown in grid
- Click `Top`: switches to all-time top skills
- Type in search: pill deselects, search results shown instead
- Clear search: restore last-selected pill view from cached data
- Pill only visible when search is empty

---

## Files to Modify

### 1. Rust Backend: `src-tauri/src/commands/agent/marketplace.rs`

**Add `skills_marketplace_browse` command:**

Single command with a typed `category` enum:

```rust
/// Browse category — typed enum avoids raw-string validation drift.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum BrowseCategory {
    Trending,
    Top,
}

impl BrowseCategory {
    fn url(self) -> &'static str {
        match self {
            Self::Trending => "https://skills.sh/trending",
            Self::Top => "https://skills.sh",
        }
    }

    fn cache_key(self) -> &'static str {
        match self {
            Self::Trending => "trending",
            Self::Top => "top",
        }
    }
}

#[tauri::command]
pub async fn skills_marketplace_browse(
    cache: State<'_, MarketplaceCache>,
    category: BrowseCategory,
) -> Result<Vec<MarketplaceSkill>, String>
```

- Serde deserializes `"trending"` / `"top"` directly — invalid values produce a Tauri-level error, no manual validation needed
- Map to URL via `category.url()`
- Check browse cache (keyed by category)
- On miss: fetch HTML, parse with `parse_browse_page()`, cache, return
- Limit to 24 results (top of page, fills grid)

**Add `parse_browse_page(body: &str) -> Result<Vec<MarketplaceSkill>, String>` helper:**

Returns `Result` — the sanity check emits `Err`, successful parse (including 0 matches) returns `Ok(vec)`.

Uses `serde_json` extraction instead of regex — tolerates field reordering and additional fields:

```rust
/// Permissive candidate shape — all fields Option so partial matches are skipped.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowseSkillCandidate {
    source: Option<String>,
    skill_id: Option<String>,
    name: Option<String>,
    installs: Option<u64>,
}

/// Max body size to parse (512 KB). Rejects anti-bot/CDN pages that are abnormally large.
const BROWSE_MAX_BODY_BYTES: usize = 512 * 1024;
/// Max brace-scan attempts before early exit (prevents pathological CPU on hostile HTML).
const BROWSE_MAX_PARSE_ATTEMPTS: usize = 2000;

fn parse_browse_page(body: &str) -> Result<Vec<MarketplaceSkill>, String> {
    // Sanity: reject bodies that are too large or clearly not skills.sh content
    if body.len() > BROWSE_MAX_BODY_BYTES {
        return Err("Response from skills.sh exceeds size limit".to_owned());
    }
    if body.len() > 100 && !body.contains("\"skillId\"") {
        return Err("Unexpected response from skills.sh".to_owned());
    }

    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let mut attempts = 0;

    for (start, _) in body.match_indices('{') {
        if attempts >= BROWSE_MAX_PARSE_ATTEMPTS || results.len() >= 24 {
            break;
        }
        let remaining = &body[start..];
        for (end, _) in remaining.match_indices('}') {
            attempts += 1;
            if attempts >= BROWSE_MAX_PARSE_ATTEMPTS {
                break;
            }
            let candidate = &remaining[..=end];
            if let Ok(parsed) = serde_json::from_str::<BrowseSkillCandidate>(candidate) {
                let (Some(source), Some(skill_id), Some(name), Some(installs)) =
                    (parsed.source, parsed.skill_id, parsed.name, parsed.installs)
                else {
                    continue;
                };
                let id = format!("{source}/{skill_id}");
                if seen.insert(id.clone()) {
                    results.push(MarketplaceSkill { id, skill_id, name, installs, source });
                }
                break; // Found valid JSON at this start position
            }
        }
    }

    if !body.trim().is_empty() && results.is_empty() {
        log::warn!("skills_marketplace_browse parsed zero candidates from non-empty body");
    }

    Ok(results)
}
```

Key safeguards:

- **Body size cap** (`BROWSE_MAX_BODY_BYTES = 512 KB`): rejects abnormally large anti-bot/CDN pages
- **Parse attempt cap** (`BROWSE_MAX_PARSE_ATTEMPTS = 2000`): prevents pathological CPU on brace-heavy HTML
- **Sanity check** emits `Err` (surfaced to frontend as error state), not silent empty vec
- **Zero-match warning** logged for non-empty bodies where parsing succeeds but finds nothing

**Add browse cache to `MarketplaceCache`:**

Reuse the existing `CacheEntry` type and cache helpers (`insert_cache_entry`, `remove_expired_cache_entries`):

```rust
// In MarketplaceCache — add alongside existing search_cache:
browse_cache: RwLock<HashMap<String, CacheEntry>>,  // keyed by "trending" | "top"
```

- TTL: uses existing `CACHE_TTL_SECS` (300s) — same as search cache for consistency. Backend cache prevents hammering skill.sh; frontend cache provides instant tab switching.
- Max 2 entries (one per category) — reuse `insert_cache_entry` which handles eviction

**Reuse**: `create_http_client()` for the HTTP request, `CacheEntry` for cache storage.

### 2. Rust Registration: `src-tauri/src/lib.rs` (~line 376)

Add `marketplace::skills_marketplace_browse` to `generate_handler![]`.

### 3. Frontend API: `apps/agent/src/lib/api/marketplace.ts`

Add:

```typescript
export type BrowseCategory = 'trending' | 'top';

export async function browseMarketplaceSkills(
  category: BrowseCategory
): Promise<MarketplaceSkill[]> {
  return invoke<MarketplaceSkill[]>('skills_marketplace_browse', { category });
}
```

### 4. Frontend UI: `apps/agent/src/components/modals/skills/MarketplacePane.tsx`

**New state:**

```typescript
type BrowseCategory = 'trending' | 'top';

interface BrowseCacheEntry {
  readonly data: MarketplaceSkill[];
  readonly fetchedAt: number; // Date.now()
}

const [browseCategory, setBrowseCategory] = useState<BrowseCategory>('trending');
const browseCacheRef = useRef<Partial<Record<BrowseCategory, BrowseCacheEntry>>>({});
```

- `browseCache` uses `useRef` (not `useState`) — avoids re-renders on cache writes. Only read synchronously at the start of `loadBrowse`/`switchCategory`.
- **Timestamped cache entries** — `fetchedAt` enables frontend-side staleness checks. If a cached entry is older than 5 minutes (`CACHE_TTL_SECS`), treat it as a miss and re-fetch. This prevents stale data when the dialog stays open for extended periods.
- **No `isSearching` boolean** — derive search mode from a single normalized `trimmedSearch` constant (see below).

**Search normalization — single source of truth for all branches:**

```typescript
/** Normalize once, use everywhere: debounce effect, render, retry. */
const trimmedSearch = search.trim();
const isSearchActive = trimmedSearch.length > 0;
```

> **Why**: Using raw `search` in the debounce effect but `search.trim()` in render causes a divergence on whitespace-only input (`"   "`). The effect fires `runSearch("   ")` (backend rejects it → empty results) while render shows browse pills (trim is empty). Normalizing to `trimmedSearch` everywhere prevents this.

**Helper — invalidate pending requests and apply cached data:**

```typescript
const BROWSE_CACHE_TTL_MS = 300_000; // 5 minutes, matches backend CACHE_TTL_SECS

/** Invalidate any in-flight request so its response is discarded. */
const invalidatePending = (): void => {
  requestSequenceRef.current += 1;
};

/** Apply browse data from cache, invalidating pending requests. Returns false if cache is missing/stale. */
const applyBrowseFromCache = (category: BrowseCategory): boolean => {
  const entry = browseCacheRef.current[category];
  if (entry === undefined || Date.now() - entry.fetchedAt > BROWSE_CACHE_TTL_MS) {
    return false;
  }
  invalidatePending();
  setError(null);
  setIsLoading(false);
  setHasLoaded(true);
  setResults(entry.data);
  return true;
};
```

**Modify `loadInitial`:**

- Replace `await runSearch('')` with `await loadBrowse('trending')`
- `loadBrowse(cat)`: calls `browseMarketplaceSkills(cat)`, caches in `browseCacheRef`, sets `results`

**New `loadBrowse(category)` function — uses `applyBrowseFromCache` + `requestSequenceRef` for race safety:**

```typescript
const loadBrowse = useCallback(async (category: BrowseCategory): Promise<void> => {
  // Instant cache hit — invalidates pending requests so stale search can't overwrite
  if (applyBrowseFromCache(category)) {
    return;
  }

  // Cache miss or stale — fetch from backend
  const requestId = requestSequenceRef.current + 1;
  requestSequenceRef.current = requestId;

  setIsLoading(true);
  setError(null);

  try {
    const skills = await browseMarketplaceSkills(category);
    if (requestId !== requestSequenceRef.current) return;
    browseCacheRef.current[category] = { data: skills, fetchedAt: Date.now() };
    setResults(skills);
  } catch (err: unknown) {
    if (requestId !== requestSequenceRef.current) return;
    // Stale-cache fallback: if fetch fails but we have expired cache, serve it instead of error
    const staleEntry = browseCacheRef.current[category];
    if (staleEntry !== undefined) {
      setResults(staleEntry.data);
      setError(null);
    } else {
      const message = err instanceof Error ? err.message : 'Failed to load marketplace skills';
      setError(message);
      setResults([]);
    }
  } finally {
    if (requestId === requestSequenceRef.current) {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }
}, []);
```

**Modify search debounce effect — uses `trimmedSearch` everywhere:**

- When `trimmedSearch` is non-empty: run `runSearch(trimmedSearch)` after debounce
- When `trimmedSearch` becomes empty: call `applyBrowseFromCache(browseCategory)` — if stale/missing, fall through to `loadBrowse(browseCategory)`
- **Key**: `applyBrowseFromCache` increments `requestSequenceRef`, so any slow in-flight search response is discarded
- Whitespace-only input (e.g., `"   "`) is treated as empty — pills stay visible, no backend call issued

**Category pill toggle (render when `!isSearchActive`):**

```tsx
{
  !isSearchActive && (
    <div className="inline-flex rounded-xl bg-lg-control p-1">
      <button
        type="button"
        onClick={() => switchCategory('trending')}
        className={cn(
          'h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
          browseCategory === 'trending'
            ? 'bg-control-fill text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Trending
      </button>
      <button
        type="button"
        onClick={() => switchCategory('top')}
        className={cn(
          'h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
          browseCategory === 'top'
            ? 'bg-control-fill text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Top
      </button>
    </div>
  );
}
```

> Pill styles match `SkillsDialog.tsx` parent tabs exactly (same `bg-control-fill shadow-sm` active pattern, `bg-lg-control` container) — only reduced to `h-7 text-[11px]`.

**`switchCategory(cat)`:**

- `setBrowseCategory(cat)`
- Call `applyBrowseFromCache(cat)` — if stale/missing, call `loadBrowse(cat)` (shows skeleton)

**Empty state updates (category-aware):**

- `isSearchActive && results.length === 0`: "No results found" (existing)
- `!isSearchActive && results.length === 0`: `Couldn't load ${browseCategory === 'trending' ? 'trending' : 'top'} skills` + Retry button

**Retry button — uses `trimmedSearch` / `isSearchActive` for consistent mode detection:**

```tsx
<button
  onClick={() => {
    if (isSearchActive) {
      void runSearch(trimmedSearch);
    } else {
      void loadBrowse(browseCategory);
    }
  }}
>
  Retry
</button>
```

---

## Key Design Decisions

1. **Single `browse` command, typed enum** — `BrowseCategory` enum with serde rename avoids raw-string validation drift. Invalid values produce a Tauri-level error automatically.
2. **Shared `CACHE_TTL_SECS` (300s)** — Reuses existing search cache TTL and `CacheEntry` type. Backend cache prevents hammering skill.sh; frontend `useRef` cache provides instant tab switching within a session.
3. **`serde_json` extraction over regex** — Tolerates field reordering, additional fields, and escaped characters in the RSC payload. Regex would silently break if skills.sh changes serialization order. Hard caps on body size (512 KB) and parse attempts (2000) prevent pathological CPU usage.
4. **`parse_browse_page` returns `Result`** — Sanity-check failures (body too large, no `"skillId"` found) emit `Err` surfaced to the frontend. Successful parse with 0 matches returns `Ok(vec![])` + warning log. No ambiguity between format changes and empty results.
5. **Pill hidden during search** — Clean UX: search results are neither "trending" nor "top", so the toggle doesn't apply. All branches use a single `trimmedSearch` / `isSearchActive` derivation to prevent whitespace-only divergence.
6. **Same `MarketplaceSkill` type throughout** — `MarketplaceSkillCard` works unchanged for trending, top, and search results.
7. **`applyBrowseFromCache` invalidates pending requests** — Cache-hit restore increments `requestSequenceRef`, so stale in-flight search responses are discarded. Prevents the race where: user searches → clears search → browse restored from cache → slow search response arrives and overwrites browse.
8. **Timestamped frontend cache** — `BrowseCacheEntry.fetchedAt` enables frontend-side staleness checks. Entries older than `BROWSE_CACHE_TTL_MS` (5 min) are treated as misses, preventing stale data when the dialog stays open.
9. **Graceful degradation** — If skill.sh changes their HTML format, parser returns 0 matches → category-aware empty state with retry + warning logged. Search still works via the separate API endpoint.
10. **Stale-cache fallback** — If a browse fetch fails but an expired cache entry exists for that category, serve the stale data instead of showing an error. Better to show slightly outdated skills than a blank error state.
11. **Parser caps are best-effort** — If `BROWSE_MAX_PARSE_ATTEMPTS` is reached before all valid candidates are found, the command returns a partial result (<24 skills). This is acceptable — the UI renders whatever skills are returned without distinguishing partial from complete.

---

## Verification

### Rust unit tests (`marketplace.rs`)

Tests for `parse_browse_page()`:

- Mock HTML with skill objects in expected field order → returns `Ok(skills)`
- Mock HTML with **reordered fields** (e.g., `name` before `source`) → still returns `Ok(skills)`
- Mock HTML with **extra fields** (e.g., `"description":"..."`) → still returns `Ok(skills)`
- Mock HTML with no skill objects → returns `Ok(vec![])`
- Mock HTML with duplicate skill IDs → deduplicates correctly
- Non-HTML body (e.g., Cloudflare challenge) → returns `Err("Unexpected response...")`
- Body exceeding `BROWSE_MAX_BODY_BYTES` → returns `Err("...exceeds size limit")`
- Body with many braces but no valid candidates → early-exits via `BROWSE_MAX_PARSE_ATTEMPTS`

### Frontend automated tests (`MarketplacePane.test.tsx`)

Extend existing test coverage:

```typescript
it('shows pill toggle with Trending selected by default when search is empty');
it('hides pill toggle when search has content');
it('switches to Top category and renders cached data instantly');
it('restores browse category after clearing search, ignoring stale search response', async () => {
  // 1) load trending browse
  // 2) issue slow search request
  // 3) clear search → cache restore via applyBrowseFromCache
  // 4) resolve slow search
  // expect: browse cards still rendered, not stale search results
});
it('calls loadBrowse on retry when not searching');
it('calls runSearch on retry when searching');
it('shows category-aware empty state ("trending" vs "top")');
it('treats whitespace-only search as empty — pills stay visible, no backend call', () => {
  // Set search to "   " → trimmedSearch is "" → isSearchActive is false
  // Expect: pill toggle rendered, no runSearch call issued
});
it('serves stale cache when browse fetch fails and expired entry exists', async () => {
  // 1) load trending successfully (populates cache)
  // 2) expire cache entry (mock Date.now)
  // 3) trigger re-fetch that fails
  // expect: stale cached skills rendered, no error state
});
```

### Manual verification

1. `bunx tauri dev` → Skills dialog → Marketplace tab → Should show trending skills immediately with pill toggle
2. **Tab switch**: Click `Top` → grid updates to all-time skills → click `Trending` → instant switch from cache
3. **Search flow**: Type query → pill disappears, search results show → clear search → pill reappears with last category
4. **Race condition**: Open marketplace tab and immediately start typing a search query → search results should display (not stale browse results)
5. **Retry**: Disconnect network → open marketplace → see error → reconnect → click Retry → skills load
6. **Cache TTL**: Keep dialog open > 5 min, switch tabs → triggers re-fetch (not stale cache)

### Quality gates

- `./scripts/lint-all.sh --no-test`
- `bun run check`
- `bun run test` (includes new MarketplacePane tests)
