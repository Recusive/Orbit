import { Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { OcProviderInfo } from '@/stores/opencode/oc-provider-store';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSmoothScroll } from '@/hooks/ui';
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

function getScrollMask(canScrollUp: boolean, canScrollDown: boolean): string {
  if (canScrollUp && canScrollDown) {
    return 'linear-gradient(to bottom, transparent, black 6px, black calc(100% - 6px), transparent)';
  }
  if (canScrollUp) {
    return 'linear-gradient(to bottom, transparent, black 6px)';
  }
  if (canScrollDown) {
    return 'linear-gradient(to bottom, black calc(100% - 6px), transparent)';
  }
  return 'none';
}

export const OcProviderDialog: FC<OcProviderDialogProps> = ({ open, onOpenChange }) => {
  const providers = useOcProviderStore((state) => state.providers);
  const connected = useOcProviderStore((state) => state.connectedProviders);
  const selectedProviderId = useOcProviderStore((state) => state.selectedProviderId);
  const setSelectedProviderId = useOcProviderStore((state) => state.setSelectedProviderId);
  const isLoading = useOcProviderStore((state) => state.isLoading);
  const openSettings = useUIStore((state) => state.openSettings);
  const smoothScrollRef = useSmoothScroll(0.08);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { connectedGroup, availableGroup } = useMemo((): {
    connectedGroup: OcProviderInfo[];
    availableGroup: OcProviderInfo[];
  } => {
    const lowerQuery = query.toLowerCase();
    const filtered =
      query.length === 0
        ? providers
        : providers.filter((p) => p.name.toLowerCase().includes(lowerQuery));

    const connectedItems: OcProviderInfo[] = [];
    const availableItems: OcProviderInfo[] = [];
    for (const provider of filtered) {
      if (connected.includes(provider.id)) {
        connectedItems.push(provider);
      } else {
        availableItems.push(provider);
      }
    }

    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    connectedItems.sort((a, b) => collator.compare(a.name, b.name));
    availableItems.sort((a, b) => collator.compare(a.name, b.name));

    return { connectedGroup: connectedItems, availableGroup: availableItems };
  }, [providers, connected, query]);

  const updateScrollState = useCallback((): void => {
    const el = scrollElRef.current;
    if (el === null) return;
    setCanScrollUp(el.scrollTop > 1);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContentGlass className="w-[520px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <div className="relative flex flex-col gap-4 p-2">
          {/* Search + Close */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (query.length > 0) {
                    setQuery('');
                  } else {
                    onOpenChange(false);
                  }
                }
              }}
              placeholder="Search providers"
              className={cn(
                'w-full h-9 rounded-[9px] bg-control-fill pl-9 pr-9 text-sm',
                'placeholder:text-muted-foreground/40 outline-none',
                'transition-[background-color] duration-150',
                'focus:bg-control-fill-hover'
              )}
              aria-label="Search providers"
            />
            <DialogClose className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          <DialogTitle className="sr-only">Providers</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a connected provider or open settings to add another one.
          </DialogDescription>

          {/* Provider list */}
          <div
            ref={(node) => {
              scrollElRef.current = node;
              if (typeof smoothScrollRef === 'function') {
                smoothScrollRef(node);
              }
              if (node !== null) {
                queueMicrotask(updateScrollState);
              }
            }}
            onScroll={updateScrollState}
            className="h-[320px] overflow-y-auto overscroll-y-contain -mx-1 px-1"
            style={{
              WebkitMaskImage: getScrollMask(canScrollUp, canScrollDown),
              maskImage: getScrollMask(canScrollUp, canScrollDown),
            }}
          >
            {isLoading ? (
              <div className="rounded-[9px] px-3 py-3 liquid-glass-textarea text-sm text-muted-foreground">
                Loading provider metadata...
              </div>
            ) : providers.length === 0 ? (
              <div className="rounded-[9px] px-3 py-3 liquid-glass-textarea text-sm text-muted-foreground">
                No providers available yet.
              </div>
            ) : connectedGroup.length === 0 && availableGroup.length === 0 ? (
              <div className="rounded-[9px] px-3 py-3 liquid-glass-textarea text-sm text-muted-foreground">
                No providers found.
              </div>
            ) : (
              <div className="space-y-1">
                {connectedGroup.length > 0 && (
                  <>
                    <div className="px-3.5 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                      Connected
                    </div>
                    {connectedGroup.map((provider) => {
                      const isSelected = provider.id === selectedProviderId;
                      const modelCount = Object.keys(provider.models).length;

                      return (
                        <div
                          key={provider.id}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3.5 py-3',
                            isSelected
                              ? 'bg-foreground/5 ring-1 ring-foreground/8'
                              : 'hover:bg-foreground/3'
                          )}
                        >
                          <div className="h-2 w-2 shrink-0 rounded-full bg-success" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {provider.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {modelCount} {modelCount === 1 ? 'model' : 'models'}
                            </span>
                          </div>
                          {isSelected ? (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-medium text-success">
                              Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProviderId(provider.id);
                                onOpenChange(false);
                              }}
                              className="shrink-0 rounded-full bg-control-fill px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-control-fill-hover active:scale-[0.97]"
                            >
                              Use
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {availableGroup.length > 0 && (
                  <>
                    <div className="px-3.5 pt-2.5 pb-0.5 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                      Available
                    </div>
                    {availableGroup.map((provider) => {
                      const modelCount = Object.keys(provider.models).length;

                      return (
                        <div
                          key={provider.id}
                          className="flex items-center gap-3 rounded-xl px-3.5 py-3 hover:bg-foreground/3"
                        >
                          <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/25" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {provider.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {modelCount} {modelCount === 1 ? 'model' : 'models'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              showProviders(openSettings, onOpenChange);
                            }}
                            className="shrink-0 rounded-full bg-control-fill px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
                          >
                            Setup
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2 pt-1">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                showProviders(openSettings, onOpenChange);
              }}
            >
              Manage Providers
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
