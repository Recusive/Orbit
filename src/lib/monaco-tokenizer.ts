// Monaco tokenizer - uses Monaco's tokenization without the full editor
// This avoids web workers and CSP issues while getting proper syntax highlighting

import * as monaco from 'monaco-editor';

// Language mapping
const LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  tsx: 'typescript',
  javascript: 'javascript',
  jsx: 'javascript',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  json: 'json',
  markdown: 'markdown',
  python: 'python',
  rust: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  bash: 'shell',
  shell: 'shell',
  yaml: 'yaml',
  xml: 'xml',
  text: 'plaintext',
  plaintext: 'plaintext',
};

export interface TokenizedLine {
  lineNumber: number;
  tokens: {
    text: string;
    className: string;
  }[];
}

/**
 * Tokenize code using Monaco's tokenizer
 * Returns an array of tokenized lines with CSS class names
 */
export function tokenizeCode(code: string, language: string): TokenizedLine[] {
  // Handle empty or missing code
  if (!code) {
    return [{ lineNumber: 1, tokens: [{ text: '', className: 'mtk1' }] }];
  }

  const monacoLang = LANGUAGE_MAP[language] ?? 'plaintext';
  const lines = code.split('\n');
  const result: TokenizedLine[] = [];

  // Try to tokenize with Monaco, fall back to plain text on error
  let tokens: monaco.Token[][];
  try {
    tokens = monaco.editor.tokenize(code, monacoLang);
  } catch {
    // Fallback: return plain text lines
    return lines.map((line, i) => ({
      lineNumber: i + 1,
      tokens: [{ text: line || '', className: 'mtk1' }],
    }));
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineTokens = tokens[i] ?? [];
    const tokenizedLine: TokenizedLine = {
      lineNumber: i + 1,
      tokens: [],
    };

    let lastOffset = 0;
    for (const token of lineTokens) {
      // Add any text before this token (shouldn't happen but just in case)
      if (token.offset > lastOffset) {
        const text = line.slice(lastOffset, token.offset);
        tokenizedLine.tokens.push({
          text,
          className: 'mtk1', // default
        });
      }

      // Find the end of this token (start of next token or end of line)
      const nextTokenIndex = lineTokens.indexOf(token) + 1;
      const nextToken = lineTokens[nextTokenIndex];
      const tokenEnd = nextToken ? nextToken.offset : line.length;
      const text = line.slice(token.offset, tokenEnd);

      if (text) {
        // Convert Monaco token type to mtk class
        const className = getTokenClassName(token.type);
        tokenizedLine.tokens.push({ text, className });
      }

      lastOffset = tokenEnd;
    }

    // If no tokens, add the whole line as default
    if (tokenizedLine.tokens.length === 0 && line) {
      tokenizedLine.tokens.push({ text: line, className: 'mtk1' });
    }

    // Handle empty lines
    if (line === '') {
      tokenizedLine.tokens.push({ text: '', className: 'mtk1' });
    }

    result.push(tokenizedLine);
  }

  return result;
}

/**
 * Convert Monaco token type to mtk CSS class
 * Monaco token types are like: "keyword.ts", "string.ts", "comment.ts", etc.
 */
function getTokenClassName(tokenType: string): string {
  // Monaco token types follow patterns like:
  // keyword.ts, string.ts, comment.ts, identifier.ts, etc.
  const baseType = tokenType.split('.')[0] ?? '';

  // Map to mtk classes (these match VS Code's theme)
  switch (baseType) {
    case 'keyword':
      return 'mtk6'; // keywords like const, function, import, export
    case 'string':
      return 'mtk12'; // string literals
    case 'comment':
      return 'mtk5'; // comments
    case 'number':
      return 'mtk8'; // numbers
    case 'operator':
      return 'mtk3'; // operators
    case 'delimiter':
      return 'mtk1'; // brackets, punctuation
    case 'type':
      return 'mtk17'; // type names
    case 'identifier':
      return 'mtk10'; // identifiers
    case 'variable':
      return 'mtk19'; // variables
    case 'function':
      return 'mtk16'; // function names
    case 'tag':
      return 'mtk6'; // HTML/JSX tags
    case 'attribute':
      return 'mtk10'; // HTML/JSX attributes
    case 'metatag':
      return 'mtk14'; // JSX brackets
    default:
      return 'mtk1'; // default text
  }
}

/**
 * CSS styles for Monaco token classes
 * These match VS Code's default dark theme
 */
export const MONACO_TOKEN_CSS = `
  .mtk1 { color: var(--vscode-editor-foreground, #d4d4d4); }
  .mtk3 { color: #d4d4d4; } /* operators */
  .mtk5 { color: #6a9955; } /* comments */
  .mtk6 { color: #569cd6; } /* keywords */
  .mtk8 { color: #b5cea8; } /* numbers */
  .mtk10 { color: #9cdcfe; } /* identifiers */
  .mtk12 { color: #ce9178; } /* strings */
  .mtk14 { color: #808080; } /* JSX brackets */
  .mtk16 { color: #dcdcaa; } /* function calls */
  .mtk17 { color: #4ec9b0; } /* types */
  .mtk18 { color: #c586c0; } /* import/export */
  .mtk19 { color: #4fc1ff; } /* const variables */
`;
