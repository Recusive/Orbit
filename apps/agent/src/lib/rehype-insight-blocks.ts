/**
 * Rehype plugin: transforms insight blocks into styled aside elements.
 *
 * Claude Code's explanatory output style produces insight blocks formatted as:
 *   `★ Insight ─────────────────────────────────────`
 *   [educational content]
 *   `─────────────────────────────────────────────────`
 *
 * The pattern may appear as:
 *   - <code> elements (backtick-wrapped) within a <p>
 *   - Plain text nodes within a <p> (when backticks are omitted)
 *   - With or without a title after the dashes
 *   - Using various dash characters (─, —, –, -)
 *
 * This plugin detects all variations and replaces them with
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

/**
 * Dash-like characters used in the insight border pattern.
 * Claude may use any of these depending on output formatting.
 * Hyphen-minus placed last to avoid regex range interpretation in [].
 */
const DASHES = [
  String.fromCodePoint(0x2500), // ─ BOX DRAWINGS LIGHT HORIZONTAL
  String.fromCodePoint(0x2014), // — EM DASH
  String.fromCodePoint(0x2013), // – EN DASH
  '-', //   HYPHEN-MINUS
].join('');

/**
 * Regex: matches the insight opener line (optionally followed by a title).
 * No `$` anchor — Claude sometimes appends a topic title after the dashes.
 * Requires 3+ dashes to prevent false positives.
 */
const OPENER_RE = new RegExp(`^${STAR}\\s*Insight\\s*[${DASHES}]{3,}`);

/** Regex: matches the insight closer line: 5+ dashes (any variant) only. */
const CLOSER_RE = new RegExp(`^[${DASHES}]{5,}$`);

// ── Helpers ─────────────────────────────────────────────────────────

/** Recursively extract text content from a node. */
function getTextContent(node: HastNode): string {
  if (isTextNode(node)) return node.value;
  if (isElementNode(node)) return node.children.map(getTextContent).join('');
  return '';
}

/** Check if a node is a <code> element matching the insight opener. */
function isInsightOpener(node: HastNode): boolean {
  if (!isElementNode(node) || node.tagName !== 'code') return false;
  return OPENER_RE.test(getTextContent(node).trim());
}

/** Check if a node is a <code> element matching the insight closer. */
function isInsightCloser(node: HastNode): boolean {
  if (!isElementNode(node) || node.tagName !== 'code') return false;
  return CLOSER_RE.test(getTextContent(node).trim());
}

// ── Opener / Closer detection (code + text) ─────────────────────────

/** Result of detecting an opener in a <p>. */
interface OpenerMatch {
  /** 'code' = backtick-wrapped <code>, 'text' = plain-text paragraph */
  readonly type: 'code' | 'text';
  /** Index of the opener <code> child (only meaningful for type='code') */
  readonly openerIdx: number;
}

/**
 * Detect an insight opener in a <p> element.
 * Checks two patterns:
 *   1. A <code> element as the first meaningful child (backtick-wrapped)
 *   2. The entire paragraph text matching the opener pattern (plain-text)
 * Returns match info or null if not an opener.
 */
function detectOpener(p: HastElement): OpenerMatch | null {
  // Check for <code> opener (backtick-wrapped) — first meaningful child
  for (let i = 0; i < p.children.length; i++) {
    const child = p.children[i];
    if (child === undefined) continue;
    if (isTextNode(child) && child.value.trim() === '') continue;
    // First meaningful child: check if it's an opener <code>
    if (isInsightOpener(child)) {
      return { type: 'code', openerIdx: i };
    }
    break; // first meaningful child wasn't an opener <code>
  }

  // Check for plain-text opener (no backticks) — entire paragraph matches
  const fullText = getTextContent(p).trim();
  if (OPENER_RE.test(fullText)) {
    return { type: 'text', openerIdx: -1 };
  }

  return null;
}

/**
 * Check if a <p> is a closer paragraph.
 * Matches both <code>-based and plain-text closers.
 */
function isCloserParagraph(p: HastElement): boolean {
  // <code> closer: only meaningful child is a closer <code>
  const meaningful = p.children.filter((c) => !(isTextNode(c) && c.value.trim() === ''));
  const first = meaningful[0];
  if (meaningful.length === 1 && first !== undefined && isInsightCloser(first)) {
    return true;
  }
  // Plain-text closer: entire paragraph is just dashes
  const fullText = getTextContent(p).trim();
  return CLOSER_RE.test(fullText);
}

/** Recursively check if any descendant of an element contains a closer <code>. */
function containsCloser(node: HastNode): boolean {
  if (isInsightCloser(node)) return true;
  if (isElementNode(node)) {
    return node.children.some(containsCloser);
  }
  return false;
}

/**
 * Recursively strip the closer <code> from a tree, returning a new tree without it.
 * Also removes trailing whitespace text nodes left behind after removal.
 */
