import type { FC } from 'react';

import { BackendChatSurface } from '@/components/chat/BackendChatSurface';

export const ChatArea: FC = () => {
  return <BackendChatSurface surface="agent" />;
};
