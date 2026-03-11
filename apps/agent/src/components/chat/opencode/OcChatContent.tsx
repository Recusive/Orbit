import { OcChatInput } from './OcChatInput';
import { OcMessageList } from './OcMessageList';
import { OcPermissionCard } from './OcPermissionCard';
import { OcQuestionCard } from './OcQuestionCard';
import { OcStatusIndicator } from './OcStatusIndicator';

import type { OcSendMessageOptions } from '@/services/opencode/oc-session-service';
import type {
  OcPart,
  OcPermissionAsked,
  OcQuestionAnswer,
  OcQuestionRequest,
} from '@/types/opencode';
import type { FC } from 'react';

interface OcChatContentProps {
  readonly title: string | null;
  readonly messages: {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly parts: OcPart[];
  }[];
  readonly isBusy: boolean;
  readonly permissions: OcPermissionAsked[];
  readonly questions: OcQuestionRequest[];
  readonly onSend: (text: string, options?: OcSendMessageOptions) => Promise<void>;
  readonly onStop: () => Promise<void>;
  readonly onPermissionReply: (
    requestId: string,
    reply: 'once' | 'always' | 'reject'
  ) => Promise<void>;
  readonly onQuestionReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  readonly onQuestionReject: (requestId: string) => Promise<void>;
}

export const OcChatContent: FC<OcChatContentProps> = ({
  title,
  messages,
  isBusy,
  permissions,
  questions,
  onSend,
  onStop,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
}) => {
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">{title ?? 'OpenCode'}</div>
          <div className="text-xs text-muted-foreground">
            Provider-backed sessions and tool streaming
          </div>
        </div>
        <OcStatusIndicator />
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-[820px] rounded-2xl border border-dashed border-border/60 bg-card/40 px-6 py-10 text-center">
            <div className="text-base font-medium text-foreground">
              Start a new OpenCode session
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Pick a provider model and send the first prompt to create the session.
            </div>
          </div>
        </div>
      ) : (
        <OcMessageList messages={messages} />
      )}

      {permissions.length > 0 || questions.length > 0 ? (
        <div className="space-y-3 px-4 pb-3">
          {permissions.map((permission) => (
            <OcPermissionCard
              key={permission.id}
              permission={permission}
              onReply={onPermissionReply}
            />
          ))}
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

      <OcChatInput isBusy={isBusy} onSend={onSend} onStop={onStop} />
    </div>
  );
};
