/**
 * Rehype plugin: wraps text content in <span class="flow-token"> elements.
 *
 * Each word becomes its own span, enabling per-word CSS entry animations
 * when React mounts new token spans during streaming. Existing spans
 * persist via React's index-based reconciliation, so their animations
 * don't replay.
 *
 * Used exclusively during streaming. For completed messages, the standard
 * (empty) rehype pipeline renders without extra spans.
 *
 * Skips code blocks, pre, script, style, svg, and math elements.
 */

// ── Minimal HAST types (avoids dependency on @types/hast) ──────────────

interface HastText {
  type: 'text';
  value: string;
}

interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}

interface HastRoot {
  type: 'root';
  children: HastNode[];
}

/** Covers the node types we encounter in practice. */
type HastNode = HastText | HastElement | HastOther;

/** Other node types (comments, doctypes, etc.) that we pass through unchanged. */
interface HastOther {
  type: string;
}

// ── Type Guards ─────────────────────────────────────────────────────────

/** Type guard to check if a node is a text node. */
function isTextNode(node: HastNode): node is HastText {
  return node.type === 'text' && 'value' in node;
}

/** Type guard to check if a node is an element node. */
function isElementNode(node: HastNode): node is HastElement {
  return node.type === 'element' && 'tagName' in node && 'children' in node;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Elements whose text should NOT be tokenized. */
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'svg', 'math']);

/** Word-boundary split that preserves whitespace as its own token. */
const WORD_BOUNDARY = /(\s+)/;

// ── Tree visitor ───────────────────────────────────────────────────────

function wrapTextNodes(node: HastRoot | HastElement): void {
  // Skip elements whose content shouldn't be animated
  if (node.type === 'element' && SKIP_TAGS.has(node.tagName)) {
    return;
  }

  const source = node.children;
  const result: HastNode[] = [];

  for (const child of source) {
    if (isTextNode(child)) {
      const parts = child.value.split(WORD_BOUNDARY);

      for (const part of parts) {
        if (part.length === 0) continue;

        if (/^\s+$/.test(part)) {
          // Preserve whitespace as a plain text node (no span wrapper)
          const textNode: HastText = { type: 'text', value: part };
          result.push(textNode);
        } else {
          // Wrap each word in <span class="flow-token">
          const spanNode: HastElement = {
            type: 'element',
            tagName: 'span',
            properties: { className: ['flow-token'] },
            children: [{ type: 'text', value: part }],
          };
          result.push(spanNode);
        }
      }
    } else if (isElementNode(child)) {
      // Recurse into child elements
      wrapTextNodes(child);
      result.push(child);
    } else {
      // Pass through comments, doctypes, etc.
      result.push(child);
    }
  }

  node.children = result;
}

// ── Plugin export ──────────────────────────────────────────────────────

/** Rehype plugin that tokenizes text for per-word streaming animation. */
export function rehypeFlowTokens(): (tree: HastRoot) => void {
  return (tree: HastRoot): void => {
    wrapTextNodes(tree);
  };
}
