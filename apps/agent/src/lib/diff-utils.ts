import type { DiffHunk, DiffLine, FileDiff } from '@/stores/file-store';

/**
 * Compute a simple diff from old and new content strings.
 * Shows all old lines as deletions and all new lines as additions.
 * This is appropriate for Edit tool where we only have the replaced section.
 */
export function computeSimpleDiff(oldContent: string, newContent: string): FileDiff {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  const lines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  // All old lines as deletions
  for (const line of oldLines) {
    lines.push({
      type: 'delete',
      content: line,
      oldLineNumber: oldLineNum++,
    });
  }

  // All new lines as additions
  for (const line of newLines) {
    lines.push({
      type: 'add',
      content: line,
      newLineNumber: newLineNum++,
    });
  }

  const hunk: DiffHunk = {
    oldStart: 1,
    oldLines: oldLines.length,
    newStart: 1,
    newLines: newLines.length,
    lines,
  };

  return {
    additions: newLines.length,
    deletions: oldLines.length,
    hunks: [hunk],
  };
}

/**
 * Get the language identifier from a file path based on extension.
 */
export function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    scala: 'scala',
    r: 'r',
    sql: 'sql',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    markdown: 'markdown',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    toml: 'toml',
    ini: 'ini',
    env: 'plaintext',
    txt: 'plaintext',
  };

  // Handle special filenames
  const filename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'makefile';
  if (filename.startsWith('.env')) return 'plaintext';

  return languageMap[extension] ?? 'plaintext';
}
