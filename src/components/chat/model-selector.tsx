import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SiClaude, SiOpenai } from 'react-icons/si';

import type { FC } from 'react';

import { CONTENT_WIDTH } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Wrapper components to match the expected interface
const ClaudeIcon: FC<{ className?: string }> = ({ className }) => (
  <SiClaude className={cn('w-3 h-3', className)} />
);

const OpenAIIcon: FC<{ className?: string }> = ({ className }) => (
  <SiOpenai className={cn('w-3 h-3', className)} />
);

interface ModelOption {
  id: string;
  name: string;
  icon: FC<{ className?: string }>;
  badge?: string;
}

interface ModelGroup {
  label: string;
  models: ModelOption[];
}

const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Claude',
    models: [
      { id: 'haiku', name: 'Haiku 4.5', icon: ClaudeIcon },
      { id: 'sonnet', name: 'Sonnet 4.5', icon: ClaudeIcon },
      { id: 'opus', name: 'Opus 4.5', icon: ClaudeIcon },
    ],
  },
  {
    label: 'Codex',
    models: [
      { id: 'gpt5-nano', name: 'GPT-5 Nano', icon: OpenAIIcon, badge: 'New chat' },
      { id: 'gpt5-mini', name: 'GPT-5 Mini', icon: OpenAIIcon, badge: 'New chat' },
      { id: 'gpt5', name: 'GPT-5', icon: OpenAIIcon, badge: 'New chat' },
    ],
  },
];

export const ModelSelector: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedModelData = MODEL_GROUPS
    .flatMap((g) => g.models)
    .find((m) => m.id === selectedModel);

  const handleSelectModel = (modelId: string): void => {
    setSelectedModel(modelId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className={cn(
          'h-7 px-2 flex items-center gap-1.5 rounded transition-colors',
          isOpen
            ? 'bg-accent opacity-100'
            : 'hover:bg-accent opacity-70 hover:opacity-100'
        )}
      >
        {selectedModelData ? <selectedModelData.icon /> : null}
        <span className="text-xs">{selectedModelData?.name ?? 'Select Model'}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* Popover */}
      {isOpen ? (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
          style={{ width: CONTENT_WIDTH.dropdown }}
        >
          <div className="p-1">
            {MODEL_GROUPS.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      handleSelectModel(model.id);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors mt-0.5 first:mt-0',
                      selectedModel === model.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <model.icon />
                      <span>{model.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {model.badge ? (
                        <span className="text-[10px] text-muted-foreground bg-accent px-1 py-0.5 rounded">
                          {model.badge}
                        </span>
                      ) : null}
                      {selectedModel === model.id ? <Check className="h-4 w-4" /> : null}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
