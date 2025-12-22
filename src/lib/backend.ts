/**
 * Backend abstraction layer for Tauri
 *
 * This module provides a unified API for all backend operations.
 * All functions use Tauri invoke() for communication with the Rust backend.
 */

// ============================================
// Tauri Detection & Imports
// ============================================

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    console.warn(`[Mock] invoke('${command}')`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

type EventCallback<T> = (payload: T) => void;

async function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void> {
  if (!IS_TAURI) {
    console.warn(`[Mock] listen('${event}')`);
    return (): void => {
      // No-op for mock mode
    };
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}

// ============================================
// File Operations
// ============================================

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>('read_file_bytes', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function writeFileBytes(path: string, content: number[]): Promise<void> {
  return invoke('write_file_bytes', { path, content });
}

export async function listDirectory(path: string, showHidden?: boolean): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_directory', { path, showHidden });
}

export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke('create_directory', { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath });
}

export async function copyFile(from: string, to: string): Promise<void> {
  return invoke('copy_file', { from, to });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export async function isDirectory(path: string): Promise<boolean> {
  return invoke<boolean>('is_directory', { path });
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke<FileInfo>('get_file_info', { path });
}

// ============================================
// LSP Operations
// ============================================

export async function lspSetWorkspace(path: string): Promise<void> {
  return invoke('lsp_set_workspace', { path });
}

export async function getCompletions(
  path: string,
  line: number,
  column: number
): Promise<CompletionItem[]> {
  return invoke<CompletionItem[]>('lsp_completions', { path, line, column });
}

export async function getHover(
  path: string,
  line: number,
  column: number
): Promise<HoverInfo | null> {
  return invoke<HoverInfo | null>('lsp_hover', { path, line, column });
}

export async function gotoDefinition(
  path: string,
  line: number,
  column: number
): Promise<Location | null> {
  return invoke<Location | null>('lsp_goto_definition', { path, line, column });
}

export async function findReferences(
  path: string,
  line: number,
  column: number
): Promise<Location[]> {
  return invoke<Location[]>('lsp_find_references', { path, line, column });
}

export async function formatDocument(path: string): Promise<string> {
  return invoke<string>('lsp_format', { path });
}

export async function getDiagnostics(path: string): Promise<Diagnostic[]> {
  return invoke<Diagnostic[]>('lsp_diagnostics', { path });
}

export async function getSignatureHelp(
  path: string,
  line: number,
  column: number
): Promise<SignatureHelp | null> {
  return invoke<SignatureHelp | null>('lsp_signature_help', { path, line, column });
}

export async function lspDidOpen(path: string, language: string, content: string): Promise<void> {
  return invoke('lsp_did_open', { path, language, content });
}

export async function lspDidChange(path: string, content: string, version: number): Promise<void> {
  return invoke('lsp_did_change', { path, content, version });
}

export async function lspDidSave(path: string): Promise<void> {
  return invoke('lsp_did_save', { path });
}

export async function lspDidClose(path: string): Promise<void> {
  return invoke('lsp_did_close', { path });
}

/**
 * Start a language server for the given language.
 * @param language - Language ID (e.g., "rust", "typescript", "python")
 * @param rootPath - Workspace root path
 */
export async function lspStart(language: string, rootPath: string): Promise<void> {
  return invoke('lsp_start', { language, rootPath });
}

/**
 * Stop a language server.
 * @param language - Language ID to stop
 */
export async function lspStop(language: string): Promise<void> {
  return invoke('lsp_stop', { language });
}

/**
 * Check if a language server is running.
 * @param language - Language ID to check
 */
export async function lspIsRunning(language: string): Promise<boolean> {
  return invoke<boolean>('lsp_is_running', { language });
}

/**
 * Get list of running language servers.
 */
export async function lspRunningServers(): Promise<string[]> {
  return invoke<string[]>('lsp_running_servers');
}

// ============================================
// Terminal Operations
// ============================================

export async function createTerminal(
  id: string,
  cwd?: string,
  shell?: string,
  cols?: number,
  rows?: number
): Promise<TerminalInfo> {
  return invoke<TerminalInfo>('terminal_create', { id, cwd, shell, cols, rows });
}

export async function writeTerminal(id: string, data: string): Promise<void> {
  return invoke('terminal_write', { id, data });
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke('terminal_resize', { id, cols, rows });
}

export async function closeTerminal(id: string): Promise<void> {
  return invoke('terminal_close', { id });
}

export async function listTerminals(): Promise<string[]> {
  return invoke<string[]>('terminal_list');
}

// Internal interface for raw base64 terminal output from backend
interface RawTerminalOutputEvent {
  id: string;
  data: string; // base64 encoded
}

/**
 * Decode base64 string to UTF-8 text.
 */
function decodeBase64(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    // If decoding fails, return empty string
    return '';
  }
}

export async function onTerminalOutput(
  callback: (data: TerminalOutputEvent) => void
): Promise<() => void> {
  return listen<RawTerminalOutputEvent>('terminal:output', (raw): void => {
    // Decode base64 data to string
    const decoded = decodeBase64(raw.data);
    callback({
      id: raw.id,
      data: decoded,
    });
  });
}

export async function onTerminalExit(
  callback: (data: TerminalExitEvent) => void
): Promise<() => void> {
  return listen<TerminalExitEvent>('terminal:exit', callback);
}

// ============================================
// Git Operations
// ============================================

export async function gitDiscover(path: string): Promise<string> {
  return invoke<string>('git_discover', { path });
}

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { repoPath });
}

