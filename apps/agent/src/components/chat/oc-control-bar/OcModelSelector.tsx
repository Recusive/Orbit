import { IconPlusLarge } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPlusLarge';
import { Check, ChevronDown, Search, Settings2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { OcProviderDialog } from './OcProviderDialog';

import type { FC } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSmoothScroll } from '@/hooks/ui';
import { CHAT_WIDTH, cn, TRANSITION_CLASSES } from '@/lib/utils';
import { useOcProviderStore } from '@/stores/opencode';

export const OcModelSelector: FC = () => {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cmdkValue, setCmdkValue] = useState('');
  const [filterMode, setFilterMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const smoothScrollRef = useSmoothScroll(0.08);

  const providers = useOcProviderStore((state) => state.providers);
  const providerId = useOcProviderStore((state) => state.selectedProviderId);
  const modelId = useOcProviderStore((state) => state.selectedModelId);
  const setModelId = useOcProviderStore((state) => state.setSelectedModelId);
  const hiddenModels = useOcProviderStore((state) => state.hiddenModels);
  const toggleModelVisibility = useOcProviderStore((state) => state.toggleModelVisibility);
  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? providers[0];
  const models = useMemo(
    () => (selectedProvider ? Object.values(selectedProvider.models) : []),
    [selectedProvider]
  );
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];

  const hiddenSet = useMemo(
    () => new Set(providerId !== null ? (hiddenModels[providerId] ?? []) : []),
    [hiddenModels, providerId]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = useMemo(() => {
    return models.filter((model) => {
      if (filterMode) return true;
      if (hiddenSet.has(model.id)) return false;
      if (normalizedQuery.length === 0) return true;
      return model.name.toLowerCase().includes(normalizedQuery);
    });
  }, [models, normalizedQuery, hiddenSet, filterMode]);

  const handleClose = useCallback((): void => {
    setOpen(false);
    setQuery('');
    setFilterMode(false);
  }, []);

  const handleModelSelect = useCallback(
    (id: string): void => {
      setModelId(id);
      handleClose();
    },
    [setModelId, handleClose]
  );

  const handleConnectProvider = useCallback((): void => {
    handleClose();
    setDialogOpen(true);
  }, [handleClose]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="OpenCode model selector"
            className={cn(
              'h-7 px-2.5 flex items-center gap-1.5 rounded-full',
              'bg-transparent text-muted-foreground',
              TRANSITION_CLASSES.button,
              'hover:bg-lg-control-hover hover:text-foreground',
              'active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
              open && 'bg-lg-control text-foreground'
            )}
          >
            <span className="max-w-[180px] truncate text-md font-medium">
              {selectedModel?.name ?? 'Select model'}
            </span>
            <ChevronDown
              className={cn(
                'h-3 w-3 text-lg-text-secondary transition-transform duration-150',
                open && 'rotate-180'
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="p-0"
          style={{ width: CHAT_WIDTH.dropdown }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <Command
            shouldFilter={false}
            value={cmdkValue}
            onValueChange={setCmdkValue}
            disablePointerSelection
            className="bg-transparent"
          >
            {/* Search bar */}
            <div className="flex items-center px-1.5 pt-1.5 pb-0.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
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
                      handleClose();
                    }
                  }}
                  placeholder="Search models"
                  className="w-full h-7 rounded-[7px] bg-control-fill pl-7 pr-2.5 text-[12px] outline-none placeholder:text-muted-foreground/40 focus:bg-control-fill-hover"
                  aria-label="Search models"
                />
              </div>
            </div>

            {/* Scrollable model list with mask overlay */}
            <CommandList
              ref={smoothScrollRef}
              className="max-h-52 overflow-y-auto overscroll-y-contain pb-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)]"
            >
              {/* Custom heading with filter toggle */}
              <div className="flex items-center justify-between px-4 pt-2 pb-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  Models
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode((prev) => !prev);
                  }}
                  aria-label="Filter visible models"
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    filterMode
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {visibleModels.length === 0 ? (
                <div className="px-2.5 py-4 text-center text-[12px] text-muted-foreground/50">
                  No models found.
                </div>
              ) : (
                <CommandGroup>
                  {visibleModels.map((model) => {
                    const isHidden = hiddenSet.has(model.id);

                    return filterMode ? (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => {
                          if (providerId !== null) {
                            toggleModelVisibility(providerId, model.id);
                          }
                        }}
                        className="gap-1.5 min-w-0 text-foreground py-1.5 px-2.5 rounded-[9px]"
                      >
                        <div
                          className={cn(
                            'h-4 w-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors',
                            isHidden
                              ? 'border-muted-foreground/30 bg-transparent'
                              : 'border-primary bg-primary'
                          )}
                        >
                          {!isHidden ? (
                            <Check
                              className="h-2.5 w-2.5 text-primary-foreground"
                              strokeWidth={3}
                            />
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            'truncate text-[12px]',
                            isHidden && 'text-muted-foreground'
                          )}
                        >
                          {model.name}
                        </span>
                      </CommandItem>
                    ) : (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => {
                          handleModelSelect(model.id);
                        }}
                        className="gap-1.5 min-w-0 text-foreground py-1.5 px-2.5 rounded-[9px]"
                      >
                        <span className="truncate text-[12px]">{model.name}</span>
                        {modelId === model.id ? (
                          <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>

            {/* Sticky footer — outside scroll container */}
            <div className="mx-2.5 h-px bg-foreground/5" />
            <div
              className="p-1"
              onMouseEnter={() => {
                setCmdkValue('');
              }}
            >
              <button
                type="button"
                onClick={handleConnectProvider}
                className="group relative flex w-full cursor-default select-none items-center gap-1.5 min-w-0 rounded-[9px] px-2.5 py-1.5 text-foreground hover:bg-foreground/8"
              >
                <IconPlusLarge className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[12px]">Connect a provider</span>
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <OcProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};
