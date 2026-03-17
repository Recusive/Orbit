import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { createLogger } from '@orbit/common/lib';
import { useState } from 'react';

import { SlashCommandNode } from './SlashCommandNode';
import {
  EditorRefPlugin,
  FocusPlugin,
  KeyboardPlugin,
  MentionTriggerPlugin,
  PrefillPlugin,
  SlashCommandPlugin,
  TextChangePlugin,
} from './plugins';
import { chatInputTheme } from './theme';

import type { PopoverNavigationState, SlashCommand } from '../types';
import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import type { LexicalEditor } from 'lexical';
import type { FC } from 'react';

import { INPUT_SIZES } from '@/lib/utils';

const logger = createLogger('LexicalChatEditor');

interface LexicalChatEditorProps {
  readonly editorElementRef: React.RefObject<HTMLDivElement | null>;
  readonly editorRef: React.RefObject<LexicalEditor | null>;
  readonly inputText: string;
  readonly isInputEmpty: boolean;
  readonly knownCommandNames: ReadonlySet<string>;
  readonly onSelectSlashCommand: (command: SlashCommand) => void;
  readonly onSend: () => void;
  readonly onShiftTab: () => void;
  readonly onTextChange: (text: string) => void;
  readonly popover: PopoverNavigationState;
  readonly slashCommands: SlashCommand[];
  readonly slashGhostText: string;
}

const initialConfig: InitialConfigType = {
  namespace: 'ChatInput',
  nodes: [SlashCommandNode],
  onError: (error) => {
    logger.error('Lexical editor error', error);
  },
  theme: chatInputTheme,
};

export const LexicalChatEditor: FC<LexicalChatEditorProps> = ({
  editorElementRef,
  editorRef,
  inputText,
  isInputEmpty,
  knownCommandNames,
  onSelectSlashCommand,
  onSend,
  onShiftTab,
  onTextChange,
  popover,
  slashCommands,
  slashGhostText,
}) => {
  const [scrollTop, setScrollTop] = useState(0);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative overflow-hidden">
        <PlainTextPlugin
          ErrorBoundary={LexicalErrorBoundary}
          contentEditable={
            <ContentEditable
              ref={(element) => {
                editorElementRef.current = element;
              }}
              aria-label="Chat message"
              className="relative z-10 p-2 text-base text-foreground outline-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap wrap-break-word"
              data-demo-input
              data-empty={isInputEmpty}
              spellCheck
              style={{
                maxHeight: INPUT_SIZES.textareaMaxHeight,
                minHeight: INPUT_SIZES.textareaMinHeight,
              }}
              onScroll={(event) => {
                setScrollTop(event.currentTarget.scrollTop);
              }}
            />
          }
          placeholder={
            <div className="absolute top-0 left-0 p-2 text-base text-muted-foreground pointer-events-none select-none">
              Plan, @ for context, / for commands
            </div>
          }
        />
        <HistoryPlugin />
        <TextChangePlugin onChange={onTextChange} />
        <SlashCommandPlugin
          commands={slashCommands}
          knownNames={knownCommandNames}
          popover={popover}
        />
        <MentionTriggerPlugin popover={popover} />
        <KeyboardPlugin
          commands={slashCommands}
          onSelectSlashCommand={onSelectSlashCommand}
          onSend={onSend}
          onShiftTab={onShiftTab}
          popover={popover}
        />
        <PrefillPlugin />
        <FocusPlugin />
        <EditorRefPlugin editorRef={editorRef} />

        {slashGhostText.length > 0 ? (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap wrap-break-word"
          >
            <div
              className="p-2 text-base"
              style={{
                maxHeight: INPUT_SIZES.textareaMaxHeight,
                minHeight: INPUT_SIZES.textareaMinHeight,
                transform: `translateY(-${String(scrollTop)}px)`,
              }}
            >
              <span className="invisible">{inputText}</span>
              <span className="text-muted-foreground/40">{slashGhostText}</span>
            </div>
          </div>
        ) : null}
      </div>
    </LexicalComposer>
  );
};