function stripCloser(node: HastElement): HastElement {
  const newChildren: HastNode[] = [];
  for (const child of node.children) {
    if (isInsightCloser(child)) continue;
    if (isElementNode(child) && containsCloser(child)) {
      newChildren.push(stripCloser(child));
    } else {
      newChildren.push(child);
    }
  }

  // Trim trailing whitespace-only text nodes left after removal
  let end = newChildren.length;
  for (; end > 0; end--) {
    const n = newChildren[end - 1];
    if (n === undefined || !isTextNode(n) || n.value.trim() !== '') break;
  }

  return { ...node, children: newChildren.slice(0, end) };
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

// ── Content cleaning ─────────────────────────────────────────────────

/**
 * Recursively strip insight opener and closer <code> elements from content.
 * Acts as a safety net — regardless of which code path collected the content,
 * the opener/closer patterns will never appear inside the insight body.
 */
function stripInsightMarkers(nodes: HastNode[]): HastNode[] {
  const result: HastNode[] = [];
  for (const node of nodes) {
    // Drop top-level opener/closer <code> nodes
    if (isInsightOpener(node) || isInsightCloser(node)) continue;
    // Drop text nodes that are purely an opener or closer line
    if (
      isTextNode(node) &&
      (OPENER_RE.test(node.value.trim()) || CLOSER_RE.test(node.value.trim()))
    )
      continue;
    // Recurse into element children
    if (isElementNode(node)) {
      const cleaned = stripInsightMarkers(node.children);
      if (cleaned.length !== node.children.length) {
        // Something was removed — rebuild with trimmed children
        const trimmed = trimEdgeWhitespace(cleaned);
        // Drop the element entirely if it became empty after stripping
        if (trimmed.length > 0) {
          result.push({ ...node, children: trimmed });
        }
        continue;
      }
    }
    result.push(node);
  }
  return result;
}

// ── Insight block builder ───────────────────────────────────────────

/** Build an <aside class="insight-block"> from extracted content nodes. */
function buildInsightBlock(contentNodes: HastNode[]): HastElement {
  // Safety: strip any opener/closer that leaked into content.
  // This handles edge cases where markdown structure doesn't cleanly
  // separate the opener from body content (e.g. title text on same line).
  const cleanedContent = stripInsightMarkers(contentNodes);

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
        children: cleanedContent,
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

    // ── Case 1: Single paragraph with both opener and closer (<code> siblings) ──
    if (isElementNode(child) && child.tagName === 'p') {
      const transformed = tryTransformSingleParagraph(child);
      if (transformed !== null) {
        newChildren.push(transformed);
        i++;
        continue;
      }
    }

    // ── Case 2: Opener starts a <p>, content spans multiple siblings ──
    // Handles both <code>-wrapped and plain-text openers.
    // The opener <p> may also contain title text after the pattern.
    // The closer may be in a standalone <p>, or embedded inside any descendant.
    const opener = isElementNode(child) && child.tagName === 'p' ? detectOpener(child) : null;
    if (opener !== null && isElementNode(child)) {
      let closerIdx = -1;
      let closerEmbedded = false;
      for (let j = i + 1; j < node.children.length; j++) {
        const sibling = node.children[j];
        if (sibling === undefined || !isElementNode(sibling)) continue;

        // Standalone closer in its own <p> (code or text)
        if (sibling.tagName === 'p' && isCloserParagraph(sibling)) {
          closerIdx = j;
          break;
        }
        // Closer <code> embedded inside another element (ul, blockquote, etc.)
        if (containsCloser(sibling)) {
          closerIdx = j;
          closerEmbedded = true;
          break;
        }
      }

      if (closerIdx !== -1) {
        // Collect any title/extra content from the opener <p> after the opener node.
        // For code openers: slice after the <code> element.
        // For text openers: no extra content (the whole <p> is the opener).
        const extraFromOpener =
          opener.type === 'code'
            ? trimEdgeWhitespace(child.children.slice(opener.openerIdx + 1))
            : [];

        let contentElements: HastNode[];
        if (closerEmbedded) {
          // Include all siblings between opener and the element containing the closer,
          // but strip the closer <code> from that last element.
          contentElements = node.children.slice(i + 1, closerIdx);
          const lastElement = node.children[closerIdx];
          if (lastElement !== undefined && isElementNode(lastElement)) {
            contentElements.push(stripCloser(lastElement));
          }
        } else {
          // Standalone closer in its own <p> — exclude it entirely
          contentElements = node.children.slice(i + 1, closerIdx);
        }

        // Prepend opener's extra content (title text) as the first body paragraph
        if (extraFromOpener.length > 0) {
          const titleParagraph: HastElement = {
            type: 'element',
            tagName: 'p',
            properties: {},
            children: extraFromOpener,
          };
          contentElements = [titleParagraph, ...contentElements];
        }

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