export async function gitStage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_stage', { repoPath, files });
}

export async function gitUnstage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_unstage', { repoPath, files });
}

export async function gitStageAll(repoPath: string): Promise<void> {
  return invoke('git_stage_all', { repoPath });
}

export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return invoke<string>('git_commit', { repoPath, message });
}

export async function gitDiff(repoPath: string, file?: string): Promise<string> {
  return invoke<string>('git_diff', { repoPath, file });
}

export async function gitDiffStructured(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_diff_structured', { repoPath });
}

export async function gitStagedDiff(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_staged_diff', { repoPath });
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_discard', { repoPath, files });
}

export async function gitLog(repoPath: string, limit?: number): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_log', { repoPath, limit });
}

export async function gitBranches(repoPath: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>('git_branches', { repoPath });
}

export async function gitBranchInfo(repoPath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>('git_branch_info', { repoPath });
}

export async function gitCheckout(repoPath: string, branch: string): Promise<void> {
  return invoke('git_checkout', { repoPath, branch });
}

export async function gitCreateBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_create_branch', { repoPath, name });
}

export async function gitDeleteBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_delete_branch', { repoPath, name });
}

export async function gitBlame(repoPath: string, file: string): Promise<BlameLine[]> {
  return invoke<BlameLine[]>('git_blame', { repoPath, file });
}

// ============================================
// AI Operations
// ============================================

export async function aiChat(
  messages: ChatMessage[],
  model?: string,
  onChunk?: (chunk: string) => void
): Promise<ChatResponse> {
  // Set up streaming listener if callback provided
  let unlisten: (() => void) | undefined;
  if (onChunk) {
    unlisten = await listen<string>('ai:chunk', onChunk);
  }

  try {
    return await invoke<ChatResponse>('ai_chat', { messages, model });
  } finally {
    unlisten?.();
  }
}

export async function aiComplete(
  prefix: string,
  suffix: string,
  language: string
): Promise<string> {
  return invoke<string>('ai_complete', { prefix, suffix, language });
}

export async function aiStopGeneration(): Promise<void> {
  return invoke('ai_stop');
}

// ============================================
// Search Operations
// ============================================

export async function searchFiles(
  rootPath: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_files', { rootPath, query, ...options });
}

export async function searchText(
  rootPath: string,
  pattern: string,
  options?: SearchOptions
): Promise<TextSearchResult[]> {
  return invoke<TextSearchResult[]>('search_text', { rootPath, pattern, ...options });
}

// ============================================
// File Watcher
// ============================================

export async function watchPath(path: string): Promise<void> {
  return invoke('watch_path', { path });
}

export async function unwatchPath(path: string): Promise<void> {
  return invoke('unwatch_path', { path });
}

export async function onFileChange(
  callback: (event: FileChangeEvent) => void
): Promise<() => void> {
  return listen<FileChangeEvent>('file:change', callback);
}

// ============================================
// Window Operations
// ============================================

export async function openFileDialog(
  options?: FileDialogOptions
): Promise<string | string[] | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] openFileDialog');
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open(options);
}

