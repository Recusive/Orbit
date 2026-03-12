import { CheckCircle2, Circle } from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContentGlass, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useOcProviderStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

interface OcProviderDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function showProviders(
  open: (section?: 'providers') => void,
  onOpenChange: (open: boolean) => void
): void {
  onOpenChange(false);
  queueMicrotask(() => {
    open('providers');
  });
}

export const OcProviderDialog: FC<OcProviderDialogProps> = ({ open, onOpenChange }) => {
  const providers = useOcProviderStore((state) => state.providers);
  const connected = useOcProviderStore((state) => state.connectedProviders);
  const selectedProviderId = useOcProviderStore((state) => state.selectedProviderId);
  const setSelectedProviderId = useOcProviderStore((state) => state.setSelectedProviderId);
  const isLoading = useOcProviderStore((state) => state.isLoading);
  const openSettings = useUIStore((state) => state.openSettings);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentGlass className="w-[420px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <div className="border-b border-foreground/10 px-5 py-4">
          <DialogTitle className="text-base">Providers</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Choose a connected provider or open provider settings to add another one.
          </DialogDescription>
        </div>

        <div className="max-h-[380px] overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              Loading provider metadata...
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              No providers available yet.
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => {
                const isConnected = connected.includes(provider.id);
                const isSelected = provider.id === selectedProviderId;

                return (
                  <div
                    key={provider.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-xl border px-3 py-3',
                      isSelected
                        ? 'border-foreground/15 bg-foreground/5'
                        : 'border-border/60 bg-card/50'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-sm font-medium text-foreground">
                          {provider.name}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {Object.keys(provider.models).length} models ·{' '}
                        {isConnected ? 'Connected' : 'Not connected'}
                      </div>
                    </div>

                    {isConnected ? (
                      <Button
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        disabled={isSelected}
                        onClick={() => {
                          setSelectedProviderId(provider.id);
                          onOpenChange(false);
                        }}
                      >
                        {isSelected ? 'Selected' : 'Use provider'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          showProviders(openSettings, onOpenChange);
                        }}
                      >
                        Open settings
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-foreground/10 px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              showProviders(openSettings, onOpenChange);
            }}
          >
            Manage providers
          </Button>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
