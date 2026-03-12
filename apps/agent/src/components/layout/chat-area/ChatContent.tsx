import { EMPTY_STATE_PADDING_BOTTOM } from './constants';

import type { ChatContentProps } from './types';
import type { FC } from 'react';

import { ChatInput, ChatMessages, TodoBar } from '@/components/chat';
import { StatusAnnouncer } from '@/components/shared';
import { VaultPage } from '@/features/vault';
import { useVaultOpen } from '@/stores/ui/ui-store';

/**
 * Chat content section handling both empty and messages states
 *
 * - Empty state: Input positioned above center with paddingBottom
 * - Messages state: Messages list + input at bottom
 *
 * Uses visibility:hidden during transitions to prevent layout flash.
 *
 * Drop target for file-explorer drag-and-drop: marked with
 * data-orbit-drop-zone="chat" so the source-side handleDragEnd
 * in file-explorer.tsx can hit-test via elementFromPoint().
 * WKWebView intercepts target-side drag events (dragenter/dragover/drop)
 * at the native level for internal drags, so we handle drops entirely
 * on the source side instead.
 */
export const ChatContent: FC<ChatContentProps> = ({
  contentRef,
  isTransitioning,
  isLoadingConversation,
  messages,
  isAgentRunning,
  sessionId,
  queuedMessage,
  pendingPermissions,
  questions,
  inputMode,
  thinkingMode,
  effortLevel,
  sessionUsage,
  maxTokens,
  onSend,
  onStop,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onModeChange,
  onThinkingModeChange,
  onEffortLevelChange,
  onModelChange,
  onPermissionApprove,
  onPermissionDeny,
  onQuestionReply,
  onQuestionReject,
  extraControls,
}) => {
  const vaultOpen = useVaultOpen();
  const isEmptyState = messages.length === 0 && !isLoadingConversation;

  // Shared input props to avoid duplication
  const inputProps = {
    inputMode,
    thinkingMode,
    effortLevel,
    isAgentRunning,
    usage: sessionUsage,
    maxTokens,
    permissions: pendingPermissions,
    onPermissionApprove,
    onPermissionDeny,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
    onEffortChange: onEffortLevelChange,
    onModelChange,
    ...(questions !== undefined ? { questions } : {}),
    ...(onQuestionReply !== undefined ? { onQuestionReply } : {}),
    ...(onQuestionReject !== undefined ? { onQuestionReject } : {}),
  } as const;

  return (
    <div
      ref={contentRef}
      data-orbit-drop-zone="chat"
      className={`relative flex-1 flex flex-col min-h-0${isTransitioning ? ' no-transitions' : ''}`}
      style={isTransitioning ? { visibility: 'hidden' } : undefined}
    >
      {/* Screen reader status announcer for agent state changes */}
      <StatusAnnouncer
        isLoading={isAgentRunning}
        loadingMessage="Agent is processing your request..."
        completeMessage={messages.length > 0 ? 'Agent response complete' : 'Ready for input'}
      />

      {vaultOpen ? (
        /* Vault page: Note tiles grid */
        <VaultPage />
      ) : isEmptyState ? (
        /* Empty state: Input positioned above center */
        <div
          className="flex-1 flex flex-col justify-center"
          style={{ paddingBottom: EMPTY_STATE_PADDING_BOTTOM }}
        >
          {extraControls}
          <ChatInput {...inputProps} />
        </div>
      ) : (
        /* Normal layout: Messages fill the space, input overlays the bottom.
           The input is absolutely positioned so messages scroll behind it,
           creating a frosted-glass blur effect via backdrop-filter. */
        <div className="flex-1 flex flex-col relative min-h-0">
          <ChatMessages
            messages={messages}
            isAgentRunning={isAgentRunning}
            sessionId={sessionId}
            queuedMessage={queuedMessage}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
          />
          {/* Floating input container — transparent with soft fade at top */}
          <div className="absolute bottom-0 inset-x-0 z-20 pb-2 chat-input-frost">
            <TodoBar />
            {extraControls}
            <ChatInput {...inputProps} />
          </div>
        </div>
      )}
    </div>
  );
};
