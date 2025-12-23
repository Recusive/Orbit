import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useCallback, useEffect, useRef } from 'react';

import type { CompletionItem } from '@/lib/backend';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { Tooltip, ViewUpdate } from '@codemirror/view';
import type { FC } from 'react';

import { useFileDiagnostics } from '@/hooks/use-file-diagnostics';
import { useLsp } from '@/hooks/use-lsp';
import { useFileStore } from '@/stores/file-store';

// ============================================
// Compartments for runtime reconfiguration
// ============================================

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

// ============================================
// Language support map
// ============================================

type LanguageFactory = () => Extension;

const languages: Record<string, LanguageFactory> = {
  javascript: () => javascript(),
  javascriptreact: () => javascript({ jsx: true }),
  jsx: () => javascript({ jsx: true }),
  typescript: () => javascript({ typescript: true }),
  typescriptreact: () => javascript({ typescript: true, jsx: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  python: () => python(),
  rust: () => rust(),
  go: () => go(),
  json: () => json(),
  html: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  markdown: () => markdown(),
  md: () => markdown(),
};

// ============================================
// Custom dark theme (matches app background)
// ============================================

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'oklch(0.16 0.012 60)', // Same as --background in dark mode
      color: '#e1e1e1',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: '#e1e1e1',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#e1e1e1',
    },
    '.cm-dropCursor': {
      borderLeftColor: '#e1e1e1',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'oklch(0.55 0.03 60)', // Warm brown matching --muted-foreground
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    // Hover tooltip dark theme
    '.cm-tooltip': {
      backgroundColor: 'oklch(0.22 0.012 60)',
      color: '#e1e1e1',
    },
    '.cm-tooltip .cm-lsp-hover': {
      backgroundColor: 'oklch(0.22 0.012 60)',
    },
    // Diagnostic squiggles
    '.cm-lintRange-error': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%23f87171' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
      paddingBottom: '2px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%23fbbf24' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
      paddingBottom: '2px',
    },
    '.cm-lintRange-info': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%2360a5fa' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
      paddingBottom: '2px',
    },
    '.cm-lintRange-hint': {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%239ca3af' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
      paddingBottom: '2px',
    },
    // Lint gutter markers
    '.cm-lint-marker-error': {
      content: '"●"',
      color: '#f87171',
    },
    '.cm-lint-marker-warning': {
      content: '"●"',
      color: '#fbbf24',
    },
  },
  { dark: true }
);

// Custom syntax highlighting (similar to github-dark)
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  { tag: tags.operator, color: '#ff7b72' },
  { tag: tags.special(tags.variableName), color: '#ffa657' },
  { tag: tags.typeName, color: '#79c0ff' },
  { tag: tags.atom, color: '#79c0ff' },
  { tag: tags.number, color: '#79c0ff' },
  { tag: tags.bool, color: '#79c0ff' },
  { tag: tags.null, color: '#79c0ff' },
  { tag: tags.definition(tags.variableName), color: '#ffa657' },
  { tag: tags.self, color: '#79c0ff' },
  { tag: tags.function(tags.variableName), color: '#d2a8ff' },
  { tag: tags.function(tags.propertyName), color: '#d2a8ff' },
  { tag: tags.definition(tags.function(tags.variableName)), color: '#d2a8ff' },
  { tag: tags.className, color: '#ffa657' },
  { tag: tags.definition(tags.className), color: '#ffa657' },
  { tag: tags.propertyName, color: '#79c0ff' },
  { tag: tags.comment, color: '#8b949e', fontStyle: 'italic' },
  { tag: tags.string, color: '#a5d6ff' },
  { tag: tags.regexp, color: '#7ee787' },
  { tag: tags.escape, color: '#7ee787' },
  { tag: tags.tagName, color: '#7ee787' },
  { tag: tags.attributeName, color: '#79c0ff' },
  { tag: tags.attributeValue, color: '#a5d6ff' },
  { tag: tags.punctuation, color: '#e1e1e1' },
  { tag: tags.bracket, color: '#e1e1e1' },
  { tag: tags.meta, color: '#8b949e' },
]);

