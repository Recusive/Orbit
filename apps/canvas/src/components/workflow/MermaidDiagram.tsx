/**
 * Mermaid Diagram Component
 * Renders Mermaid diagram syntax as SVG
 */

import mermaid from 'mermaid';
import React, { useEffect, useRef, useState, useId } from 'react';

import { radii, spacing } from '../../lib/design/designTokens';

// ============================================================================
// Mermaid Configuration
// ============================================================================

// Initialize mermaid with theme settings
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 8,
    diagramMarginY: 8,
    actorMargin: 50,
  },
  er: {
    useMaxWidth: true,
  },
});

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    padding: spacing.md,
    margin: '8px 0',
    overflow: 'auto',
  },
  diagram: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    color: 'var(--muted-foreground)',
    fontSize: 12,
  },
  error: {
    padding: spacing.md,
    color: 'var(--destructive)',
    fontSize: 12,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
  },
  fallback: {
    padding: spacing.md,
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--muted-foreground)',
    whiteSpace: 'pre-wrap' as const,
  },
};

// ============================================================================
// Props
// ============================================================================

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function MermaidDiagram({ chart, className }: MermaidDiagramProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const uniqueId = useId().replace(/:/g, '');

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async (): Promise<void> => {
      if (chart.trim().length === 0) {
        setError('Empty diagram');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Validate the diagram syntax first (throws on error)
        await mermaid.parse(chart);

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${uniqueId}`, chart);

        if (isMounted) {
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to render diagram';
          setError(message);
          setIsLoading(false);
        }
      }
    };

    void renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chart, uniqueId]);

  return (
    <div style={styles.container} className={className}>
      {isLoading ? (
        <div style={styles.loading}>Loading diagram...</div>
      ) : error !== null ? (
        <div>
          <div style={styles.error}>Diagram Error: {error}</div>
          <div style={styles.fallback}>{chart}</div>
        </div>
      ) : svg !== null ? (
        <div ref={containerRef} style={styles.diagram} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
    </div>
  );
}

// ============================================================================
// Check if content is Mermaid
// ============================================================================

export function isMermaidCode(language: string | undefined): boolean {
  return language === 'mermaid';
}

// ============================================================================
// Mermaid Code Block (for use in ReactMarkdown)
// ============================================================================

interface MermaidCodeBlockProps {
  children: string;
}

export function MermaidCodeBlock({ children }: MermaidCodeBlockProps): React.JSX.Element {
  return <MermaidDiagram chart={children} />;
}
