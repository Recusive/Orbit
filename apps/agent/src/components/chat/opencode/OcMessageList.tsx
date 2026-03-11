import { useEffect, useRef } from 'react';

import { OcMessageItem } from './OcMessageItem';

import type { OcPart } from '@/types/opencode';
import type { FC } from 'react';

interface OcMessageListProps {
  readonly messages: {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly parts: OcPart[];
  }[];
}

export const OcMessageList: FC<OcMessageListProps> = ({ messages }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-[820px] space-y-6">
        {messages.map((message) => (
          <OcMessageItem key={message.id} role={message.role} parts={message.parts} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