// ============================================
// Light theme
// ============================================

const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'oklch(0.98 0.005 75)', // Same as --background in light mode
    color: '#24292f',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: '#24292f',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#24292f',
  },
  '.cm-dropCursor': {
    borderLeftColor: '#24292f',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'oklch(0.50 0.03 60)', // Warm brown matching --muted-foreground
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  // Hover tooltip light theme
  '.cm-tooltip': {
    backgroundColor: '#ffffff',
    color: '#24292f',
    border: '1px solid rgba(0, 0, 0, 0.1)',
  },
  '.cm-tooltip .cm-lsp-hover': {
    backgroundColor: '#ffffff',
  },
  // Diagnostic squiggles (darker colors for light mode)
  '.cm-lintRange-error': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%23dc2626' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    paddingBottom: '2px',
  },
  '.cm-lintRange-warning': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%23d97706' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    paddingBottom: '2px',
  },
  '.cm-lintRange-info': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%232563eb' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    paddingBottom: '2px',
  },
  '.cm-lintRange-hint': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 L6 0' fill='none' stroke='%236b7280' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    paddingBottom: '2px',
  },
  // Lint gutter markers
  '.cm-lint-marker-error': {
    content: '"●"',
    color: '#dc2626',
  },
  '.cm-lint-marker-warning': {
    content: '"●"',
    color: '#d97706',
  },
});

// Light syntax highlighting (github-light style)
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#cf222e' },
  { tag: tags.operator, color: '#cf222e' },
  { tag: tags.special(tags.variableName), color: '#953800' },
  { tag: tags.typeName, color: '#0550ae' },
  { tag: tags.atom, color: '#0550ae' },
  { tag: tags.number, color: '#0550ae' },
  { tag: tags.bool, color: '#0550ae' },
  { tag: tags.null, color: '#0550ae' },
  { tag: tags.definition(tags.variableName), color: '#953800' },
  { tag: tags.self, color: '#0550ae' },
  { tag: tags.function(tags.variableName), color: '#8250df' },
  { tag: tags.function(tags.propertyName), color: '#8250df' },
  { tag: tags.definition(tags.function(tags.variableName)), color: '#8250df' },
  { tag: tags.className, color: '#953800' },
  { tag: tags.definition(tags.className), color: '#953800' },
  { tag: tags.propertyName, color: '#0550ae' },
  { tag: tags.comment, color: '#6e7781', fontStyle: 'italic' },
  { tag: tags.string, color: '#0a3069' },
  { tag: tags.regexp, color: '#116329' },
  { tag: tags.escape, color: '#116329' },
  { tag: tags.tagName, color: '#116329' },
  { tag: tags.attributeName, color: '#0550ae' },
  { tag: tags.attributeValue, color: '#0a3069' },
  { tag: tags.punctuation, color: '#24292f' },
  { tag: tags.bracket, color: '#24292f' },
  { tag: tags.meta, color: '#6e7781' },
]);

// ============================================
// Props
// ============================================

interface GotoPosition {
  line: number; // 0-indexed
  column: number; // 0-indexed
  /** Unique ID to ensure effect re-triggers for same position */
  id: number;
}

interface CodeMirrorEditorProps {
  readonly value: string;
  readonly language: string;
  readonly filePath?: string;
  readonly onChange?: (value: string) => void;
  readonly onSave?: () => void;
  readonly readOnly?: boolean;
  readonly theme?: 'dark' | 'light';
  readonly className?: string;
  /** Position to scroll to (0-indexed line/column) */
  readonly gotoPosition?: GotoPosition | null;
  /** Called after scrolling to the position */
  readonly onGotoComplete?: () => void;
}

// ============================================
// Component
// ============================================

