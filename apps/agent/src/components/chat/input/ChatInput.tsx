/**
 * ChatInput - Main chat input component with context attachments
 *
 * NOTE: Input dimensions and chat width come from @/lib/utils/constants.
 * To change textarea sizes, chat max-width, or input box dimensions,
 * update CHAT_WIDTH, CHAT_WIDTH_VAR, and INPUT_SIZES in constants.ts.
 */
import { memo } from 'react';

import { InputControls } from './InputControls';
import { ContextChips } from './context-chips';
import { MentionPopover } from './mention-popover';
import { SlashCommandPopover } from './slash-command-popover';
import { useChatInput } from './use-chat-input';

import type { ChatInputProps } from './types';
import type { FC } from 'react';

import { ElementContextList } from '@/components/browser';
import { CHAT_WIDTH, CHAT_WIDTH_VAR, INPUT_SIZES } from '@/lib/utils/constants';

export const ChatInput: FC<ChatInputProps> = memo(function ChatInput({
  inputMode,
  thinkingMode,
  isAgentRunning,
  fileList,
  usage,
  maxTokens,
  hasPermissionPending = false,
  onSend,
  onStop,
  onModeChange,
  onThinkingModeChange,
  onModelChange,
}) {
  const {
    // State
    attachedContext,
    slashCommands,
    isInputEmpty,
    // Refs
    inputRef,
    imageInputRef,
    // Popover state
    popover,
    // Handlers
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleSend,
    handleImageClick,
    handleImageSelect,
    handleMentionSelect,
    handleSlashSelect,
    handleRemoveContext,
    handleAtClick,
    cycleInputMode,
    cycleThinkingMode,
    // Utilities
    getThinkingInfo,
    getActiveDots,
    getInputBoxClasses,
    // Browser context
    elementContexts,
    removeElementContext,
  } = useChatInput({
    inputMode,
    thinkingMode,
    isAgentRunning,
    fileList,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
  });

  return (
    <div className="p-4 pt-0 shrink-0 relative">
      <div
        className={getInputBoxClasses(hasPermissionPending)}
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* Element Context Chips - selected browser elements */}
        <ElementContextList elements={elementContexts} onRemove={removeElementContext} />

        {/* Context Chips Row - shown when items attached */}
        {attachedContext.length > 0 ? (
          <ContextChips items={attachedContext} onRemove={handleRemoveContext} />
        ) : null}

        {/* Input Area */}
        <div
          ref={inputRef}
          className="p-2 text-base outline-none overflow-y-auto"
          style={{
            minHeight: INPUT_SIZES.textareaMinHeight,
            maxHeight: INPUT_SIZES.textareaMaxHeight,
          }}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Plan, @ for context, / for commands"
          data-empty={isInputEmpty}
          onInput={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        {/* Mention Popover */}
        <MentionPopover
          open={popover.mentionOpen}
          onOpenChange={popover.setMentionOpen}
          query={popover.mentionQuery}
          onQueryChange={popover.setMentionQuery}
          onSelect={handleMentionSelect}
          files={fileList}
          anchorRef={inputRef}
          selectedIndex={popover.mentionSelectedIndex}
          onSelectedIndexChange={popover.setMentionSelectedIndex}
        />

        {/* Slash Command Popover */}
        <SlashCommandPopover
          open={popover.slashOpen}
          onOpenChange={popover.setSlashOpen}
          query={popover.slashQuery}
          onSelect={handleSlashSelect}
          anchorRef={inputRef}
          selectedIndex={popover.slashSelectedIndex}
          commands={slashCommands}
        />

        {/* Controls Row */}
        <InputControls
          inputMode={inputMode}
          thinkingMode={thinkingMode}
          isAgentRunning={isAgentRunning}
          isInputEmpty={isInputEmpty}
          usage={usage}
          maxTokens={maxTokens}
          imageInputRef={imageInputRef}
          thinkingHoverOpen={popover.thinkingHoverOpen}
          setThinkingHoverOpen={popover.setThinkingHoverOpen}
          onModelChange={onModelChange}
          cycleInputMode={cycleInputMode}
          cycleThinkingMode={cycleThinkingMode}
          handleAtClick={handleAtClick}
          handleImageClick={handleImageClick}
          handleImageSelect={handleImageSelect}
          handleSend={handleSend}
          onStop={onStop}
          getThinkingInfo={getThinkingInfo}
          getActiveDots={getActiveDots}
        />
      </div>
    </div>
  );
});
