import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { getCommandAtIndex, getFilteredCommandsCount } from '../../slash-command-popover';
import { handlePopoverKeyDown } from '../../use-popover-navigation';

import type { PopoverNavigationState, SlashCommand } from '../../types';

interface KeyboardPluginProps {
  readonly commands: SlashCommand[];
  readonly onSelectSlashCommand: (command: SlashCommand) => void;
  readonly onSend: () => void;
  readonly onShiftTab: () => void;
  readonly popover: PopoverNavigationState;
}

export function KeyboardPlugin({
  commands,
  onSelectSlashCommand,
  onSend,
  onShiftTab,
  popover,
}: KeyboardPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const selectSlashCommand = (): void => {
      const selectedCommand = getCommandAtIndex(
        popover.slashQuery,
        popover.slashSelectedIndex,
        commands
      );
      if (selectedCommand !== null) {
        onSelectSlashCommand(selectedCommand);
      }
    };

    const filteredCount = getFilteredCommandsCount(popover.slashQuery, commands);

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) {
          return false;
        }

        if (popover.slashOpen) {
          event?.preventDefault();
          selectSlashCommand();
          return true;
        }

        if (popover.mentionOpen) {
          return false;
        }

        event?.preventDefault();
        onSend();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (popover.slashOpen) {
          const handled = handlePopoverKeyDown(event, {
            itemCount: filteredCount,
            onClose: popover.closeSlashPopover,
            onSelect: selectSlashCommand,
            selectedIndex: popover.slashSelectedIndex,
            setSelectedIndex: popover.setSlashSelectedIndex,
          });
          return handled;
        }

        if (event.shiftKey) {
          event.preventDefault();
          onShiftTab();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!popover.slashOpen) {
          return false;
        }

        return handlePopoverKeyDown(event, {
          itemCount: filteredCount,
          onClose: popover.closeSlashPopover,
          onSelect: selectSlashCommand,
          selectedIndex: popover.slashSelectedIndex,
          setSelectedIndex: popover.setSlashSelectedIndex,
        });
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!popover.slashOpen) {
          return false;
        }

        return handlePopoverKeyDown(event, {
          itemCount: filteredCount,
          onClose: popover.closeSlashPopover,
          onSelect: selectSlashCommand,
          selectedIndex: popover.slashSelectedIndex,
          setSelectedIndex: popover.setSlashSelectedIndex,
        });
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!popover.slashOpen) {
          return false;
        }

        event.preventDefault();
        popover.closeSlashPopover();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      unregisterEnter();
      unregisterTab();
      unregisterArrowDown();
      unregisterArrowUp();
      unregisterEscape();
    };
  }, [commands, editor, onSelectSlashCommand, onSend, onShiftTab, popover]);

  return null;
}
