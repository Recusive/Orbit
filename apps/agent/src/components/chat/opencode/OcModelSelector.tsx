import type { OcProviderInfo } from '@/stores/opencode';
import type { FC } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OcModelSelectorProps {
  readonly providers: OcProviderInfo[];
  readonly connectedProviders: string[];
  readonly selectedProviderId: string;
  readonly selectedModelId: string;
  readonly onProviderChange: (providerId: string) => void;
  readonly onModelChange: (modelId: string) => void;
}

export const OcModelSelector: FC<OcModelSelectorProps> = ({
  providers,
  connectedProviders,
  selectedProviderId,
  selectedModelId,
  onProviderChange,
  onModelChange,
}) => {
  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? providers[0];
  const models = selectedProvider ? Object.values(selectedProvider.models) : [];

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Select value={selectedProviderId} onValueChange={onProviderChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {provider.name}
              {connectedProviders.includes(provider.id) ? '' : ' (not connected)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedModelId} onValueChange={onModelChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
