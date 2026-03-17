import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createTextNode, TextNode } from 'lexical';
import { useEffect, useMemo } from 'react';

import { getFilteredCommandsCount } from '../../slash-command-popover';
import { $createSlashCommandNode, SlashCommandNode } from '../SlashCommandNode';
import { readActiveTrigger } from '../bridge';

import type { PopoverNavigationState, SlashCommand } from '../../types';

interface SlashCommandMatch {
  readonly end: number;
  readonly start: number;
}

interface SlashCommandPluginProps {
  readonly commands: SlashCommand[];
  readonly knownNames: ReadonlySet<string>;
  readonly popover: PopoverNavigationState;
}

function findKnownSlashCommandMatches(
  text: string,
  knownNames: ReadonlySet<string>
): SlashCommandMatch[] {
  if (text.length === 0 || knownNames.size === 0) {
    return [];
  }

  const matches: SlashCommandMatch[] = [];
  const pattern = /\/([\w-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (name === undefined || !knownNames.has(name)) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length;
    const previousChar = text[start - 1];
    const nextChar = text[end];

    if (start > 0 && previousChar !== undefined && !/\s/.test(previousChar)) {
      continue;
    }

    if (nextChar !== undefined && !/\s/.test(nextChar)) {
      continue;
    }

    matches.push({ start, end });
  }

  return matches;
}

export function SlashCommandPlugin({
  commands,
  knownNames,
  popover,
}: SlashCommandPluginProps): null {
  const [editor] = useLexicalComposerContext();

  const knownTokens = useMemo(() => {
    return new Set(Array.from(knownNames, (name) => `/${name}`));
  }, [knownNames]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const trigger = readActiveTrigger(editorState);
      if (trigger?.kind === 'slash') {
        if (trigger.query.length === 0 || getFilteredCommandsCount(trigger.query, commands) > 0) {
          popover.setSlashQuery(trigger.query);
          popover.setSlashStartIndex(trigger.start);
          popover.setSlashOpen(true);
          if (popover.mentionOpen) {
            popover.closeMentionPopover();
          }
          return;
        }
      }

      popover.closeSlashPopover();
    });
  }, [commands, editor, popover]);

  useEffect(() => {
    const unregisterTextTransform = editor.registerNodeTransform(TextNode, (node) => {
      if (node instanceof SlashCommandNode) {
        return;
      }

      const text = node.getTextContent();
      const matches = findKnownSlashCommandMatches(text, knownNames);
      if (matches.length === 0) {
        return;
      }

      const splitOffsets = matches
        .flatMap(({ start, end }) => [start, end])
        .filter((offset, index, array) => {
          return offset > 0 && offset < text.length && array.indexOf(offset) === index;
        })
        .sort((a, b) => a - b);

      const segments = splitOffsets.length > 0 ? node.splitText(...splitOffsets) : [node];
      for (const segment of segments) {
        const segmentText = segment.getTextContent();
        if (knownTokens.has(segmentText)) {
          segment.replace($createSlashCommandNode(segmentText));
        }
      }
    });

    const unregisterSlashNodeTransform = editor.registerNodeTransform(SlashCommandNode, (node) => {
      const text = node.getTextContent();
      if (knownTokens.has(text)) {
        return;
      }
      node.replace($createTextNode(text));
    });

    return () => {
      unregisterTextTransform();
      unregisterSlashNodeTransform();
    };
  }, [editor, knownNames, knownTokens]);

  return null;
}
