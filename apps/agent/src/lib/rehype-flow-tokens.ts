/**
 * Rehype plugin that tokenizes text for per-word streaming animation.
 *
 * Each visible word gets a stable ordinal (`data-flow-ord`) so post-render DOM
 * classification can distinguish genuinely new words from old words that were
 * remounted by markdown tree restructures mid-stream.
 *
 * Ordinals count ALL words in the document tree, including words inside
 * SKIP_TAGS, so later prose keeps a stable position when content moves into a
 * code block or other skipped context.
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

// ── Plugin export ──────────────────────────────────────────────────────

export function rehypeFlowTokens(): (tree: HastRoot) => void {
  return (tree: HastRoot): void => {
    let wordIndex = 0;

    function walk(node: HastRoot | HastElement, insideSkip: boolean): void {
      const enteringSkip = node.type === 'element' && SKIP_TAGS.has(node.tagName);
      const inSkip = insideSkip || enteringSkip;
      const source = node.children;
      const result: HastNode[] = [];

      for (const child of source) {
        if (isTextNode(child)) {
          const parts = child.value.split(WORD_BOUNDARY);

          for (const part of parts) {
            if (part.length === 0) continue;

            if (/^\s+$/.test(part)) {
              result.push({ type: 'text', value: part });
              continue;
            }

            if (inSkip) {
              result.push({ type: 'text', value: part });
            } else {
              result.push({
                type: 'element',
                tagName: 'span',
                properties: {
                  className: ['flow-token'],
                  'data-flow-ord': wordIndex,
                },
                children: [{ type: 'text', value: part }],
              });
            }

            wordIndex++;
          }
        } else if (isElementNode(child)) {
          walk(child, inSkip);
          result.push(child);
        } else {
          result.push(child);
        }
      }

      node.children = result;
    }

    walk(tree, false);
  };
}
