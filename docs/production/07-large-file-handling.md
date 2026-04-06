# Mission 07: Large File Handling

> Size guards, terminal caps, 100k-line files.

---

## Why This Matters

A production code editor will inevitably encounter large files. A user opens a 500MB log file, a minified 2MB JavaScript bundle, a repo with 34k untracked files, or a terminal that spews 50k lines of test output. Today, Orbit has no size guards on any of these paths. The `readFile()` command will happily attempt to load a 500MB file into the WebView's memory, causing an OOM crash. The terminal output array grows without bound using O(n) splice on every line. Git status with 34k untracked files is a known OOM issue. The app needs hard limits, soft warnings, and graceful fallbacks.

Pierre diff already guards files >200KB -- that's the model to follow everywhere else.

---

## Current State

### readFile() Has No Size Limit (files.ts:53-55)

The frontend `readFile()` function passes the path directly to Rust with no size check:

```typescript
// Current: no guard at all
async function readFile(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
}
// A 500MB file = 500MB string in WebView memory = OOM
```

### Terminal Output Array + O(n) Splice (terminal-store.ts:335-362)

Terminal output is stored as an unbounded array. Each new batch of lines is spliced in:

```typescript
// Current: unbounded growth, O(n) splice per batch
set((state) => {
  state.outputs.splice(state.outputs.length, 0, ...newLines);
});
// After 50k lines: array is 50k entries, each splice copies the tail
```

### CodeMirror Large File Blocking

CodeMirror 6 handles large files well after initialization, but the first parse of a 100k-line file blocks the main thread for 200-500ms while the parser processes the full document. There is no incremental first-paint.

### Pierre Diff Guards >200KB Files

Pierre diff viewer already has size guards:

```typescript
// Existing good pattern to replicate:
if (fileSize > 200 * 1024) {
  return <LargeFileFallback size={fileSize} />;
}
```

### 34k Untracked Files Cause OOM (Known Issue)

Git status returns all untracked files at once. With 34k+ files (e.g., node_modules not in .gitignore), the entire list is serialized, sent over IPC, parsed, and stored in memory. This triggers OOM.

---

## What To Add

### Backend Hard Limit + Soft Warning (Rust)

```rust
// commands/common/files.rs

const HARD_LIMIT: u64 = 50 * 1024 * 1024;  // 50MB absolute maximum
const WARN_LIMIT: u64 = 10 * 1024 * 1024;  // 10MB soft warning

#[derive(Serialize)]
pub struct FileReadResult {
    pub content: Option<String>,
    pub size: u64,
    pub truncated: bool,
    pub is_binary: bool,
    pub warning: Option<String>,
}

#[tauri::command]
pub async fn read_file_safe(path: String) -> Result<FileReadResult, String> {
    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let size = metadata.len();

    // Binary detection (first 8KB)
    if is_binary_file(&path)? {
        return Ok(FileReadResult {
            content: None,
            size,
            truncated: false,
            is_binary: true,
            warning: Some("Binary file cannot be displayed as text".into()),
        });
    }

    // Hard limit
    if size > HARD_LIMIT {
        return Ok(FileReadResult {
            content: None,
            size,
            truncated: true,
            is_binary: false,
            warning: Some(format!(
                "File is {}MB (limit: {}MB). Use an external editor for files this large.",
                size / (1024 * 1024),
                HARD_LIMIT / (1024 * 1024)
            )),
        });
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Soft warning
    let warning = if size > WARN_LIMIT {
        Some(format!(
            "Large file ({}MB). Some features may be slower.",
            size / (1024 * 1024)
        ))
    } else {
        None
    };

    Ok(FileReadResult {
        content: Some(content),
        size,
        truncated: false,
        is_binary: false,
        warning,
    })
}
```

### Streaming File Read for Large Files

```rust
// For files between WARN_LIMIT and HARD_LIMIT, stream in chunks

#[tauri::command]
pub async fn read_file_chunked(
    path: String,
    offset: u64,
    chunk_size: u64,
) -> Result<FileChunk, String> {
    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let metadata = file.metadata()
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let mut reader = std::io::BufReader::new(file);
    reader.seek(std::io::SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    let mut buffer = vec![0u8; chunk_size as usize];
    let bytes_read = reader.read(&mut buffer)
        .map_err(|e| format!("Failed to read: {}", e))?;

    buffer.truncate(bytes_read);

    Ok(FileChunk {
        content: String::from_utf8_lossy(&buffer).into_owned(),
        offset,
        bytes_read: bytes_read as u64,
        total_size: metadata.len(),
        is_last: offset + bytes_read as u64 >= metadata.len(),
    })
}
```

