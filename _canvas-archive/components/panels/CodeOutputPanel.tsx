import React, { useState, useMemo, useCallback } from 'react';

import { codeGenerator } from '../../lib/code/codeGenerator';

import type { Node, Edge } from '@xyflow/react';

// Smooth easing for micro-interactions
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface CodeOutputPanelProps {
  nodes: Node[];
  edges: Edge[];
  isVisible: boolean;
  onToggleVisibility: () => void;
  embedded?: boolean;
  selectedNodeCode?: string;
  selectedNodeLabel?: string;
}

type CodeLanguage = 'tsx' | 'jsx' | 'css';

// =============================================================================
// ICONS
// =============================================================================

const CodeIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

// 13px for copy button
const CopyIcon = (): React.JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = (): React.JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ChevronUpIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);

// 32px for empty state
const FileCodeIcon = (): React.JSX.Element => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path
      d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
      opacity="0.3"
    ></path>
    <polyline points="14 2 14 8 20 8" opacity="0.5"></polyline>
    <path d="m10 13-2 2 2 2" opacity="0.7"></path>
    <path d="m14 17 2-2-2-2" opacity="0.7"></path>
  </svg>
);

// =============================================================================
// SYNTAX HIGHLIGHTING
// =============================================================================

// Token types for syntax highlighting
type TokenType =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'component'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'tag'
  | 'attribute'
  | 'text';

interface Token {
  type: TokenType;
  content: string;
}

// Syntax highlighting colors (VS Code Dark+ inspired)
const tokenColors: Record<TokenType, string> = {
  keyword: '#c586c0', // Purple - import, export, const, function, return
  string: '#ce9178', // Orange - strings
  number: '#b5cea8', // Light green - numbers
  comment: '#6a9955', // Green - comments
  function: '#dcdcaa', // Yellow - function names
  component: '#4ec9b0', // Cyan - React components (PascalCase)
  property: '#9cdcfe', // Light blue - object properties
  operator: '#d4d4d4', // Gray - operators
  punctuation: '#808080', // Dark gray - brackets, semicolons
  tag: '#569cd6', // Blue - JSX tags
  attribute: '#9cdcfe', // Light blue - JSX attributes
  text: '#d4d4d4', // Default text
};

