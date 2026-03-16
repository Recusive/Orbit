import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';

import type { EditorState, LexicalEditor, LexicalNode, PointType, RangeSelection } from 'lexical';

const ROOT_BLOCK_SEPARATOR = '\n\n';

export interface TriggerRange {
  readonly kind: 'slash' | 'mention';
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

function getRootSeparatorSize(parent: LexicalNode, childIndex: number, childCount: number): number {
  if (parent.getKey() !== $getRoot().getKey()) {
    return 0;
  }

  const child = $getRoot().getChildAtIndex(childIndex);
  if (!$isElementNode(child) || child.isInline() || childIndex >= childCount - 1) {
    return 0;
  }

  return ROOT_BLOCK_SEPARATOR.length;
}

function getPointAbsoluteOffset(point: PointType): number {
  const root = $getRoot();
  let offset = 0;

  function visit(node: LexicalNode): boolean {
    if (node.getKey() === point.key) {
      if ($isTextNode(node)) {
        offset += Math.min(point.offset, node.getTextContentSize());
        return true;
      }

      if ($isElementNode(node)) {
        const children = node.getChildren();
        const limit = Math.min(point.offset, children.length);
        for (let index = 0; index < limit; index++) {
          const child = children[index];
          if (child === undefined) continue;
          offset += child.getTextContentSize();
          offset += getRootSeparatorSize(node, index, children.length);
        }
        return true;
      }

      offset += Math.min(point.offset, node.getTextContentSize());
      return true;
    }

    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (child === undefined) continue;
        if (visit(child)) {
          return true;
        }
        offset += child.getTextContentSize();
        offset += getRootSeparatorSize(node, index, children.length);
      }
      return false;
    }

    return false;
  }

  if (visit(root)) {
    return offset;
  }

  return root.getTextContentSize();
}

function setSelectionAtOffset(text: string, cursorOffset: number): void {
  const root = $getRoot();
  const paragraph = root.getFirstChild();
  if (!$isElementNode(paragraph)) {
    root.selectStart();
    return;
  }

  const clampedOffset = Math.max(0, Math.min(cursorOffset, text.length));
  if (clampedOffset === 0) {
    paragraph.select(0, 0);
    return;
  }

  let remaining = clampedOffset;
  const children = paragraph.getChildren();
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child === undefined) continue;

    if ($isTextNode(child)) {
      const size = child.getTextContentSize();
      if (remaining <= size) {
        child.select(remaining, remaining);
        return;
      }
      remaining -= size;
      continue;
    }

    if ($isLineBreakNode(child)) {
      if (remaining === 1) {
        paragraph.select(index + 1, index + 1);
        return;
      }
      remaining -= 1;
      continue;
    }

    const size = child.getTextContentSize();
    if (remaining <= size) {
      paragraph.select(index + 1, index + 1);
      return;
    }
    remaining -= size;
  }

  paragraph.selectEnd();
}

function setRootPlainText(text: string, cursorOffset: number): void {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line.length > 0) {
      paragraph.append($createTextNode(line));
    }
    if (index < lines.length - 1) {
      paragraph.append($createLineBreakNode());
    }
  }

  root.clear();
  root.append(paragraph);
  setSelectionAtOffset(text, cursorOffset);
}

function getSlashTrigger(beforeCursor: string, cursor: number): TriggerRange | null {
  const slashIndex = beforeCursor.lastIndexOf('/');
  if (slashIndex === -1) {
    return null;
  }

  const previousChar = beforeCursor[slashIndex - 1];
  if (slashIndex > 0 && previousChar !== undefined && !/\s/.test(previousChar)) {
    return null;
  }

  const afterSlash = beforeCursor.slice(slashIndex + 1);
  if (/\s/.test(afterSlash)) {
    return null;
  }

  return {
    kind: 'slash',
    start: slashIndex,
    end: cursor,
    query: afterSlash,
  };
}

function getMentionTrigger(beforeCursor: string, cursor: number): TriggerRange | null {
  const mentionIndex = beforeCursor.lastIndexOf('@');
  if (mentionIndex === -1) {
    return null;
  }

  const afterAt = beforeCursor.slice(mentionIndex + 1);
  if (/\s/.test(afterAt)) {
    return null;
  }

  return {
    kind: 'mention',
    start: mentionIndex,
    end: cursor,
    query: afterAt,
  };
}

export function getAbsoluteCursorOffset(selection: RangeSelection): number {
  return getPointAbsoluteOffset(selection.anchor);
}

export function readActiveTrigger(editorState: EditorState): TriggerRange | null {
  return editorState.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return null;
    }

    const fullText = $getRoot().getTextContent();
    const cursor = getAbsoluteCursorOffset(selection);
    const beforeCursor = fullText.slice(0, cursor);

    const slash = getSlashTrigger(beforeCursor, cursor);
    const mention = getMentionTrigger(beforeCursor, cursor);

    if (slash !== null && mention !== null) {
      return slash.start > mention.start ? slash : mention;
    }

    return slash ?? mention;
  });
}

export function readEditorText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

export function setEditorText(
  editor: LexicalEditor,
  text: string,
  cursorOffset = text.length
): void {
  editor.update(() => {
    setRootPlainText(text, cursorOffset);
  });
}

export function replaceTriggerRange(
  editor: LexicalEditor,
  range: TriggerRange,
  replacement: string
): void {
  editor.update(() => {
    const root = $getRoot();
    const fullText = root.getTextContent();
    const nextText = fullText.slice(0, range.start) + replacement + fullText.slice(range.end);
    setRootPlainText(nextText, range.start + replacement.length);
  });
}

export function clearEditor(editor: LexicalEditor): void {
  setEditorText(editor, '', 0);
}
