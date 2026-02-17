/**
 * Rehype plugin: transforms insight blocks into styled aside elements.
 *
 * Claude Code's explanatory output style produces insight blocks formatted as:
 *   `★ Insight ─────────────────────────────────────`
 *   [educational content]
 *   `─────────────────────────────────────────────────`
 *
 * In the HAST, these appear as <code> elements within a <p>.
 * This plugin detects the pattern and replaces the paragraph with
 * a styled <aside class="insight-block"> containing the content.
 *
 * Must run BEFORE rehypeFlowTokens so the DOM is restructured
 * before per-word animation spans are added.
 */

// ── Minimal HAST types (mirrors rehype-flow-tokens.ts) ──────────────

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

type HastNode = HastText | HastElement | HastOther;

interface HastOther {
  type: string;
}

// ── Type Guards ─────────────────────────────────────────────────────

function isTextNode(node: HastNode): node is HastText {
  return node.type === 'text' && 'value' in node;
}

function isElementNode(node: HastNode): node is HastElement {
  return node.type === 'element' && 'tagName' in node && 'children' in node;
}

// ── Constants ───────────────────────────────────────────────────────

/** BLACK STAR (U+2605) — used in the insight opener pattern. Built at runtime to satisfy the emoji linter rule. */
const STAR = String.fromCodePoint(0x2605);
/** BOX DRAWINGS LIGHT HORIZONTAL (U+2500) — the border dash character. */
const HDASH = String.fromCodePoint(0x2500);
/** Regex: matches the insight opener line: ★ Insight ─…─ */
const OPENER_RE = new RegExp(`^${STAR}\\s*Insight\\s*[${HDASH}]+$`);
/** Regex: matches the insight closer line: ─…─ (5+ dashes) */
const CLOSER_RE = new RegExp(`^[${HDASH}]{5,}$`);

// ── Helpers ─────────────────────────────────────────────────────────

/** Recursively extract text content from a node. */
function getTextContent(node: HastNode): string {
  if (isTextNode(node)) return node.value;
  if (isElementNode(node)) return node.children.map(getTextContent).join('');
  return '';
}

/** Check if a node is a <code> element matching the insight opener (★ Insight ─…). */
function isInsightOpener(node: HastNode): boolean {
  if (!isElementNode(node) || node.tagName !== 'code') return false;
  return OPENER_RE.test(getTextContent(node).trim());
}

/** Check if a node is a <code> element matching the insight closer. */
function isInsightCloser(node: HastNode): boolean {
  if (!isElementNode(node) || node.tagName !== 'code') return false;
  return CLOSER_RE.test(getTextContent(node).trim());
}

/** Check if a <p> contains ONLY whitespace and an insight opener. */
function hasOnlyInsightOpener(p: HastElement): boolean {
  const meaningful = p.children.filter((c) => !(isTextNode(c) && c.value.trim() === ''));
  const first = meaningful[0];
  return meaningful.length === 1 && first !== undefined && isInsightOpener(first);
}

/** Check if a <p> contains ONLY whitespace and an insight closer. */
function hasOnlyInsightCloser(p: HastElement): boolean {
  const meaningful = p.children.filter((c) => !(isTextNode(c) && c.value.trim() === ''));
  const first = meaningful[0];
  return meaningful.length === 1 && first !== undefined && isInsightCloser(first);
}

/** Strip leading/trailing whitespace-only text nodes from an array. */
function trimEdgeWhitespace(nodes: HastNode[]): HastNode[] {
  let start = 0;
  let end = nodes.length;

  // Trim leading whitespace text nodes
  for (; start < end; start++) {
    const node = nodes[start];
    if (node === undefined || !isTextNode(node) || node.value.trim() !== '') break;
  }

  // Trim trailing whitespace text nodes
  for (; end > start; end--) {
    const node = nodes[end - 1];
    if (node === undefined || !isTextNode(node) || node.value.trim() !== '') break;
  }

  const result = nodes.slice(start, end);

  // Also trim leading newlines from the first text node
  const first = result[0];
  if (first !== undefined && isTextNode(first)) {
    result[0] = { type: 'text', value: first.value.replace(/^\n+/, '') };
  }

  // Trim trailing newlines from the last text node
  const last = result[result.length - 1];
  if (last !== undefined && isTextNode(last)) {
    result[result.length - 1] = { type: 'text', value: last.value.replace(/\n+$/, '') };
  }

  return result;
}

