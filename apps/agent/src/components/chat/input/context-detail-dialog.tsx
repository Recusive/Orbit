import { Coins, X } from 'lucide-react';
import { memo } from 'react';

import { formatPercentage, formatTokens, getContextProgressStyle } from './context-utils';

import type { ContextTokenUsage } from './context-utils';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useModel,
  useSessionMcpServers,
  useSessionMetadataState,
  useSessionModel,
  useSessionTools,
  useSessionUsage,
} from '@/stores/agent/tool-store';

interface ContextDetailDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly maxTokens: number;
  readonly usedTokens: number;
  readonly percentage: number;
  readonly usage?: ContextTokenUsage | undefined;
}

const SectionLabel: FC<{ readonly children: string }> = ({ children }) => (
  <div className="px-4 py-3 text-[12px] font-medium text-foreground/70">{children}</div>
);

const DetailRow: FC<{
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
  readonly meta?: string;
}> = ({ label, value, emphasis = false, meta }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
    <span className="text-muted-foreground/80">{label}</span>
    <div className="flex items-center gap-3">
      {meta ? <span className="text-xs tabular-nums text-muted-foreground/70">{meta}</span> : null}
      <span
        className={cn(
          'tabular-nums text-right',
          emphasis ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
        )}
      >
        {value}
      </span>
    </div>
  </div>
);

const MetadataBadge: FC<{ readonly state: 'live' | 'restored' }> = ({ state }) => (
  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
    {state === 'live' ? 'Live' : 'Restored'}
  </span>
);

function formatCost(cost: number): string {
  const maximumFractionDigits = cost > 0 && cost < 0.01 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(cost);
}

function formatMcpSummary(mcpServers: ReturnType<typeof useSessionMcpServers>): string {
  if (mcpServers === null) {
    return '—';
  }
  if (mcpServers.length === 0) {
    return '0 servers';
  }

  const connectedCount = mcpServers.filter(
    (server) => server.status.toLowerCase() === 'connected'
  ).length;
  if (connectedCount === mcpServers.length) {
    return `${String(mcpServers.length)} connected`;
  }

  return `${String(mcpServers.length)} servers`;
}

const ContextDetailDialogInner: FC<ContextDetailDialogProps> = ({
  open,
  onOpenChange,
  maxTokens,
  usedTokens,
  percentage,
  usage,
}) => {
  const selectedModel = useModel();
  const sessionUsage = useSessionUsage();
  const sessionModel = useSessionModel();
  const sessionTools = useSessionTools();
  const sessionMcpServers = useSessionMcpServers();
  const metadataState = useSessionMetadataState();

  const promptTokens = usage?.promptTokens ?? 0;
  const cacheReadTokens = usage?.cacheReadTokens ?? 0;
  const cacheCreationTokens = usage?.cacheCreationTokens ?? 0;
  const outputTokens = usage?.completionTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? usedTokens + outputTokens;
  const freeTokens = Math.max(0, maxTokens - usedTokens);
  const hasUsage = usedTokens > 0 || outputTokens > 0 || sessionUsage.totalCostUsd > 0;
  const displayModel = sessionModel ?? `${selectedModel} (default)`;
  const toolsSummary = sessionTools === null ? '—' : `${String(sessionTools.length)} available`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentGlass className="w-[560px] max-w-[92vw] gap-0 overflow-hidden solid-surface [&>.absolute]:hidden">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 flex items-center justify-center h-8 w-8 rounded-[8px] bg-primary/10">
                <Coins className="h-4 w-4 text-primary/70" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                    Context Window
                  </DialogTitle>
                  {metadataState ? <MetadataBadge state={metadataState} /> : null}
                </div>
                <DialogDescription className="mt-0.5 text-sm text-muted-foreground/70">
                  {displayModel} · {formatTokens(maxTokens)} context
                </DialogDescription>
              </div>
            </div>

            <DialogClose className="rounded-[8px] bg-foreground/6 p-1.5 text-muted-foreground transition-[background-color,color] duration-150 hover:bg-destructive-subtle hover:text-destructive-text active:bg-destructive-subtle-hover">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          <div className="mt-4 rounded-[12px] bg-lg-control p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-foreground/90">Used vs free</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatPercentage(percentage)}%
              </span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground/70 tabular-nums">
              {formatTokens(usedTokens)} / {formatTokens(maxTokens)} tokens
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-lg-control shadow-inner">
              <div
                className="h-full origin-left rounded-full transition-transform duration-300 ease-out"
                style={{
                  transform: `scaleX(${String(Math.max(0, Math.min(1, percentage / 100)))})`,
                  ...getContextProgressStyle(percentage),
                }}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto pb-2">
          <SectionLabel>Token Breakdown</SectionLabel>
          {hasUsage ? (
            <>
              <DetailRow label="Input" value={`${formatTokens(promptTokens)} tokens`} />
              <DetailRow label="Cache Read" value={`${formatTokens(cacheReadTokens)} tokens`} />
              <DetailRow
                label="Cache Creation"
                value={`${formatTokens(cacheCreationTokens)} tokens`}
              />
              <DetailRow label="Output" value={`${formatTokens(outputTokens)} tokens`} />
              <DetailRow
                label="Context Used"
                value={`${formatTokens(usedTokens)} tokens`}
                meta={`${formatPercentage(percentage)}%`}
                emphasis
              />
              <DetailRow
                label="Free"
                value={`${formatTokens(freeTokens)} tokens`}
                meta={`${formatPercentage(Math.max(0, 100 - percentage))}%`}
              />
              <DetailRow label="Total" value={`${formatTokens(totalTokens)} tokens`} />
            </>
          ) : (
            <div className="px-4 pb-4 text-sm text-muted-foreground/65">No usage data yet.</div>
          )}

          <div className="mx-4 mt-1 h-px bg-foreground/5" />

          <SectionLabel>Session Info</SectionLabel>
          <DetailRow label="Model" value={displayModel} />
          <DetailRow label="Tools" value={toolsSummary} />
          <DetailRow label="MCP Servers" value={formatMcpSummary(sessionMcpServers)} />
          <DetailRow label="Cost" value={formatCost(sessionUsage.totalCostUsd)} />

          {sessionTools !== null && sessionTools.length > 0 ? (
            <div className="px-4 pb-4">
              <div className="mb-2 text-[12px] font-medium text-foreground/70">Available Tools</div>
              <div className="max-h-40 overflow-y-auto rounded-[12px] bg-lg-control p-2">
                <div className="flex flex-wrap gap-2">
                  {sessionTools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium text-foreground/85"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {sessionMcpServers !== null && sessionMcpServers.length > 0 ? (
            <div className="px-4 pb-4">
              <div className="mb-2 text-[12px] font-medium text-foreground/70">MCP Servers</div>
              <div className="max-h-40 overflow-y-auto rounded-[12px] bg-lg-control">
                {sessionMcpServers.map((server) => (
                  <div
                    key={`${server.name}-${server.status}`}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm [&:not(:last-child)]:border-b [&:not(:last-child)]:border-foreground/5"
                  >
                    <span className="font-medium text-foreground/90">{server.name}</span>
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                      {server.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};

export const ContextDetailDialog = memo(ContextDetailDialogInner);
