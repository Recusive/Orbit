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
import { LexicalChatEditor } from './lexical';
import { MentionPopover } from './mention-popover';
import { SlashCommandPopover } from './slash-command-popover';
import { useChatInput } from './use-chat-input';

import type { ChatInputProps } from './types';
import type { FC } from 'react';

import { ElementContextChip } from '@/components/browser';
import { PermissionModal } from '@/components/modals';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';
import { useMaxTokens, useModel, useSessionUsage } from '@/stores/agent/tool-store';

/** Check if a permission request is for the AskUserQuestion tool */
function isAskUserQuestion(toolName: string): boolean {
  return toolName.toLowerCase() === 'askuserquestion';
}

export const ChatInput: FC<ChatInputProps> = memo(function ChatInput({
  inputMode,
  thinkingMode,
  effortLevel,
  isAgentRunning,
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
  // Subscribe directly to ToolStore instead of receiving as props from root.
  // This prevents BackendChatSurface (root) from re-rendering on switchSession,
  // which would cascade through all 10 keep-alive VirtuosoMessageList instances.
  const usage = useSessionUsage();
  const maxTokens = useMaxTokens();

  const {
    // State
    inputText,
    attachedContext,
    slashCommands,
    isInputEmpty,
    slashGhostText,
    leadingCommand,
    // Refs
    editorElementRef,
    editorRef,
    imageInputRef,
    // Popover state
    popover,
    // Handlers
    handleShiftTab,
    handleTextChange,
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
  // Question-style tools get their own overlay; other tools use the compact modal.
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
  const isQuestionOverlayActive = activeAskQuestion !== undefined;

  // Build known command names for multi-command highlighting.
  // Includes popover-selected command (explicit state, flicker-free) + all known commands from store.
  const knownCommandNames = useMemo((): ReadonlySet<string> => {
    const names = new Set<string>();
    if (leadingCommand !== null) names.add(leadingCommand);
    for (const cmd of slashCommands) {
      if (cmd.kind !== 'skill') names.add(cmd.name);
    }
    return names;
  }, [leadingCommand, slashCommands]);

  // Global keyboard shortcuts for regular permission modals.
  // Uses capture phase so Enter fires here BEFORE React's onKeyDown on
  // the input (which would otherwise send a message).
  // Question overlays handle their own keyboard shortcuts internally.
  useEffect(() => {
    if (regularPermissions.length === 0 || !onPermissionApprove || !onPermissionDeny) {
      return;
    }
    if (isQuestionOverlayActive) {
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
      // Cmd/Ctrl+Enter always allows when supported
      else if (
        e.key === 'Enter' &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        firstPermission.supportsAlwaysAllow
      ) {
        e.preventDefault();
        e.stopPropagation();
        onPermissionApprove(firstPermission.requestId, true);
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
  }, [isQuestionOverlayActive, onPermissionApprove, onPermissionDeny, regularPermissions]);

  return (
    <div className="flex justify-center px-4 pb-1 shrink-0 relative">
      <div
        className={`${getInputBoxClasses()} relative`}
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* Question overlays — full replacement for the input box content */}
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

            <LexicalChatEditor
              editorElementRef={editorElementRef}
              editorRef={editorRef}
              inputText={inputText}
              isInputEmpty={isInputEmpty}
              knownCommandNames={knownCommandNames}
              onSelectSlashCommand={handleSlashSelect}
              onSend={handleSend}
              onShiftTab={handleShiftTab}
              onTextChange={handleTextChange}
              popover={popover}
              slashCommands={slashCommands}
              slashGhostText={slashGhostText}
            />

            {/* Mention Popover */}
            <MentionPopover
              open={popover.mentionOpen}
              onOpenChange={popover.setMentionOpen}
              query={popover.mentionQuery}
              onQueryChange={popover.setMentionQuery}
              onSelect={handleMentionSelect}
              anchorRef={editorElementRef}
            />

            {/* Slash Command Popover — absolutely positioned inside the input box */}
            <SlashCommandPopover
              open={popover.slashOpen}
              onOpenChange={popover.setSlashOpen}
              query={popover.slashQuery}
              onSelect={handleSlashSelect}
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
              onModelChange={onModelChange}
              onEffortChange={onEffortChange}
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
