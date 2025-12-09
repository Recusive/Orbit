import { ChevronDown, Sparkles } from 'lucide-react';
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
}

export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    description: 'Most capable model',
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance',
  },
  {
    id: 'claude-haiku-4',
    name: 'Claude Haiku 4',
    description: 'Fastest responses',
  },
];

export interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  models?: ModelOption[];
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  models = CLAUDE_MODELS,
}) => {
  const selectedModel = models.find((m) => m.id === value) ?? models[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={`
          inline-flex items-center gap-2
          px-3 py-1.5 rounded-md
          border border-gray-300 bg-white
          hover:bg-gray-50 hover:border-gray-400
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <Sparkles className="h-4 w-4 text-gray-700" />
        <span className="text-sm font-medium text-gray-700">
          {selectedModel?.name ?? 'Select Model'}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => { onChange(model.id); }}
            className={`
              flex items-start gap-3 cursor-pointer p-3
              ${value === model.id ? 'bg-blue-50' : ''}
            `}
          >
            <Sparkles className="h-4 w-4 mt-0.5 text-gray-700" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{model.name}</span>
              <span className="text-xs text-gray-500">{model.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
