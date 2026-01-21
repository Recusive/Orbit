import { PermissionBar } from './PermissionBar';
import { EMPTY_STATE_PADDING_BOTTOM } from './constants';

import type { ChatContentProps } from './types';
import type { FC } from 'react';

import { ChatInput, ChatMessages } from '@/components/chat';
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
  fileList,
  inputMode,
  thinkingMode,
  sessionUsage,
  maxTokens,
  getToolsForMessage,
  onSend,
  onStop,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onModeChange,
  onThinkingModeChange,
  onModelChange,
  onPermissionApprove,
  onPermissionDeny,
}) => {
  const vaultOpen = useVaultOpen();
  const isEmptyState = messages.length === 0 && !isLoadingConversation;

  // Shared input props to avoid duplication
  const inputProps = {
    inputMode,
    thinkingMode,
    isAgentRunning,
    fileList,
    usage: sessionUsage,
    maxTokens,
    hasPermissionPending: pendingPermissions.length > 0,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
    onModelChange,
  } as const;

  return (
    <div
      ref={contentRef}
      className={`flex-1 flex flex-col min-h-0${isTransitioning ? ' no-transitions' : ''}`}
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
          <PermissionBar
            permissions={pendingPermissions}
            onApprove={onPermissionApprove}
            onDeny={onPermissionDeny}
          />
          <ChatInput {...inputProps} />
        </div>
      ) : (
        /* Normal layout: Messages + Input at bottom */
        <div className="flex-1 flex flex-col min-h-0">
          <ChatMessages
            messages={messages}
            isAgentRunning={isAgentRunning}
            sessionId={sessionId}
            queuedMessage={queuedMessage}
            getToolsForMessage={getToolsForMessage}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
          />
          <PermissionBar
            permissions={pendingPermissions}
            onApprove={onPermissionApprove}
            onDeny={onPermissionDeny}
          />
          <ChatInput {...inputProps} />
        </div>
      )}
    </div>
  );
};
