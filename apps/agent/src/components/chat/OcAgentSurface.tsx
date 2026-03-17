import { ChatSkeleton } from './chat-skeleton';

import type { FC } from 'react';

import { ChatContent } from '@/components/layout/chat-area/ChatContent';
import { useLayoutStabilization } from '@/components/layout/chat-area/use-layout-stabilization';
import { useOcChatAdapter } from '@/hooks/chat/use-oc-chat-adapter';
import { useIsSwitchingBackend } from '@/stores/backend';
import { useOcSelectedModelContextLimit } from '@/stores/opencode';
import {
  useIsConversationTransitioning,
  useIsLoadingConversation,
  useUIStore,
} from '@/stores/ui/ui-store';

const noop = (): void => undefined;
const EMPTY_SESSION_ID = 'opencode-pending';

export const OcAgentSurface: FC = () => {
  const isLoadingConversation = useIsLoadingConversation();
  const isTransitioning = useIsConversationTransitioning();
  const isSwitchingBackend = useIsSwitchingBackend();
  const maxTokens = useOcSelectedModelContextLimit();
  const {
    sessionId,
    messages,
    pendingPermissions,
    questions,
    isAgentRunning,
    sessionUsage,
    handleSend,
    handleStop,
    handleRewind,
    handlePermissionApprove,
    handlePermissionDeny,
    handleQuestionReply,
    handleQuestionReject,
    handleOpenFile,
    handleOpenUrl,
  } = useOcChatAdapter();

  const { contentRef } = useLayoutStabilization({
    isTransitioning,
    messageCount: messages.length,
    setLoadingConversation: useUIStore.getState().setLoadingConversation,
    setConversationTransitioning: useUIStore.getState().setConversationTransitioning,
  });
  const isRestoringSession = isSwitchingBackend && sessionId !== null && messages.length === 0;

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
      style={{ contain: 'layout style paint' }}
    >
      {isTransitioning || isRestoringSession ? (
        <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none pt-4">
          <ChatSkeleton />
        </div>
      ) : null}
      <ChatContent
        contentRef={contentRef}
        isTransitioning={isTransitioning || isRestoringSession}
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId ?? EMPTY_SESSION_ID}
        queuedMessage={null}
        pendingPermissions={pendingPermissions}
        questions={questions}
        inputMode="default"
        thinkingMode="off"
        effortLevel="medium"
        sessionUsage={sessionUsage}
        maxTokens={maxTokens}
        onSend={handleSend}
        onStop={handleStop}
        onRewind={handleRewind}
        onOpenFile={handleOpenFile}
        onOpenUrl={handleOpenUrl}
        onCancelQueue={noop}
        onFeedback={() => {
          window.dispatchEvent(new CustomEvent('focusChatInput'));
        }}
        onModeChange={noop}
        onThinkingModeChange={noop}
        onEffortLevelChange={noop}
        onModelChange={noop}
        onPermissionApprove={handlePermissionApprove}
        onPermissionDeny={handlePermissionDeny}
        onQuestionReply={handleQuestionReply}
        onQuestionReject={handleQuestionReject}
      />
    </div>
  );
};
