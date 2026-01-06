import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SiClaude, SiOpenai } from 'react-icons/si';

import type { Model } from '@/types/protocol';
import type { FC } from 'react';

import { CHAT_WIDTH } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import { useModel, useToolStore } from '@/stores/agent/tool-store';

// Animation duration - keep synced with CSS
const ANIMATION_DURATION_MS = 150;
const ANIMATION_DURATION = `${String(ANIMATION_DURATION_MS)}ms`;

// Wrapper components to match the expected interface
const ClaudeIcon: FC<{ className?: string }> = ({ className }) => (
  <SiClaude
    className={cn(
      'w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity duration-150',
      className
    )}
  />
);

const OpenAIIcon: FC<{ className?: string }> = ({ className }) => (
  <SiOpenai
    className={cn(
      'w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity duration-150',
      className
    )}
  />
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

interface ModelSelectorProps {
  onModelChange?: (model: Model) => void;
}

export const ModelSelector: FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const selectedModel = useModel();
  const setModel = useToolStore((s) => s.setModel);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Handle closing with exit animation
  const handleClose = useCallback((): void => {
    if (!isOpen || isAnimatingOut) return;
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsAnimatingOut(false);
    }, ANIMATION_DURATION_MS);
  }, [isOpen, isAnimatingOut]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClose]);

  const selectedModelData = MODEL_GROUPS.flatMap((g) => g.models).find(
    (m) => m.id === selectedModel
  );

  const handleSelectModel = (modelId: string): void => {
    // Only allow valid Model values
    if (modelId === 'haiku' || modelId === 'sonnet' || modelId === 'opus') {
      setModel(modelId);
      onModelChange?.(modelId);
    }
    handleClose();
  };

  const handleToggle = (): void => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={cn(
          'h-7 px-2.5 flex items-center gap-1.5 rounded-lg',
          'bg-transparent text-muted-foreground',
          'transition-all duration-150',
          'hover:bg-muted/50 hover:text-foreground',
          'active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
          isOpen && 'bg-muted/50 text-foreground'
        )}
      >
        {selectedModelData ? <selectedModelData.icon /> : null}
        <span className="text-[11px] font-medium">{selectedModelData?.name ?? 'Select Model'}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/60 transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Popover */}
      {isOpen ? (
        <div
          ref={popoverRef}
          className={cn(
            'absolute bottom-full left-0 mb-2 bg-popover/98 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg overflow-hidden z-50',
            'origin-bottom-left',
            // Enter animation: scale from 97% + fade in, ease-out for responsiveness
            !isAnimatingOut && 'animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-1',
            // Exit animation: scale to 97% + fade out, ease-out for smooth deceleration
            isAnimatingOut && 'animate-out fade-out-0 zoom-out-[0.97] slide-out-to-bottom-1'
          )}
          style={{
            width: CHAT_WIDTH.dropdown,
            // Custom ease-out curve for more responsiveness (faster start, gentle end)
            animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
            animationDuration: ANIMATION_DURATION,
          }}
        >
          <div className="p-1.5">
            {MODEL_GROUPS.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.06em]">
                  {group.label}
                </div>
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      handleSelectModel(model.id);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1.5 text-xs transition-all duration-150 mt-0.5 first:mt-0 group',
                      selectedModel === model.id
                        ? 'bg-primary/10 text-foreground border-l-2 border-primary/60 pl-[6px] rounded-r-md'
                        : 'rounded-md hover:bg-muted/80 active:scale-[0.98]'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <model.icon className={selectedModel === model.id ? 'opacity-100' : ''} />
                      <span>{model.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {model.badge ? (
                        <span className="text-[9px] font-medium text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded-full">
                          {model.badge}
                        </span>
                      ) : null}
                      {selectedModel === model.id ? (
                        <Check className="h-3.5 w-3.5 text-primary/80" />
                      ) : null}
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