export const CodeMirrorEditor: FC<CodeMirrorEditorProps> = ({
  value,
  language,
  filePath,
  onChange,
  onSave,
  readOnly = false,
  theme = 'dark',
  className,
  gotoPosition,
  onGotoComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const versionRef = useRef(0);

  // Get workspace root path for LSP
  const rootPath = useFileStore((state) => state.rootPath);

  // Initialize LSP hook
  const lsp = useLsp(language, rootPath);

  // Get diagnostics for this file
  const { diagnostics: lspDiagnostics } = useFileDiagnostics(filePath ?? null);

  // Refs to access current values in callbacks without stale closures
  const lspRef = useRef(lsp);
  const filePathRef = useRef(filePath);
  // Track which file is currently registered with LSP to prevent race conditions
  const lspOpenedFileRef = useRef<string | null>(null);
  lspRef.current = lsp;
  filePathRef.current = filePath;

  // Get language extension
  const getLanguageExtension = useCallback((lang: string): Extension => {
    const factory = languages[lang.toLowerCase()];
    return factory ? factory() : [];
  }, []);

  // LSP completion source - uses refs to avoid stale closure in editor initialization
  const completionSource = useCallback(
    async (context: {
      state: EditorState;
      pos: number;
      explicit: boolean;
    }): Promise<{
      from: number;
      options: {
        label: string;
        type: string;
        detail?: string;
        info?: string;
        apply?: string;
      }[];
    } | null> => {
      const currentPath = filePathRef.current;
      const currentLsp = lspRef.current;

      if (!currentPath || !currentLsp.isRunning) return null;

      const { state, pos } = context;
      const line = state.doc.lineAt(pos);
      const lineNumber = line.number - 1; // 0-indexed for LSP
      const column = pos - line.from;

      try {
        const completions: CompletionItem[] = await currentLsp.getCompletions(
          currentPath,
          lineNumber,
          column
        );
        if (completions.length === 0) return null;

        return {
          from: pos,
          options: completions.map((c) => {
            const option: {
              label: string;
              type: string;
              detail?: string;
              info?: string;
              apply?: string;
            } = {
              label: c.label,
              type: getCompletionType(c.kind),
              apply: c.insertText ?? c.label,
            };
            if (c.detail) option.detail = c.detail;
            if (c.documentation) option.info = c.documentation;
            return option;
          }),
        };
      } catch {
        return null;
      }
    },
    [] // No dependencies - uses refs for current values
  );

  // LSP hover tooltip source - uses refs to avoid stale closure
  const hoverTooltipSource = useCallback(
    async (view: EditorView, pos: number): Promise<Tooltip | null> => {
      const currentPath = filePathRef.current;
      const currentLsp = lspRef.current;

      if (!currentPath || !currentLsp.isRunning) return null;

      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number - 1; // 0-indexed for LSP
      const column = pos - line.from;

      try {
        const hoverInfo = await currentLsp.getHover(currentPath, lineNumber, column);
        if (!hoverInfo?.contents) return null;

        // Calculate tooltip position range
        let from = pos;
        let to = pos;

        if (hoverInfo.range) {
          // Convert LSP range to CodeMirror positions
          const startLine = view.state.doc.line(hoverInfo.range.start.line + 1);
          const endLine = view.state.doc.line(hoverInfo.range.end.line + 1);
          from = startLine.from + hoverInfo.range.start.column;
          to = endLine.from + hoverInfo.range.end.column;
        } else {
          // Find word boundaries at position
          const wordAt = view.state.wordAt(pos);
          if (wordAt) {
            from = wordAt.from;
            to = wordAt.to;
          }
        }

        return {
          pos: from,
          end: to,
          above: true,
          create: (): { dom: HTMLElement } => {
            const dom = document.createElement('div');
            dom.className = 'cm-lsp-hover';
            // Render content as pre-formatted text (LSP often returns markdown/code)
            const pre = document.createElement('pre');
            pre.textContent = hoverInfo.contents;
            dom.appendChild(pre);
            return { dom };
          },
        };
      } catch {
        return null;
      }
    },
    [] // No dependencies - uses refs for current values
  );

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      // Core extensions
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),

      // Indentation
      indentUnit.of('  '),

      // Syntax highlighting
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

      // Autocompletion with LSP
      autocompletion({
        override: [completionSource],
        defaultKeymap: true,
      }),

      // LSP hover tooltips
      hoverTooltip(hoverTooltipSource, {
        hideOnChange: true,
        hoverTime: 300,
      }),

      // Diagnostics (squiggles) - using external setDiagnostics, linter just enables display
      linter(() => [], { delay: 0 }),
      lintGutter(),

      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          run: (): boolean => {
            onSave?.();
            // Notify LSP that file was saved
            const currentPath = filePathRef.current;
            const currentLsp = lspRef.current;
            if (currentPath && currentLsp.isRunning) {
              void currentLsp.didSave(currentPath);
            }
            return true;
          },
        },
      ]),

      // Compartments for runtime reconfiguration
      languageCompartment.of(getLanguageExtension(language)),
      themeCompartment.of(
        theme === 'dark'
          ? [darkTheme, syntaxHighlighting(darkHighlightStyle)]
          : [lightTheme, syntaxHighlighting(lightHighlightStyle)]
      ),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),

      // Update listener
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          valueRef.current = newValue;
          onChange?.(newValue);

          // Notify LSP of document changes
          const currentLsp = lspRef.current;
          const currentPath = filePathRef.current;
          if (currentPath && currentLsp.isRunning) {
            versionRef.current += 1;
            void currentLsp.didChange(currentPath, newValue, versionRef.current);
          }
        }
      }),

      // Base styling
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
        },
        '.cm-scroller': {
          fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", "Monaco", monospace',
          lineHeight: '1.6',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: 'none',
          paddingRight: '8px',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          minWidth: '3ch',
          paddingRight: '8px',
        },
        // LSP hover tooltip styling
        '.cm-tooltip': {
          border: 'none',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        },
        '.cm-lsp-hover': {
          padding: '8px 12px',
          maxWidth: '500px',
          maxHeight: '300px',
          overflow: 'auto',
          fontSize: '12px',
          lineHeight: '1.5',
        },
        '.cm-lsp-hover pre': {
          margin: '0',
          padding: '0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", "Monaco", monospace',
        },
      }),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return (): void => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update content when value prop changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
    valueRef.current = value;
  }, [value]);

  // LSP lifecycle: didOpen when file opens, didClose on unmount or file change
  useEffect(() => {
    if (!filePath) {
      // If filePath becomes null/undefined, close any previously opened file
      const previousFile = lspOpenedFileRef.current;
      if (previousFile) {
        void lsp.didClose(previousFile);
        lspOpenedFileRef.current = null;
      }
      return;
    }

    // Close previous file if different (handles rapid file switching)
    const previousFile = lspOpenedFileRef.current;
    if (previousFile && previousFile !== filePath) {
      void lsp.didClose(previousFile);
    }

    // Open new file
    lspOpenedFileRef.current = filePath;
    void lsp.didOpen(filePath, language, valueRef.current);
    // Reset version when opening a new file
    versionRef.current = 0;

    return (): void => {
      // Only close if this file is still the one we opened
      // (prevents race condition with rapid file switching)
      if (lspOpenedFileRef.current === filePath) {
        void lsp.didClose(filePath);
        lspOpenedFileRef.current = null;
      }
    };
    // Only trigger on filePath/language change, not lsp object changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, language]);

  // Update language
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language, getLanguageExtension]);

  // Update theme
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(
        theme === 'dark'
          ? [darkTheme, syntaxHighlighting(darkHighlightStyle)]
          : [lightTheme, syntaxHighlighting(lightHighlightStyle)]
      ),
    });
  }, [theme]);

  // Update read-only state
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Update diagnostics (squiggles)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Convert LSP diagnostics to CodeMirror diagnostics
    const cmDiagnostics: CmDiagnostic[] = lspDiagnostics
      .map((d) => {
        const doc = view.state.doc;

        // Convert 0-indexed line/column to CodeMirror positions
        const startLine = Math.min(d.range.start.line + 1, doc.lines);
        const endLine = Math.min(d.range.end.line + 1, doc.lines);

        const startLineInfo = doc.line(startLine);
        const endLineInfo = doc.line(endLine);

        const from = startLineInfo.from + Math.min(d.range.start.column, startLineInfo.length);
        const to = endLineInfo.from + Math.min(d.range.end.column, endLineInfo.length);

        // Ensure valid range (from <= to)
        if (from > to || from < 0 || to > doc.length) return null;

        // Map LSP severity to CodeMirror severity
        const severityMap: Record<string, 'error' | 'warning' | 'info' | 'hint'> = {
          error: 'error',
          warning: 'warning',
          info: 'info',
          hint: 'hint',
        };

        const diagnostic: CmDiagnostic = {
          from,
          to,
          severity: severityMap[d.severity] ?? 'info',
          message: d.message,
        };

        // Only add source if present
        if (d.source) {
          diagnostic.source = d.source;
        }

        return diagnostic;
      })
      .filter((d): d is CmDiagnostic => d !== null);

    // Dispatch diagnostics to CodeMirror
    view.dispatch(setDiagnostics(view.state, cmDiagnostics));
  }, [lspDiagnostics]);

  // Track the last executed goto ID to prevent double execution
  const lastExecutedGotoIdRef = useRef<number | null>(null);

  // Function to execute goto (only if not already executed)
  const executeGoto = useCallback(
    (view: EditorView, pos: GotoPosition): void => {
      // Skip if already executed this goto
      if (lastExecutedGotoIdRef.current === pos.id) return;
      lastExecutedGotoIdRef.current = pos.id;

      // Convert 0-indexed line to 1-indexed for CodeMirror
      const lineNumber = pos.line + 1;
      const doc = view.state.doc;

      // Clamp line number to valid range
      const clampedLineNumber = Math.max(1, Math.min(lineNumber, doc.lines));
      const line = doc.line(clampedLineNumber);

      // Calculate position (clamp column to line length)
      const column = Math.min(pos.column, line.length);
      const cursorPos = line.from + column;

      // Scroll to position and set cursor
      view.dispatch({
        selection: { anchor: cursorPos },
        scrollIntoView: true,
        effects: EditorView.scrollIntoView(cursorPos, { y: 'center' }),
      });

      // Focus the editor
      view.focus();

      // Notify that goto is complete
      onGotoComplete?.();
    },
    [onGotoComplete]
  );

  // Handle goto position (scroll to line/column)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !gotoPosition) return;

    executeGoto(view, gotoPosition);
  }, [gotoPosition, executeGoto]);

  // Check for pending goto after editor mounts (handles race condition)
  useEffect(() => {
    // Small delay to ensure editor is fully initialized
    const timeoutId = setTimeout(() => {
      const view = viewRef.current;
      if (view && gotoPosition) {
        executeGoto(view, gotoPosition);
      }
    }, 50);

    return (): void => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once after mount

  return <div ref={containerRef} className={`h-full w-full overflow-hidden ${className ?? ''}`} />;
};

// ============================================
// Helpers
// ============================================

function getCompletionType(kind: number): string {
  // LSP CompletionItemKind mapping
  switch (kind) {
    case 1:
      return 'text';
    case 2:
      return 'method';
    case 3:
      return 'function';
    case 4:
      return 'constructor';
    case 5:
      return 'field';
    case 6:
      return 'variable';
    case 7:
      return 'class';
    case 8:
      return 'interface';
    case 9:
      return 'module';
    case 10:
      return 'property';
    case 11:
      return 'unit';
    case 12:
      return 'value';
    case 13:
      return 'enum';
    case 14:
      return 'keyword';
    case 15:
      return 'snippet';
    case 16:
      return 'color';
    case 17:
      return 'file';
    case 18:
      return 'reference';
    case 19:
      return 'folder';
    case 20:
      return 'enum-member';
    case 21:
      return 'constant';
    case 22:
      return 'struct';
    case 23:
      return 'event';
    case 24:
      return 'operator';
    case 25:
      return 'type';
    default:
      return 'text';
  }
}
