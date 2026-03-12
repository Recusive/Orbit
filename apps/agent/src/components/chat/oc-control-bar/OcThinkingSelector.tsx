import { ChevronDown } from 'lucide-react';

import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';
import { useOcProviderStore } from '@/stores/opencode';

function format(value: string): string {
  if (value === 'xhigh') {
    return 'X-High';
  }

  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export const OcThinkingSelector: FC = () => {
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

  if (provider?.id === undefined || model?.id === undefined || variants.length === 0) {
    return null;
  }

  const value = selections[`${provider.id}/${model.id}`];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="OpenCode thinking selector"
          className={cn(
            'h-7 px-2.5 flex items-center gap-1.5 rounded-[9px]',
            'bg-transparent text-muted-foreground',
            TRANSITION_CLASSES.button,
            'hover:bg-lg-control-hover hover:text-foreground',
            'active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
          )}
        >
          <span className="max-w-[120px] truncate text-sm font-medium">
            {value ? format(value) : 'Default'}
          </span>
          <ChevronDown className="h-3 w-3 text-lg-text-secondary" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Thinking level
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={value ?? 'default'}
          onValueChange={(next) => {
            setVariant(provider.id, model.id, next === 'default' ? undefined : next);
          }}
        >
          <DropdownMenuRadioItem value="default">Default</DropdownMenuRadioItem>
          {variants.map((variant) => (
            <DropdownMenuRadioItem key={variant} value={variant}>
              {format(variant)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
