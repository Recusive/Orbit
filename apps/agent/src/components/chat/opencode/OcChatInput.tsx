import { createLogger } from '@orbit/common/lib';
import { useState } from 'react';
import { toast } from 'sonner';

import { OcModelSelector } from './OcModelSelector';

import type { OcSendMessageOptions } from '@/services/opencode/oc-session-service';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useOcProviderStore } from '@/stores/opencode';

interface OcChatInputProps {
  readonly isBusy: boolean;
  readonly onSend: (text: string, options?: OcSendMessageOptions) => Promise<void>;
  readonly onStop: () => Promise<void>;
}

const logger = createLogger('OcChatInput');
const AGENT_OPTIONS = ['build', 'plan', 'explore'] as const;

export const OcChatInput: FC<OcChatInputProps> = ({ isBusy, onSend, onStop }) => {
  const providers = useOcProviderStore((state) => state.providers);
  const connectedProviders = useOcProviderStore((state) => state.connectedProviders);
  const selectedProviderId = useOcProviderStore((state) => state.selectedProviderId);
  const selectedModelId = useOcProviderStore((state) => state.selectedModelId);
  const selectedAgent = useOcProviderStore((state) => state.selectedAgent);
  const setSelectedProviderId = useOcProviderStore((state) => state.setSelectedProviderId);
  const setSelectedModelId = useOcProviderStore((state) => state.setSelectedModelId);
  const setSelectedAgent = useOcProviderStore((state) => state.setSelectedAgent);
  const [text, setText] = useState('');

  const send = (): void => {
    const next = text.trim();
    if (next.length === 0) {
      return;
    }

    const options: OcSendMessageOptions = {
      agent: selectedAgent,
      ...(selectedProviderId ? { providerId: selectedProviderId } : {}),
      ...(selectedModelId ? { modelId: selectedModelId } : {}),
    };

    void onSend(next, options)
      .then(() => {
        setText('');
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null
              ? JSON.stringify(error)
              : String(error);
        logger.error('Failed to send message', error);
        toast.error(`Failed to send: ${message}`);
      });
  };

  return (
    <div className="border-t border-border/60 bg-chat-area px-4 py-3">
      <div className="mx-auto max-w-[820px] space-y-3">
        <OcModelSelector
          providers={providers}
          connectedProviders={connectedProviders}
          selectedProviderId={selectedProviderId ?? ''}
          selectedModelId={selectedModelId ?? ''}
          onProviderChange={setSelectedProviderId}
          onModelChange={(modelId) => {
            setSelectedModelId(modelId);
          }}
        />

        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
          <Select
            value={selectedAgent}
            onValueChange={(value) => {
              setSelectedAgent(value as typeof selectedAgent);
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_OPTIONS.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask OpenCode to inspect, plan, or make changes"
            className="min-h-[88px]"
          />
        </div>

        <div className="flex justify-end gap-2">
          {isBusy ? (
            <Button
              variant="outline"
              onClick={() => {
                void onStop();
              }}
            >
              Stop
            </Button>
          ) : null}
          <Button onClick={send} disabled={text.trim().length === 0}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};
