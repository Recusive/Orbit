/**
 * ChatInput - Main chat input component with context attachments
 *
 * NOTE: Input dimensions and chat width come from @/lib/utils/constants.
 * To change textarea sizes, chat max-width, or input box dimensions,
 * update CHAT_WIDTH, CHAT_WIDTH_VAR, and INPUT_SIZES in constants.ts.
 */
import { memo, useEffect, useMemo } from 'react';

import { InputControls } from './InputControls';
import { OcQuestionCard } from './OcQuestionCard';
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

interface TextSegment {
  readonly text: string;
  readonly isCommand: boolean;
}

/** Parse text into segments, marking /<known-command> tokens for blue highlighting. */
function parseCommandSegments(text: string, knownNames: ReadonlySet<string>): TextSegment[] {
  if (text.length === 0 || knownNames.size === 0) return [{ text, isCommand: false }];

  const segments: TextSegment[] = [];
  // Match /<word> tokens preceded by start-of-string or whitespace
  const pattern = /(?:^|(?<=\s))\/([\w-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (name === undefined || !knownNames.has(name)) continue;

    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isCommand: false });
    }
    // The command token
    segments.push({ text: match[0], isCommand: true });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isCommand: false });
  }

  return segments.length > 0 ? segments : [{ text, isCommand: false }];
}

export const ChatInput: FC<ChatInputProps> = memo(function ChatInput({
  inputMode,
  thinkingMode,
  effortLevel,
  isAgentRunning,
  usage,
  maxTokens,
  permissions = [],
  questions,
  onPermissionApprove,
  onPermissionDeny,
  onQuestionReply,
  onQuestionReject,
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
    inputText,
    attachedContext,
    slashCommands,
    isInputEmpty,
    slashGhostText,
    leadingCommand,
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

  // Parse input text into segments for the colored overlay
  const commandSegments = useMemo(
    () => parseCommandSegments(inputText, knownCommandNames),
    [inputText, knownCommandNames]
  );
  const hasAnyCommand = commandSegments.some((seg) => seg.isCommand);

  // Global keyboard shortcuts for regular permission modals.
  // Uses capture phase so Enter fires here BEFORE React's onKeyDown on
  // the input (which would otherwise send a message).
  // AskUserQuestion handles its own keyboard shortcuts internally.
  useEffect(() => {
    if (regularPermissions.length === 0 || !onPermissionApprove || !onPermissionDeny) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('[data-oc-question]') !== null) {
        return;
      }

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
  }, [regularPermissions, onPermissionApprove, onPermissionDeny]);

  return (
    <div className="flex justify-center px-4 pb-1 shrink-0 relative">
      <div
        className={`${getInputBoxClasses()} relative`}
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

            {questions !== undefined &&
            questions.length > 0 &&
            onQuestionReply !== undefined &&
            onQuestionReject !== undefined ? (
              <div className="space-y-2 px-1 pb-1">
                {questions.map((question) => (
                  <OcQuestionCard
                    key={question.id}
                    question={question}
                    onReply={onQuestionReply}
                    onReject={onQuestionReject}
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

            {/* Input Area — text is always transparent, overlay renders the visible text.
                This avoids all WebKit cursor issues with styled inline elements. */}
            <div className="relative">
              <div
                ref={inputRef}
                data-demo-input
                className="p-2 text-base outline-none overflow-y-auto overflow-x-hidden wrap-break-word"
                style={{
                  minHeight: INPUT_SIZES.textareaMinHeight,
                  maxHeight: INPUT_SIZES.textareaMaxHeight,
                  // Only make text transparent when commands are detected.
                  // When no command, contentEditable renders text normally — no overlay needed.
                  ...(hasAnyCommand
                    ? { color: 'transparent', caretColor: 'var(--foreground)' }
                    : {}),
                }}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Plan, @ for context, / for commands"
                data-empty={isInputEmpty}
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onScroll={(e) => {
                  // Sync overlay scroll with contentEditable scroll
                  const overlay = e.currentTarget.nextElementSibling;
                  if (overlay instanceof HTMLElement) {
                    overlay.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
              />

              {/* Command highlight overlay — renders all text with known /commands in blue.
                  ContentEditable text is transparent when commands are present, so this overlay
                  provides the visible text. Same font/padding = pixel-perfect alignment. */}
              {hasAnyCommand ? (
                <div
                  aria-hidden
                  className="absolute top-0 left-0 p-2 text-base pointer-events-none whitespace-pre-wrap wrap-break-word overflow-hidden"
                  style={{
                    minHeight: INPUT_SIZES.textareaMinHeight,
                    maxHeight: INPUT_SIZES.textareaMaxHeight,
                  }}
                >
                  {commandSegments.map((seg, i) => (
                    <span
                      key={`${String(i)}-${seg.text.slice(0, 8)}`}
                      className={seg.isCommand ? 'text-git-untracked' : 'text-foreground'}
                    >
                      {seg.text}
                    </span>
                  ))}
                </div>
              ) : null}

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
                  <span className="invisible">{inputText}</span>
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
