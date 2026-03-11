import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SectionDivider, SectionHeader, SettingItem } from '../components';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { opencodeStart, opencodeStatus, opencodeStop } from '@/lib/api';
import {
  useActiveBackend,
  useBackendStore,
  useIsSwitchingBackend,
  useOpencodeHealthy,
  useOpencodePort,
} from '@/stores/backend';

export const BackendSettings: FC = () => {
  const activeBackend = useActiveBackend();
  const switchingBackend = useIsSwitchingBackend();
  const opencodeHealthy = useOpencodeHealthy();
  const opencodePort = useOpencodePort();
  const setBackend = useBackendStore((state) => state.setBackend);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    void opencodeStatus()
      .then((status) => {
        setStatusError(status.error);
      })
      .catch(() => {
        setStatusError('Unable to read OpenCode status');
      });
  }, [activeBackend]);

  return (
    <div>
      <SectionHeader title="Backend">
        Switching backends swaps the active session model, storage, and tool semantics.
      </SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Claude Agent SDK"
          description="Use the existing agent-bridge sidecar and Claude-oriented session flow"
        >
          <Button
            variant={activeBackend === 'claude' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setBackend('claude');
            }}
            disabled={switchingBackend}
          >
            {activeBackend === 'claude' ? 'Active' : 'Use Claude'}
          </Button>
        </SettingItem>

        <SettingItem
          label="OpenCode Engine"
          description="Use the OpenCode HTTP + SSE backend with provider-backed model routing"
        >
          <Button
            variant={activeBackend === 'opencode' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setBackend('opencode');
            }}
            disabled={switchingBackend}
          >
            {activeBackend === 'opencode' ? 'Active' : 'Use OpenCode'}
          </Button>
        </SettingItem>
      </div>

      <SectionDivider />

      <SectionHeader title="OpenCode Health">
        OpenCode runs as a managed sidecar process when the backend is active.
      </SectionHeader>

      <div className="space-y-0 divide-y divide-border/40">
        <SettingItem
          label="Status"
          description={
            statusError ??
            (opencodeHealthy && opencodePort !== null
              ? `Healthy on port ${String(opencodePort)}`
              : 'Stopped')
          }
        >
          <span
            className={opencodeHealthy ? 'text-success text-sm' : 'text-muted-foreground text-sm'}
          >
            {opencodeHealthy ? 'Healthy' : 'Stopped'}
          </span>
        </SettingItem>

        <SettingItem
          label="Controls"
          description="Start, stop, or restart the OpenCode process without changing the selected backend"
        >
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void opencodeStart()}>
              Start
            </Button>
            <Button size="sm" variant="outline" onClick={() => void opencodeStop()}>
              Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void opencodeStop().finally(() => {
                  void opencodeStart();
                });
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Restart
            </Button>
          </div>
        </SettingItem>
      </div>
    </div>
  );
};

export default BackendSettings;
