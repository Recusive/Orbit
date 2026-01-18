/**
 * InlineTextEditor - Direct text editing overlay for text nodes
 *
 * Renders a contentEditable div at the text node's position for
 * in-place text editing. Matches the node's text styling.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { TextNode } from '../../types/designNodeTypes';

interface InlineTextEditorProps {
  node: TextNode;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  onSave: (nodeId: string, newContent: string) => void;
  onCancel: () => void;
}

/**
 * Convert flow position to screen position
 */
function flowToScreen(
  flowX: number,
  flowY: number,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  return {
    x: flowX * viewport.zoom + viewport.x,
    y: flowY * viewport.zoom + viewport.y,
  };
}

/**
 * InlineTextEditor component
 */
export const InlineTextEditor = memo(function InlineTextEditor({
  node,
  viewport,
  onSave,
  onCancel,
}: InlineTextEditorProps): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState(node.textProperties.content);

  // Focus and select all text on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
      // Select all text
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSave(node.id, content);
      }
    },
    [node.id, content, onSave, onCancel]
  );

  // Handle input changes
  const handleInput = useCallback((event: React.FormEvent<HTMLDivElement>): void => {
    const newContent = event.currentTarget.textContent || '';
    setContent(newContent);
  }, []);

  // Handle blur - save changes
  const handleBlur = useCallback((): void => {
    onSave(node.id, content);
  }, [node.id, content, onSave]);

  // Calculate screen position
  const screenPos = flowToScreen(node.x, node.y, viewport);

  // Get fill color for text
  const firstFill = node.fills[0];
  const textColor =
    firstFill?.type === 'solid' && firstFill.color !== undefined
      ? firstFill.color
      : 'var(--foreground)';

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onBlur={handleBlur}
      style={{
        position: 'fixed',
        left: screenPos.x,
        top: screenPos.y,
        minWidth: Math.max(node.width * viewport.zoom, 50),
        minHeight: node.height * viewport.zoom,
        padding: 4 * viewport.zoom,
        fontFamily: node.textProperties.fontFamily,
        fontSize: node.textProperties.fontSize * viewport.zoom,
        fontWeight: node.textProperties.fontWeight,
        lineHeight:
          node.textProperties.lineHeight === 'auto'
            ? 'normal'
            : `${String(node.textProperties.lineHeight * viewport.zoom)}px`,
        letterSpacing: node.textProperties.letterSpacing * viewport.zoom,
        textAlign: node.textProperties.textAlign,
        textDecoration: node.textProperties.textDecoration,
        color: textColor,
        backgroundColor: 'var(--popover)',
        border: '2px solid var(--primary)',
        borderRadius: 4,
        outline: 'none',
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        transform: `rotate(${String(node.rotation)}deg)`,
        transformOrigin: 'top left',
      }}
    >
      {node.textProperties.content}
    </div>
  );
});

export default InlineTextEditor;