export async function saveFileDialog(options?: SaveDialogOptions): Promise<string | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] saveFileDialog');
    return null;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save(options);
}

// ============================================
// Clipboard
// ============================================

export async function clipboardRead(): Promise<string> {
  if (!IS_TAURI) {
    return navigator.clipboard.readText();
  }
  const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
  return readText();
}

export async function clipboardWrite(text: string): Promise<void> {
  if (!IS_TAURI) {
    return navigator.clipboard.writeText(text);
  }
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
  return writeText(text);
}

// ============================================
// App Info
// ============================================

export async function getAppVersion(): Promise<string> {
  if (!IS_TAURI) {
    return '0.0.0-dev';
  }
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function getWorkspacePath(): Promise<string | null> {
  return invoke<string | null>('get_workspace_path');
}

export async function setWorkspacePath(path: string): Promise<void> {
  return invoke('set_workspace_path', { path });
}

// ============================================
// Settings Operations
// ============================================

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke('update_settings', { settings });
}

export async function addRecentProject(path: string): Promise<void> {
  return invoke('add_recent_project', { path });
}

export async function getRecentProjects(): Promise<string[]> {
  return invoke<string[]>('get_recent_projects');
}

export async function clearRecentProjects(): Promise<void> {
  return invoke('clear_recent_projects');
}

export async function getSettingsPath(): Promise<string> {
  return invoke<string>('get_settings_path');
}

// ============================================
// Types
// ============================================

export interface FileEntry {
  /** Full path to the file */
  path: string;
  /** File name without directory */
  name: string;
  /** Whether this is a directory */
  isDir: boolean;
  /** Whether this is a symbolic link */
  isSymlink: boolean;
  /** Whether this is a hidden file (name starts with dot) */
  isHidden: boolean;
  /** File size in bytes (undefined for directories) */
  size?: number;
  /** Last modified timestamp (Unix epoch seconds) */
  modified?: number;
}

export interface FileInfo {
  path: string;
  name: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  created: number;
  readonly: boolean;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface HoverInfo {
  contents: string;
  range?: Range;
}

export interface Location {
  path: string;
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  range: Range;
  source?: string;
  code?: string;
}

export interface SignatureHelp {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: ParameterInfo[];
}

export interface ParameterInfo {
  label: string;
  documentation?: string;
}

export interface TerminalInfo {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface TerminalOutputEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  code: number;
}

/**
 * File status in git.
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'
  | 'typechange';

/**
 * A file's status entry in git.
 */
export interface StatusEntry {
  /** File path relative to repository root */
  path: string;
  /** Status type */
  status: FileStatus;
  /** Original path for renames/copies */
  oldPath: string | null;
  /** Similarity percentage for renames/copies (0-100) */
  similarity: number | null;
}

/**
 * Complete git repository status.
 */
export interface GitStatus {
  /** Current branch name (empty if detached HEAD) */
  branch: string;
  /** Upstream branch name if tracking */
  upstream: string | null;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Files staged for commit (in index) */
  staged: StatusEntry[];
  /** Files modified but not staged (in working tree) */
  modified: StatusEntry[];
  /** Untracked files */
  untracked: StatusEntry[];
  /** Files with merge conflicts */
  conflicted: StatusEntry[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: number;
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream?: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}

export interface DiffLine {
  origin: string;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
  isBinary: boolean;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  content: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model?: string;
  stopReason?: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  include?: string[];
  exclude?: string[];
  maxResults?: number;
}

export interface SearchResult {
  path: string;
  name: string;
  isDir: boolean;
}

export interface TextSearchResult {
  path: string;
  line: number;
  column: number;
  matchLength: number;
  lineContent: string;
  beforeContext?: string[];
  afterContext?: string[];
}

export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
}

export interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  vimMode: boolean;
}

export interface ThemeSettings {
  theme: string;
  accentColor?: string;
}

export interface AISettings {
  enabled: boolean;
  inlineSuggestions: boolean;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface Settings {
  editor: EditorSettings;
  theme: ThemeSettings;
  ai: AISettings;
  windowState: WindowState;
  recentProjects: string[];
}

// ============================================
// Utility: Check if running in Tauri
// ============================================

export function isTauri(): boolean {
  return IS_TAURI;
}