### Terminal Ring Buffer (10k Capacity)

```typescript
// stores/terminal/terminal-ring-buffer.ts

class TerminalRingBuffer {
  private readonly buffer: string[];
  private head = 0;
  private _size = 0;
  private readonly capacity: number;

  constructor(capacity: number = 10_000) {
    this.capacity = capacity;
    this.buffer = new Array<string>(capacity);
  }

  get size(): number {
    return this._size;
  }

  get dropped(): number {
    return Math.max(0, this.totalPushed - this.capacity);
  }

  private totalPushed = 0;

  push(line: string): void {
    this.buffer[this.head] = line;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
    this.totalPushed++;
  }

  pushBatch(lines: readonly string[]): void {
    for (const line of lines) this.push(line);
  }

  getVisible(start: number, count: number): string[] {
    const result: string[] = [];
    const actualStart = this._size < this.capacity ? start : (this.head + start) % this.capacity;

    for (let i = 0; i < count && i < this._size; i++) {
      result.push(this.buffer[(actualStart + i) % this.capacity]);
    }
    return result;
  }
}
```

### Git Status Pagination

```rust
// commands/common/git.rs

const GIT_STATUS_PAGE_SIZE: usize = 500;

#[derive(Serialize)]
pub struct GitStatusPage {
    pub entries: Vec<GitStatusEntry>,
    pub total: usize,
    pub page: usize,
    pub has_more: bool,
}

#[tauri::command]
pub async fn get_git_status_paged(
    path: String,
    page: usize,
) -> Result<GitStatusPage, String> {
    let all_entries = get_all_git_status(&path)?;
    let total = all_entries.len();
    let start = page * GIT_STATUS_PAGE_SIZE;
    let end = std::cmp::min(start + GIT_STATUS_PAGE_SIZE, total);

    Ok(GitStatusPage {
        entries: all_entries[start..end].to_vec(),
        total,
        page,
        has_more: end < total,
    })
}
```

### Binary File Detection

```rust
// lib/file_utils.rs

fn is_binary_file(path: &str) -> Result<bool, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open: {}", e))?;

    let mut buffer = [0u8; 8192];
    let bytes_read = file.read(&mut buffer)
        .map_err(|e| format!("Failed to read: {}", e))?;

    // Check for null bytes (strong binary indicator)
    let null_count = buffer[..bytes_read].iter().filter(|&&b| b == 0).count();
    Ok(null_count > 0)
}
```

---

## What We Get

| Metric                               | Before                           | After                                |
| ------------------------------------ | -------------------------------- | ------------------------------------ |
| 500MB file open                      | OOM crash                        | "File too large" message with size   |
| 15MB file open                       | Silent load, potential freeze    | Warning banner + full load           |
| Binary file open                     | Garbled text display             | "Binary file" message                |
| Terminal at 50k lines                | 50k-entry array, O(n) per splice | 10k ring buffer, O(1) per push       |
| Git status with 34k untracked files  | OOM                              | Paginated (500/page), UI shows count |
| Large file first-paint in CodeMirror | 200-500ms block                  | Chunked load, progressive render     |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: Backend size guards (hard limit, soft warning, binary detection) + frontend integration
- Day 2: Terminal ring buffer + replace splice pattern
- Day 3: Git status pagination + chunked file read + testing with large files

---

## Dependencies

- None blocking. Can start immediately.
- Terminal ring buffer also appears in Mission #02 (Streaming Backpressure). Implement once, use in both.

---

## Risks

| Risk                                                  | Mitigation                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 50MB hard limit too low for some users                | Make it configurable in settings. 50MB is a safe default.                                         |
| Ring buffer drops early terminal output               | Show "X lines dropped" indicator at top. 10k lines is generous for interactive use.               |
| Git pagination breaks "select all" UX                 | Frontend can request all pages sequentially for batch operations. Pagination is the default view. |
| Binary detection false positives (e.g., UTF-16 files) | Check for BOM markers (UTF-16 LE/BE) before null-byte check. UTF-16 files are text.               |
| Chunked file read complicates CodeMirror integration  | CodeMirror can accept document updates. Load first 100KB immediately, background-load the rest.   |
