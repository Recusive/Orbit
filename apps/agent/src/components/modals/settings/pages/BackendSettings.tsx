import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SectionDivider, SectionHeader } from '../components';

import type { FC } from 'react';

import { opencodeStart, opencodeStatus, opencodeStop } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  useActiveBackend,
  useBackendStore,
  useIsSwitchingBackend,
  useOpencodeHealthy,
  useOpencodePort,
} from '@/stores/backend';

interface BackendOption {
  readonly id: 'claude' | 'opencode';
  readonly name: string;
  readonly description: string;
}

const BACKENDS: readonly BackendOption[] = [
  {
    id: 'claude',
    name: 'Claude Agent SDK',
    description: 'Agent-bridge sidecar with Claude-oriented session flow',
  },
  {
    id: 'opencode',
    name: 'OpenCode Engine',
    description: 'HTTP + SSE backend with provider-backed model routing',
  },
];

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

      {/* Backend cards */}
      <div className="space-y-2">
        {BACKENDS.map((backend) => {
          const isActive = activeBackend === backend.id;

          return (
            <button
              key={backend.id}
              type="button"
              disabled={switchingBackend || isActive}
              onClick={() => {
                setBackend(backend.id);
              }}
              className={cn(
                'group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-colors',
                isActive
                  ? 'bg-foreground/5 ring-1 ring-foreground/8'
                  : 'hover:bg-foreground/3 disabled:opacity-50'
              )}
            >
              {/* Radio dot */}
              <div
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isActive
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30 group-hover:border-muted-foreground/50'
                )}
              >
                {isActive ? (
                  <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                ) : null}
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">
                  {backend.name}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {backend.description}
                </span>
              </div>

              {/* Badge */}
              {isActive ? (
                <span className="shrink-0 inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-medium text-success">
                  Active
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <SectionDivider />

      <SectionHeader title="OpenCode Health">
        OpenCode runs as a managed sidecar process when the backend is active.
      </SectionHeader>

      {/* Status card */}
      <div className="rounded-xl bg-foreground/[0.03] ring-1 ring-foreground/5 px-4 py-3.5">
        <div className="flex items-center gap-3">
          {/* Animated status dot */}
          <div className="relative flex h-2.5 w-2.5 shrink-0">
            {opencodeHealthy ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/40" />
            ) : null}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                opencodeHealthy ? 'bg-success' : 'bg-muted-foreground/25'
              )}
            />
          </div>

          <div className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground">
              {opencodeHealthy ? 'Healthy' : (statusError ?? 'Stopped')}
            </span>
            {opencodeHealthy && opencodePort !== null ? (
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                Running on port {String(opencodePort)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => void opencodeStart()}
          className="rounded-full bg-control-fill px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-control-fill-hover active:scale-[0.97]"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => void opencodeStop()}
          className="rounded-full bg-control-fill px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={() => {
            void opencodeStop().finally(() => {
              void opencodeStart();
            });
          }}
          className="flex items-center gap-1.5 rounded-full bg-control-fill px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Restart
        </button>
      </div>
    </div>
  );
};

export default BackendSettings;