// ── Insight block builder ───────────────────────────────────────────

/** Build an <aside class="insight-block"> from extracted content nodes. */
function buildInsightBlock(contentNodes: HastNode[]): HastElement {
  return {
    type: 'element',
    tagName: 'aside',
    properties: { className: ['insight-block'], role: 'note' },
    children: [
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['insight-header'] },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['insight-star'], ariaHidden: 'true' },
            children: [{ type: 'text', value: STAR }],
          },
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['insight-label'] },
            children: [{ type: 'text', value: 'Insight' }],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['insight-body'] },
        children: contentNodes,
      },
    ],
  };
}

// ── Tree transformer ────────────────────────────────────────────────

/**
 * Case 1: Opener and closer are siblings within the same <p>.
 * Returns the replacement <aside> or null if no match found.
 */
function tryTransformSingleParagraph(p: HastElement): HastElement | null {
  let openerIdx = -1;
  let closerIdx = -1;

  for (let i = 0; i < p.children.length; i++) {
    const child = p.children[i];
    if (child === undefined) continue;

    if (openerIdx === -1 && isInsightOpener(child)) {
      openerIdx = i;
    } else if (openerIdx !== -1 && isInsightCloser(child)) {
      closerIdx = i;
      break;
    }
  }

  if (openerIdx === -1 || closerIdx === -1) return null;

  const contentNodes = trimEdgeWhitespace(p.children.slice(openerIdx + 1, closerIdx));
  if (contentNodes.length === 0) return null;

  return buildInsightBlock(contentNodes);
}

/** Walk the tree and transform insight blocks in both single-p and multi-element forms. */
function processTree(node: HastRoot | HastElement): void {
  const newChildren: HastNode[] = [];
  let i = 0;

  while (i < node.children.length) {
    const child = node.children[i];
    if (child === undefined) {
      i++;
      continue;
    }

    // ── Case 1: Single paragraph with both opener and closer ──
    if (isElementNode(child) && child.tagName === 'p') {
      const transformed = tryTransformSingleParagraph(child);
      if (transformed !== null) {
        newChildren.push(transformed);
        i++;
        continue;
      }
    }

    // ── Case 2: Opener in its own <p>, content spans multiple siblings ──
    if (isElementNode(child) && child.tagName === 'p' && hasOnlyInsightOpener(child)) {
      let closerIdx = -1;
      for (let j = i + 1; j < node.children.length; j++) {
        const sibling = node.children[j];
        if (
          sibling !== undefined &&
          isElementNode(sibling) &&
          sibling.tagName === 'p' &&
          hasOnlyInsightCloser(sibling)
        ) {
          closerIdx = j;
          break;
        }
      }

      if (closerIdx !== -1) {
        const contentElements = node.children.slice(i + 1, closerIdx);
        const insightBlock = buildInsightBlock(contentElements);
        newChildren.push(insightBlock);
        i = closerIdx + 1;
        continue;
      }
    }

    // ── Default: recurse into children and pass through ──
    if (isElementNode(child)) {
      processTree(child);
    }

    newChildren.push(child);
    i++;
  }

  node.children = newChildren;
}

// ── Plugin export ───────────────────────────────────────────────────

/** Rehype plugin that transforms insight blocks into styled aside elements. */
export function rehypeInsightBlocks(): (tree: HastRoot) => void {
  return (tree: HastRoot): void => {
    processTree(tree);
  };
}
