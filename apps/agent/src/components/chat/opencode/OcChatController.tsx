import { OcChatContent } from './OcChatContent';

import type { FC } from 'react';

import { useOcChat } from '@/hooks/chat/use-oc-chat';

interface OcChatControllerProps {
  readonly surface: 'agent' | 'editor';
}

export const OcChatController: FC<OcChatControllerProps> = ({ surface }) => {
  const {
    activeSessionTitle,
    messages,
    permissions,
    questions,
    isAgentBusy,
    handleSend,
    handleStop,
    handlePermissionReply,
    handleQuestionReply,
    handleQuestionReject,
  } = useOcChat();

  return (
    <div
      className={
        surface === 'agent'
          ? 'flex h-full min-h-0 flex-col bg-chat-area'
          : 'flex h-full min-h-0 flex-col'
      }
    >
      <OcChatContent
        title={activeSessionTitle}
        messages={messages}
        permissions={permissions}
        questions={questions}
        isBusy={isAgentBusy}
        onSend={handleSend}
        onStop={handleStop}
        onPermissionReply={handlePermissionReply}
        onQuestionReply={handleQuestionReply}
        onQuestionReject={handleQuestionReject}
      />
    </div>
  );
};
