import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSmoothScroll } from '@/hooks/ui';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';
import { useOcProviderStore } from '@/stores/opencode';

function format(value: string): string {
  if (value === 'xhigh') {
    return 'X-High';
  }

  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export const OcThinkingSelector: FC = () => {
  const [open, setOpen] = useState(false);
  const smoothScrollRef = useSmoothScroll(0.08);

  const providers = useOcProviderStore((state) => state.providers);
  const providerId = useOcProviderStore((state) => state.selectedProviderId);
  const modelId = useOcProviderStore((state) => state.selectedModelId);
  const selections = useOcProviderStore((state) => state.variantSelections);
  const setVariant = useOcProviderStore((state) => state.setSelectedVariant);
  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const model = provider
    ? ((modelId ? provider.models[modelId] : undefined) ?? Object.values(provider.models)[0])
    : undefined;
  const variants = Object.keys(model?.variants ?? {});

  const providerId_ = provider?.id;
  const modelId_ = model?.id;
  const value =
    providerId_ !== undefined && modelId_ !== undefined
      ? selections[`${providerId_}/${modelId_}`]
      : undefined;

  const handleClose = useCallback((): void => {
    setOpen(false);
  }, []);

  const handleSelect = useCallback(
    (next: string): void => {
      if (providerId_ === undefined || modelId_ === undefined) return;
      setVariant(providerId_, modelId_, next === 'default' ? undefined : next);
      handleClose();
    },
    [providerId_, modelId_, setVariant, handleClose]
  );

  if (providerId_ === undefined || modelId_ === undefined || variants.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="OpenCode thinking selector"
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
          <span className="max-w-[120px] truncate text-sm font-medium">
            {value !== undefined ? format(value) : 'Default'}
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
        className="w-[130px] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <Command shouldFilter={false} disablePointerSelection className="bg-transparent">
          <CommandList
            ref={smoothScrollRef}
            className="max-h-52 overflow-y-auto overscroll-y-contain pb-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)]"
          >
            <CommandGroup heading="Thinking level" className="[&_[cmdk-group-heading]]:px-2.5">
              <CommandItem
                value="default"
                onSelect={() => {
                  handleSelect('default');
                }}
                className="gap-1.5 min-w-0 text-foreground py-1.5 px-2.5 rounded-[9px]"
              >
                <IconImagine size={12} className="shrink-0" />
                <span className="truncate text-[12px]">Default</span>
                {value === undefined || value === 'default' ? (
                  <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />
                ) : null}
              </CommandItem>
              {variants.map((variant) => (
                <CommandItem
                  key={variant}
                  value={variant}
                  onSelect={() => {
                    handleSelect(variant);
                  }}
                  className="gap-1.5 min-w-0 text-foreground py-1.5 px-2.5 rounded-[9px]"
                >
                  <IconImagine size={12} className="shrink-0" />
                  <span className="truncate text-[12px]">{format(variant)}</span>
                  {value === variant ? <Check className="h-3.5 w-3.5 shrink-0 ml-auto" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
