/**
 * ChatInput - Main chat input component with context attachments
 *
 * NOTE: Input dimensions and chat width come from @/lib/utils/constants.
 * To change textarea sizes, chat max-width, or input box dimensions,
 * update CHAT_WIDTH, CHAT_WIDTH_VAR, and INPUT_SIZES in constants.ts.
 */
import { memo, useEffect, useMemo } from 'react';

import { InputControls } from './InputControls';
import { AskUserQuestionModal } from './ask-user-question-modal';
import { ContextChips } from './context-chips';
import { MentionPopover } from './mention-popover';
import { SlashCommandPopover } from './slash-command-popover';
import { useChatInput } from './use-chat-input';

import type { ChatInputProps } from './types';
import type { FC } from 'react';

import { ElementContextChip } from '@/components/browser';
import { PermissionModal } from '@/components/modals';
import { CHAT_WIDTH, CHAT_WIDTH_VAR, INPUT_SIZES } from '@/lib/utils';
import { useModel } from '@/stores/agent/tool-store';

/** Check if a permission request is for the AskUserQuestion tool */
function isAskUserQuestion(toolName: string): boolean {
  return toolName.toLowerCase() === 'askuserquestion';
}

export const ChatInput: FC<ChatInputProps> = memo(function ChatInput({
  inputMode,
  thinkingMode,
  effortLevel,
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
  onEffortChange,
  onModelChange,
}) {
  // Read current model from store (used to conditionally render effort vs thinking UI)
  const model = useModel();

  const {
    // State
    attachedContext,
    slashCommands,
    isInputEmpty,
    slashGhostText,
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
    handleStop,
    cycleInputMode,
    cycleThinkingMode,
    cycleEffortLevel,
    // Utilities
    getThinkingInfo,
    getActiveDots,
    getEffortInfo,
    getInputBoxClasses,
    // Browser context
    elementContexts,
    removeElementContext,
  } = useChatInput({
    inputMode,
    thinkingMode,
    effortLevel,
    isAgentRunning,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
    onEffortChange,
  });

  // Split permissions into AskUserQuestion vs regular tool permissions.
  // AskUserQuestion gets its own interactive card; other tools use the compact modal.
  const { askUserQuestions, regularPermissions } = useMemo(() => {
    const ask: (typeof permissions)[number][] = [];
    const regular: (typeof permissions)[number][] = [];
    for (const p of permissions) {
      if (isAskUserQuestion(p.toolName)) {
        ask.push(p);
      } else {
        regular.push(p);
      }
    }
    return { askUserQuestions: ask, regularPermissions: regular };
  }, [permissions]);

  // The active AskUserQuestion request (only one at a time — the first)
  const activeAskQuestion = askUserQuestions[0];

  // Global keyboard shortcuts for regular permission modals.
  // Uses capture phase so Enter fires here BEFORE React's onKeyDown on
  // the input (which would otherwise send a message).
  // AskUserQuestion handles its own keyboard shortcuts internally.
  useEffect(() => {
    if (regularPermissions.length === 0 || !onPermissionApprove || !onPermissionDeny) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      const firstPermission = regularPermissions[0];
      if (firstPermission === undefined) return;

      // Plain Enter approves the first permission
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onPermissionApprove(firstPermission.requestId);
      }
      // ESC denies the first permission (matches the button label)
      else if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onPermissionDeny(firstPermission.requestId);
      }
      // Cmd+Backspace also denies (legacy shortcut)
      else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        onPermissionDeny(firstPermission.requestId);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [regularPermissions, onPermissionApprove, onPermissionDeny]);

  return (
    <div className="flex justify-center px-4 pb-1 shrink-0 relative">
      <div
        className={getInputBoxClasses()}
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* AskUserQuestion Modal — full overlay replacing the entire input box content */}
        {activeAskQuestion !== undefined &&
        onPermissionApprove !== undefined &&
        onPermissionDeny !== undefined ? (
          <AskUserQuestionModal
            request={activeAskQuestion}
            onApprove={onPermissionApprove}
            onDeny={onPermissionDeny}
          />
        ) : (
          <>
            {/* Regular Permission Modals - rendered inside the bordered container
                Using role="alert" because permissions require immediate user attention
                (they block agent execution until approved/denied). The container announces
                once when permissions appear; individual modals don't trigger announcements. */}
            {regularPermissions.length > 0 &&
            onPermissionApprove !== undefined &&
            onPermissionDeny !== undefined ? (
              <div role="status" aria-live="polite">
                {regularPermissions.map((request, index) => (
                  <PermissionModal
                    key={request.requestId}
                    request={request}
                    onApprove={onPermissionApprove}
                    onDeny={onPermissionDeny}
                    isLast={index === regularPermissions.length - 1}
                  />
                ))}
              </div>
            ) : null}

            {/* Context Chips Row — element + file/skill chips in one row */}
            {elementContexts.length > 0 || attachedContext.length > 0 ? (
              <ContextChips items={attachedContext} onRemove={handleRemoveContext}>
                {elementContexts.map((element, index) => (
                  <ElementContextChip
                    key={`el-${element.displayName}-${String(index)}`}
                    element={element}
                    onRemove={(): void => {
                      removeElementContext(index);
                    }}
                    compact
                  />
                ))}
              </ContextChips>
            ) : null}

            {/* Input Area — relative wrapper for ghost text overlay */}
            <div className="relative">
              <div
                ref={inputRef}
                data-demo-input
                className="p-2 text-base outline-none overflow-y-auto overflow-x-hidden wrap-break-word"
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

              {/* Ghost autocomplete text — mirrors input position, typed portion is invisible */}
              {slashGhostText.length > 0 ? (
                <div
                  aria-hidden
                  className="absolute top-0 left-0 p-2 text-base pointer-events-none whitespace-pre-wrap wrap-break-word"
                  style={{
                    minHeight: INPUT_SIZES.textareaMinHeight,
                    maxHeight: INPUT_SIZES.textareaMaxHeight,
                  }}
                >
                  <span className="invisible">{inputRef.current?.textContent ?? ''}</span>
                  <span className="text-muted-foreground/40">{slashGhostText}</span>
                </div>
              ) : null}
            </div>

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
              model={model}
              thinkingMode={thinkingMode}
              effortLevel={effortLevel}
              isAgentRunning={isAgentRunning}
              isInputEmpty={isInputEmpty}
              usage={usage}
              maxTokens={maxTokens}
              imageInputRef={imageInputRef}
              thinkingHoverOpen={popover.thinkingHoverOpen}
              setThinkingHoverOpen={popover.setThinkingHoverOpen}
              effortHoverOpen={popover.effortHoverOpen}
              setEffortHoverOpen={popover.setEffortHoverOpen}
              onModelChange={onModelChange}
              cycleInputMode={cycleInputMode}
              cycleThinkingMode={cycleThinkingMode}
              cycleEffortLevel={cycleEffortLevel}
              handleImageClick={handleImageClick}
              handleImageSelect={handleImageSelect}
              handleSend={handleSend}
              handleStop={handleStop}
              getThinkingInfo={getThinkingInfo}
              getActiveDots={getActiveDots}
              getEffortInfo={getEffortInfo}
            />
          </>
        )}
      </div>
    </div>
  );
});
