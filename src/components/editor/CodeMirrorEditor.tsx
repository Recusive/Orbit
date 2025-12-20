import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
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
import { lintKeymap } from '@codemirror/lint';
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
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { CompletionItem } from '@/lib/backend';
import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import type { FC } from 'react';

import { getCompletions } from '@/lib/backend';



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

const darkTheme = EditorView.theme({
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
}, { dark: true });

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

interface CodeMirrorEditorProps {
  readonly value: string;
  readonly language: string;
  readonly filePath?: string;
  readonly onChange?: (value: string) => void;
  readonly onSave?: () => void;
  readonly readOnly?: boolean;
  readonly theme?: 'dark' | 'light';
  readonly className?: string;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);

  // Get language extension
  const getLanguageExtension = useCallback((lang: string): Extension => {
    const factory = languages[lang.toLowerCase()];
    return factory ? factory() : [];
  }, []);

  // LSP completion source
  const completionSource = useMemo(() => {
    return async (context: { state: EditorState; pos: number; explicit: boolean }): Promise<{
      from: number;
      options: {
        label: string;
        type: string;
        detail?: string;
        info?: string;
        apply?: string;
      }[];
    } | null> => {
      if (!filePath) return null;

      const { state, pos } = context;
      const line = state.doc.lineAt(pos);
      const lineNumber = line.number - 1; // 0-indexed for LSP
      const column = pos - line.from;

      try {
        const completions: CompletionItem[] = await getCompletions(filePath, lineNumber, column);
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
    };
  }, [filePath]);

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
            return true;
          },
        },
      ]),

      // Compartments for runtime reconfiguration
      languageCompartment.of(getLanguageExtension(language)),
      themeCompartment.of(theme === 'dark' ? [darkTheme, syntaxHighlighting(darkHighlightStyle)] : [lightTheme, syntaxHighlighting(lightHighlightStyle)]),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),

      // Update listener
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          valueRef.current = newValue;
          onChange?.(newValue);
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

  // Update language
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language, getLanguageExtension]);

  // Update theme
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? [darkTheme, syntaxHighlighting(darkHighlightStyle)] : [lightTheme, syntaxHighlighting(lightHighlightStyle)]),
    });
  }, [theme]);

  // Update read-only state
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden ${className ?? ''}`}
    />
  );
};

// ============================================
// Helpers
// ============================================

function getCompletionType(kind: number): string {
  // LSP CompletionItemKind mapping
  switch (kind) {
    case 1: return 'text';
    case 2: return 'method';
    case 3: return 'function';
    case 4: return 'constructor';
    case 5: return 'field';
    case 6: return 'variable';
    case 7: return 'class';
    case 8: return 'interface';
    case 9: return 'module';
    case 10: return 'property';
    case 11: return 'unit';
    case 12: return 'value';
    case 13: return 'enum';
    case 14: return 'keyword';
    case 15: return 'snippet';
    case 16: return 'color';
    case 17: return 'file';
    case 18: return 'reference';
    case 19: return 'folder';
    case 20: return 'enum-member';
    case 21: return 'constant';
    case 22: return 'struct';
    case 23: return 'event';
    case 24: return 'operator';
    case 25: return 'type';
    default: return 'text';
  }
}
