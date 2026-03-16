import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import { readActiveTrigger } from '../bridge';

import type { PopoverNavigationState } from '../../types';

interface MentionTriggerPluginProps {
  readonly popover: PopoverNavigationState;
}

export function MentionTriggerPlugin({ popover }: MentionTriggerPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const trigger = readActiveTrigger(editorState);
      if (trigger?.kind === 'mention') {
        popover.setMentionQuery(trigger.query);
        popover.setMentionStartIndex(trigger.start);
        popover.setMentionOpen(true);
        if (popover.slashOpen) {
          popover.closeSlashPopover();
        }
        return;
      }

      popover.closeMentionPopover();
    });
  }, [editor, popover]);

  return null;
}
