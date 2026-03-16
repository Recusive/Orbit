import { TextNode } from 'lexical';

import type { EditorConfig, LexicalEditor, SerializedTextNode } from 'lexical';

export class SlashCommandNode extends TextNode {
  static override getType(): string {
    return 'slash-command';
  }

  static override clone(node: SlashCommandNode): SlashCommandNode {
    return new SlashCommandNode(node.__text, node.__key);
  }

  static override importJSON(serializedNode: SerializedTextNode): SlashCommandNode {
    return $createSlashCommandNode(serializedNode.text).updateFromJSON(serializedNode);
  }

  override createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    dom.classList.add('text-git-untracked');
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    dom.classList.add('text-git-untracked');
    return updated;
  }

  override exportJSON(): SerializedTextNode {
    return {
      ...super.exportJSON(),
      type: 'slash-command',
    };
  }
}

export function $createSlashCommandNode(text: string): SlashCommandNode {
  return new SlashCommandNode(text);
}

export function $isSlashCommandNode(node: unknown): node is SlashCommandNode {
  return node instanceof SlashCommandNode;
}
