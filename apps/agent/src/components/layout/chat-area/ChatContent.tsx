import { useCallback, useRef } from 'react';

import { SessionInstanceManager } from './SessionInstanceManager';
import { EMPTY_STATE_PADDING_BOTTOM } from './constants';

import type { ChatContentProps } from './types';
import type { SessionVerificationResult } from '@/services/conversations/session-switch-coordinator';
import type { FC } from 'react';

import { AuthErrorBanner, ChatInput, TodoBar } from '@/components/chat';
import { StatusAnnouncer } from '@/components/shared';
import { VaultPage } from '@/features/vault';
import {
  abortSessionSwitch,
  commitSessionReveal,
  promotePendingToVisibleVerification,
} from '@/services/conversations/session-switch-coordinator';
import { useChatStore } from '@/stores/chat/chat-store';
import {
  usePendingConversationTitle,
  usePendingSessionId,
  usePendingSessionPhase,
  useSessionSwitchRequestId,
} from '@/stores/chat/session-switch-store';
import { useUIStore, useVaultOpen } from '@/stores/ui/ui-store';

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
  const shownSessionId = sessionId !== '' ? sessionId : undefined;
  const pendingSessionId = usePendingSessionId() ?? undefined;
  const pendingPhase = usePendingSessionPhase();
  const pendingConversationTitle = usePendingConversationTitle();
  const sessionSwitchRequestId = useSessionSwitchRequestId();
  const isConversationTransitioning = useUIStore((state) => state.isConversationTransitioning);
  const sessionMessageCount = useChatStore(
    (state) => (shownSessionId ? state.sessions[shownSessionId]?.messages.length : undefined) ?? 0
  );
  const sessionHydrationState = useChatStore(
    (state) =>
      (shownSessionId ? state.sessions[shownSessionId]?.hydrationState : undefined) ?? 'unloaded'
  );
  const isEmptyState =
    shownSessionId !== undefined &&
    pendingSessionId === undefined &&
    sessionHydrationState === 'hydrated' &&
    sessionMessageCount === 0 &&
    !isLoadingConversation &&
    !isConversationTransitioning;
  const shouldShowPendingShell = shownSessionId === undefined && pendingSessionId !== undefined;
  const focusRestoreRef = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback((): void => {
    const target = focusRestoreRef.current;
    if (target && document.contains(target)) {
      requestAnimationFrame(() => {
        target.focus();
      });
    }
    focusRestoreRef.current = null;
  }, []);

  const handlePendingVerificationResult = useCallback(
    (result: SessionVerificationResult): void => {
      if (
        pendingSessionId === undefined ||
        result.sessionId !== pendingSessionId ||
        result.requestId !== sessionSwitchRequestId
      ) {
        return;
      }

      if (result.result === 'hidden-ready') {
        const activeElement =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        focusRestoreRef.current = activeElement;
        promotePendingToVisibleVerification(
          result.requestId,
          result.sessionId,
          pendingConversationTitle
        );
        return;
      }

      if (result.result === 'visible-ready') {
        commitSessionReveal(result.requestId, result.sessionId, pendingConversationTitle);
        focusRestoreRef.current = null;
        return;
      }

      if (result.result === 'aborted') {
        return;
      }

      abortSessionSwitch(
        result.requestId,
        result.phase === 'hidden' ? 'hidden_timeout' : 'visible_timeout'
      );
      restoreFocus();
    },
    [pendingConversationTitle, pendingSessionId, restoreFocus, sessionSwitchRequestId]
  );

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
          {shouldShowPendingShell ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
              <div className="w-full max-w-xl rounded-2xl border border-border/60 bg-background/95 px-6 py-8 shadow-sm">
                <div className="space-y-3" aria-live="polite" aria-busy="true">
                  <div className="text-sm font-medium text-foreground">Loading conversation...</div>
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-muted/80" />
                  <div className="h-3 w-5/6 animate-pulse rounded-full bg-muted/70" />
                </div>
              </div>
            </div>
          ) : null}
          <SessionInstanceManager
            shownSessionId={shownSessionId}
            pendingSessionId={pendingSessionId}
            pendingPhase={pendingPhase}
            pendingRequestId={sessionSwitchRequestId}
            isShownHidden={isEmptyState}
            queuedMessage={shownSessionId ? queuedMessage : null}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
            onPendingVerificationResult={handlePendingVerificationResult}
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