// Simple tokenizer for TSX/JSX
function tokenize(code: string): Token[][] {
  const lines = code.split('\n');

  return lines.map((line) => {
    const tokens: Token[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Comments
      if (remaining.startsWith('//')) {
        tokens.push({ type: 'comment', content: remaining });
        break;
      }

      // Multi-line comment start
      if (remaining.startsWith('/*')) {
        const endIndex = remaining.indexOf('*/');
        if (endIndex !== -1) {
          tokens.push({ type: 'comment', content: remaining.slice(0, endIndex + 2) });
          remaining = remaining.slice(endIndex + 2);
          continue;
        } else {
          tokens.push({ type: 'comment', content: remaining });
          break;
        }
      }

      // Strings (double quotes)
      const doubleQuoteMatch = /^"(?:[^"\\]|\\.)*"/.exec(remaining);
      if (doubleQuoteMatch !== null) {
        tokens.push({ type: 'string', content: doubleQuoteMatch[0] });
        remaining = remaining.slice(doubleQuoteMatch[0].length);
        continue;
      }

      // Strings (single quotes)
      const singleQuoteMatch = /^'(?:[^'\\]|\\.)*'/.exec(remaining);
      if (singleQuoteMatch !== null) {
        tokens.push({ type: 'string', content: singleQuoteMatch[0] });
        remaining = remaining.slice(singleQuoteMatch[0].length);
        continue;
      }

      // Template strings
      const templateMatch = /^`(?:[^`\\]|\\.)*`/.exec(remaining);
      if (templateMatch !== null) {
        tokens.push({ type: 'string', content: templateMatch[0] });
        remaining = remaining.slice(templateMatch[0].length);
        continue;
      }

      // Keywords
      const keywordMatch =
        /^(\b(?:import|export|default|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|typeof|instanceof|true|false|null|undefined|async|await|try|catch|throw|type|interface|as)\b)/.exec(
          remaining
        );
      if (keywordMatch !== null) {
        tokens.push({ type: 'keyword', content: keywordMatch[0] });
        remaining = remaining.slice(keywordMatch[0].length);
        continue;
      }

      // React/Component names (PascalCase)
      const componentMatch = /^<\/?([A-Z][a-zA-Z0-9]*)/.exec(remaining);
      if (componentMatch?.[1]) {
        const firstChar = remaining[0];
        if (firstChar) {
          tokens.push({ type: 'punctuation', content: firstChar }); // < or </
        }
        remaining = remaining.slice(remaining.startsWith('<') && remaining[1] === '/' ? 2 : 1);
        tokens.push({ type: 'component', content: componentMatch[1] });
        remaining = remaining.slice(componentMatch[1].length);
        continue;
      }

      // HTML tags
      const tagMatch = /^<\/?([a-z][a-z0-9]*)/.exec(remaining);
      if (tagMatch?.[1]) {
        tokens.push({
          type: 'punctuation',
          content: remaining.startsWith('<') && remaining[1] === '/' ? '</' : '<',
        });
        remaining = remaining.slice(remaining.startsWith('<') && remaining[1] === '/' ? 2 : 1);
        tokens.push({ type: 'tag', content: tagMatch[1] });
        remaining = remaining.slice(tagMatch[1].length);
        continue;
      }

      // JSX attributes
      const attrMatch = /^([a-zA-Z][a-zA-Z0-9]*)(?==)/.exec(remaining);
      if (attrMatch?.[1]) {
        tokens.push({ type: 'attribute', content: attrMatch[1] });
        remaining = remaining.slice(attrMatch[1].length);
        continue;
      }

      // Numbers
      const numberMatch = /^-?\d+\.?\d*/.exec(remaining);
      if (numberMatch !== null) {
        tokens.push({ type: 'number', content: numberMatch[0] });
        remaining = remaining.slice(numberMatch[0].length);
        continue;
      }

      // Function calls (followed by parenthesis)
      const funcMatch = /^([a-z][a-zA-Z0-9]*)(?=\()/.exec(remaining);
      if (funcMatch?.[1]) {
        tokens.push({ type: 'function', content: funcMatch[1] });
        remaining = remaining.slice(funcMatch[1].length);
        continue;
      }

      // Component references (PascalCase not in JSX)
      const pascalMatch = /^([A-Z][a-zA-Z0-9]*)/.exec(remaining);
      if (pascalMatch?.[1]) {
        tokens.push({ type: 'component', content: pascalMatch[1] });
        remaining = remaining.slice(pascalMatch[1].length);
        continue;
      }

      // Operators
      const opMatch = /^(=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%=<>!&|^~?:])/.exec(remaining);
      if (opMatch !== null) {
        tokens.push({ type: 'operator', content: opMatch[0] });
        remaining = remaining.slice(opMatch[0].length);
        continue;
      }

      // Punctuation
      const punctMatch = /^[{}[\]();,.<>/]/.exec(remaining);
      if (punctMatch !== null) {
        tokens.push({ type: 'punctuation', content: punctMatch[0] });
        remaining = remaining.slice(punctMatch[0].length);
        continue;
      }

      // Whitespace
      const wsMatch = /^\s+/.exec(remaining);
      if (wsMatch !== null) {
        tokens.push({ type: 'text', content: wsMatch[0] });
        remaining = remaining.slice(wsMatch[0].length);
        continue;
      }

      // Identifiers/properties
      const identMatch = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(remaining);
      if (identMatch !== null) {
        tokens.push({ type: 'property', content: identMatch[0] });
        remaining = remaining.slice(identMatch[0].length);
        continue;
      }

      // Any other character
      const char = remaining[0];
      if (char) {
        tokens.push({ type: 'text', content: char });
      }
      remaining = remaining.slice(1);
    }

    return tokens;
  });
}

// Render highlighted code
function HighlightedCode({ code }: { code: string; language: CodeLanguage }): React.JSX.Element {
  const tokenizedLines = useMemo(() => tokenize(code), [code]);

  return (
    <div
      style={{
        fontFamily:
          'var(--vscode-editor-font-family, "SF Mono", "Monaco", "Menlo", "Consolas", monospace)',
        fontSize: 12,
        lineHeight: 1.7,
        tabSize: 2,
      }}
    >
      {tokenizedLines.map((tokens, lineIndex) => (
        <div key={lineIndex} style={{ display: 'flex', minHeight: '1.7em' }}>
          {/* Line number */}
          <span
            style={{
              display: 'inline-block',
              width: 44,
              paddingRight: 16,
              textAlign: 'right',
              color: 'color-mix(in oklch, var(--muted-foreground) 40%, transparent)',
              userSelect: 'none',
              flexShrink: 0,
              fontSize: 12,
            }}
          >
            {lineIndex + 1}
          </span>
          {/* Code content */}
          <span style={{ flex: 1 }}>
            {tokens.length === 0
              ? '\u00A0'
              : tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={{ color: tokenColors[token.type] }}>
                    {token.content}
                  </span>
                ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--background)',
    // No border - shadow-only design
    transition: `height 280ms ${EASE_OUT}`,
  },
  containerExpanded: {
    height: 300,
  },
  containerCollapsed: {
    height: 36,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    // No border
    backgroundColor: 'var(--card)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    // No border
    backgroundColor: 'var(--card)',
  },
  tabs: {
    display: 'flex',
    gap: 2,
    padding: 2,
    backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
    borderRadius: 8,
    height: 30,
  },
  tab: {
    padding: '0 14px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    transition: `all 150ms ${EASE_OUT}`,
  },
  tabActive: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  tabHover: {
    color: 'var(--foreground)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    height: 30,
    fontSize: 10,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    transition: `all 200ms ${EASE_OUT}`,
  },
  copyButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
  },
  copyButtonSuccess: {
    backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)',
    color: 'var(--primary)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 0,
  },
  codeBlock: {
    margin: 0,
    padding: '16px 0',
    backgroundColor: 'var(--background)',
    overflow: 'auto',
    height: '100%',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 32,
    textAlign: 'center' as const,
  },
  emptyStateIcon: {
    color: 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 12,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    lineHeight: 1.5,
  },
  chevron: {
    color: 'var(--muted-foreground)',
    display: 'flex',
    alignItems: 'center',
  },
  componentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 40%, transparent)',
    // No border
  },
  componentBadgeLabel: {
    fontSize: 10,
    color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
  },
  componentBadgeName: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--foreground)',
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CodeOutputPanel({
  nodes,
  edges,
  isVisible,
  onToggleVisibility,
  embedded = false,
  selectedNodeCode,
  selectedNodeLabel,
}: CodeOutputPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<CodeLanguage>('tsx');
  const [copied, setCopied] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [hoveredTab, setHoveredTab] = useState<CodeLanguage | null>(null);

  const isShowingNodeCode = !!selectedNodeCode;

  // Generate code based on active tab
  const generatedCode = useMemo(() => {
    if (selectedNodeCode && (activeTab === 'tsx' || activeTab === 'jsx')) {
      return selectedNodeCode;
    }

    switch (activeTab) {
      case 'tsx':
        return codeGenerator.generateTSX(nodes, edges);
      case 'jsx':
        return codeGenerator.generateJSX(nodes, edges);
      case 'css':
        return codeGenerator.generateCSS();
      default:
        return '';
    }
  }, [nodes, edges, activeTab, selectedNodeCode]);

  // Copy to clipboard
  const handleCopy = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout((): void => {
          setCopied(false);
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    },
    [generatedCode]
  );

  const handleTabClick = useCallback((tab: CodeLanguage, e: React.MouseEvent): void => {
    e.stopPropagation();
    setActiveTab(tab);
  }, []);

  const isEmpty = nodes.length === 0 && !selectedNodeCode;

  // Embedded mode
  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Component badge */}
        {isShowingNodeCode && selectedNodeLabel ? (
          <div style={styles.componentBadge}>
            <span style={styles.componentBadgeLabel}>Component:</span>
            <span style={styles.componentBadgeName}>{selectedNodeLabel}</span>
          </div>
        ) : null}

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.tabs}>
            {(['tsx', 'jsx', 'css'] as CodeLanguage[]).map((tab) => (
              <button
                key={tab}
                onClick={(e) => {
                  handleTabClick(tab, e);
                }}
                onMouseEnter={() => {
                  setHoveredTab(tab);
                }}
                onMouseLeave={() => {
                  setHoveredTab(null);
                }}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab ? styles.tabActive : {}),
                  ...(hoveredTab === tab && activeTab !== tab ? styles.tabHover : {}),
                }}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleCopy}
            onMouseEnter={() => {
              setHoveredButton('copy');
            }}
            onMouseLeave={() => {
              setHoveredButton(null);
            }}
            style={{
              ...styles.copyButton,
              ...(copied ? styles.copyButtonSuccess : {}),
              ...(hoveredButton === 'copy' && !copied ? styles.copyButtonHover : {}),
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isEmpty ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>
                <FileCodeIcon />
              </div>
              <div style={styles.emptyStateTitle}>No code yet</div>
              <div style={styles.emptyStateText}>
                Add components to the canvas
                <br />
                to generate code
              </div>
            </div>
          ) : (
            <div style={styles.codeBlock}>
              <HighlightedCode code={generatedCode} language={activeTab} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Original collapsible mode
  return (
    <div
      style={{
        ...styles.container,
        ...(isVisible ? styles.containerExpanded : styles.containerCollapsed),
      }}
    >
      {/* Header */}
      <div style={styles.header} onClick={onToggleVisibility}>
        <div style={styles.headerLeft}>
          <span style={{ color: '#3b82f6' }}>
            <CodeIcon />
          </span>
          <span style={styles.headerTitle}>Generated Code</span>
          {isVisible ? (
            <div style={styles.tabs}>
              {(['tsx', 'jsx', 'css'] as CodeLanguage[]).map((tab) => (
                <button
                  key={tab}
                  onClick={(e) => {
                    handleTabClick(tab, e);
                  }}
                  onMouseEnter={() => {
                    setHoveredTab(tab);
                  }}
                  onMouseLeave={() => {
                    setHoveredTab(null);
                  }}
                  style={{
                    ...styles.tab,
                    ...(activeTab === tab ? styles.tabActive : {}),
                    ...(hoveredTab === tab && activeTab !== tab ? styles.tabHover : {}),
                  }}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div style={styles.headerRight}>
          {isVisible ? (
            <button
              onClick={handleCopy}
              onMouseEnter={() => {
                setHoveredButton('copy');
              }}
              onMouseLeave={() => {
                setHoveredButton(null);
              }}
              style={{
                ...styles.copyButton,
                ...(copied ? styles.copyButtonSuccess : {}),
                ...(hoveredButton === 'copy' && !copied ? styles.copyButtonHover : {}),
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          ) : null}
          <span style={styles.chevron}>{isVisible ? <ChevronDownIcon /> : <ChevronUpIcon />}</span>
        </div>
      </div>

      {/* Content */}
      {isVisible ? (
        <div style={styles.content}>
          {isEmpty ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>
                <FileCodeIcon />
              </div>
              <div style={styles.emptyStateTitle}>No code yet</div>
              <div style={styles.emptyStateText}>
                Add components to the canvas
                <br />
                to generate code
              </div>
            </div>
          ) : (
            <div style={styles.codeBlock}>
              <HighlightedCode code={generatedCode} language={activeTab} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
