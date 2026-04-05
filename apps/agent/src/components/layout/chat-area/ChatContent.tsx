import { useCallback, useState } from 'react';

import { SessionInstanceManager } from './SessionInstanceManager';
import { EMPTY_STATE_PADDING_BOTTOM } from './constants';

import type { ChatContentProps } from './types';
import type { FC } from 'react';

import { AuthErrorBanner, ChatInput, TodoBar } from '@/components/chat';
import { StatusAnnouncer } from '@/components/shared';
import { VaultPage } from '@/features/vault';
import { useChatStore } from '@/stores/chat/chat-store';
import { useVaultOpen } from '@/stores/ui/ui-store';

/**
 * Chat content section handling both empty and messages states
 *
 * - Empty state: Input positioned above center with paddingBottom
 * - Messages state: SessionInstanceManager renders keep-alive VirtuosoMessageList
 *   instances per recently-visited session (Discord/Slack pattern)
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
  isLoadingConversation,
  messages,
  isAgentRunning,
  sessionId,
  queuedMessage,
  pendingPermissions,
  inputMode,
  thinkingMode,
  effortLevel,
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
  extraControls,
}) => {
  const vaultOpen = useVaultOpen();
  const sessionMessageCount = useChatStore(
    (state) => state.sessions[sessionId]?.messages.length ?? 0
  );
  const sessionHydrationState = useChatStore(
    (state) => state.sessions[sessionId]?.hydrationState ?? 'unloaded'
  );
  const isEmptyState =
    sessionHydrationState === 'hydrated' && sessionMessageCount === 0 && !isLoadingConversation;

  // Track which session is visually shown (may differ from activeSessionId
  // during first-visit handoff). TodoBar uses this to show the correct tools.
  const [shownSessionId, setShownSessionId] = useState<string | undefined>(sessionId);
  const handleShownSessionChange = useCallback((sid: string | undefined) => {
    setShownSessionId(sid);
  }, []);

  // Shared input props to avoid duplication
  const inputProps = {
    inputMode,
    thinkingMode,
    effortLevel,
    isAgentRunning,
    permissions: pendingPermissions,
    onPermissionApprove,
    onPermissionDeny,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
    onEffortChange: onEffortLevelChange,
    onModelChange,
  } as const;

  return (
    <div
      ref={contentRef}
      data-orbit-drop-zone="chat"
      className="relative flex-1 flex flex-col min-h-0"
    >
      {/* Screen reader status announcer for agent state changes */}
      <StatusAnnouncer
        isLoading={isAgentRunning}
        loadingMessage="Agent is processing your request..."
        completeMessage={messages.length > 0 ? 'Agent response complete' : 'Ready for input'}
      />

      <AuthErrorBanner />

      {vaultOpen ? (
        /* Vault page: Note tiles grid */
        <VaultPage />
      ) : (
        /* SessionInstanceManager is ALWAYS mounted when not in vault mode.
           Hidden instances are position:absolute so they don't affect layout. */
        <>
          <SessionInstanceManager
            activeSessionId={sessionId}
            isActiveHidden={isEmptyState}
            queuedMessage={queuedMessage}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
            onShownSessionChange={handleShownSessionChange}
          />
        </>
      )}

      {/* ChatInput rendered ONCE outside the ternary — never unmounts during
          session switches. In empty state the container flexes to center the
          input above the midpoint; otherwise it sits as a fixed footer. */}
      {!vaultOpen ? (
        <div
          className={
            isEmptyState ? 'flex-1 flex flex-col justify-center px-0' : 'shrink-0 pb-2 px-0'
          }
          style={isEmptyState ? { paddingBottom: EMPTY_STATE_PADDING_BOTTOM } : undefined}
        >
          <TodoBar overrideSessionId={shownSessionId} />
          {extraControls}
          <ChatInput {...inputProps} />
        </div>
      ) : null}
    </div>
  );
};
