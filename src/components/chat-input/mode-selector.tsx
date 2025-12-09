import { ChevronDown, Zap, Brain } from 'lucide-react';
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export type Mode = 'planning' | 'fast';

export interface ModeSelectorProps {
  value: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

const MODE_CONFIG = {
  planning: {
    label: 'Planning',
    icon: Brain,
    description: 'Thoughtful, step-by-step approach',
  },
  fast: {
    label: 'Fast',
    icon: Zap,
    description: 'Quick responses',
  },
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const selectedMode = MODE_CONFIG[value];
  const Icon = selectedMode.icon;

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
        <Icon className="h-4 w-4 text-gray-700" />
        <span className="text-sm font-medium text-gray-700">
          {selectedMode.label}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {Object.entries(MODE_CONFIG).map(([key, config]) => {
          const ModeIcon = config.icon;
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => { onChange(key as Mode); }}
              className={`
                flex items-start gap-3 cursor-pointer p-3
                ${value === key ? 'bg-blue-50' : ''}
              `}
            >
              <ModeIcon className="h-4 w-4 mt-0.5 text-gray-700" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-xs text-gray-500">{config.description}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
