/**
 * ChatInput - Main chat input component with context attachments
 *
 * NOTE: Input dimensions and chat width come from @/lib/utils/constants.
 * To change textarea sizes, chat max-width, or input box dimensions,
 * update CHAT_WIDTH, CHAT_WIDTH_VAR, and INPUT_SIZES in constants.ts.
 */
import { memo, useCallback } from 'react';

import { InputControls } from './InputControls';
import { ContextChips } from './context-chips';
import { MentionPopover } from './mention-popover';
import { SlashCommandPopover } from './slash-command-popover';
import { useChatInput } from './use-chat-input';

import type { ChatInputProps } from './types';
import type { FC } from 'react';

import { ElementContextList } from '@/components/browser';
import { PermissionModal } from '@/components/modals';
import { CHAT_WIDTH, CHAT_WIDTH_VAR, INPUT_SIZES } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

export const ChatInput: FC<ChatInputProps> = memo(function ChatInput({
  inputMode,
  thinkingMode,
  isAgentRunning,
  usage,
  maxTokens,
  permissions = [],
  onPermissionApprove,
  onPermissionDeny,
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
    handleStop,
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
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
  });

  // Get store action for opening browser panel
  const setActivityTab = useUIStore((state) => state.setActivityTab);

  // Handler to open browser panel
  const handleGlobeClick = useCallback((): void => {
    setActivityTab('browser');
  }, [setActivityTab]);

  return (
    <div className="p-4 pt-0 shrink-0 relative">
      <div
        className={getInputBoxClasses()}
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* Permission Modals - rendered inside the bordered container
            Using role="alert" because permissions require immediate user attention
            (they block agent execution until approved/denied). The container announces
            once when permissions appear; individual modals don't trigger announcements. */}
        {permissions.length > 0 &&
        onPermissionApprove !== undefined &&
        onPermissionDeny !== undefined ? (
          <div role="alert" aria-live="assertive">
            {permissions.map((request, index) => (
              <PermissionModal
                key={request.requestId}
                request={request}
                onApprove={onPermissionApprove}
                onDeny={onPermissionDeny}
                isFirst={index === 0}
                isLast={index === permissions.length - 1}
              />
            ))}
          </div>
        ) : null}

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
          anchorRef={inputRef}
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
          handleGlobeClick={handleGlobeClick}
          handleImageClick={handleImageClick}
          handleImageSelect={handleImageSelect}
          handleSend={handleSend}
          handleStop={handleStop}
          getThinkingInfo={getThinkingInfo}
          getActiveDots={getActiveDots}
        />
      </div>
    </div>
  );
});
