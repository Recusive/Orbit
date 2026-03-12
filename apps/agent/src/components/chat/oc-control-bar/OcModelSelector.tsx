import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { OcProviderDialog } from './OcProviderDialog';

import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';
import { useOcProviderStore } from '@/stores/opencode';

export const OcModelSelector: FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const providers = useOcProviderStore((state) => state.providers);
  const providerId = useOcProviderStore((state) => state.selectedProviderId);
  const modelId = useOcProviderStore((state) => state.selectedModelId);
  const setModelId = useOcProviderStore((state) => state.setSelectedModelId);
  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? providers[0];
  const models = selectedProvider ? Object.values(selectedProvider.models) : [];
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="OpenCode model selector"
            className={cn(
              'h-7 px-2.5 flex items-center gap-1.5 rounded-[9px]',
              'bg-transparent text-muted-foreground',
              TRANSITION_CLASSES.button,
              'hover:bg-lg-control-hover hover:text-foreground',
              'active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
            )}
          >
            <span className="max-w-[180px] truncate text-sm font-medium">
              {selectedModel?.name ?? 'Select model'}
            </span>
            <ChevronDown className="h-3 w-3 text-lg-text-secondary" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[260px]">
          <DropdownMenuLabel className="pb-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Provider
          </DropdownMenuLabel>
          <div className="px-2 pb-2 pt-1 text-sm font-medium text-foreground">
            {selectedProvider?.name ?? 'No provider selected'}
          </div>

          <DropdownMenuSeparator />

          {models.length > 0 ? (
            <DropdownMenuRadioGroup
              {...(modelId ? { value: modelId } : {})}
              onValueChange={(value) => {
                setModelId(value);
              }}
            >
              {models.map((model) => (
                <DropdownMenuRadioItem key={model.id} value={model.id}>
                  {model.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              Connect a provider to choose a model.
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              setDialogOpen(true);
            }}
          >
            Connect a provider
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OcProviderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};
