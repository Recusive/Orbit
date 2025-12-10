import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { CONTENT_WIDTH } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Model icons
const AnthropicIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className={className}>
    <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
  </svg>
);

const OpenAIIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className={className}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
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
      { id: 'haiku', name: 'Haiku 4.5', icon: AnthropicIcon },
      { id: 'sonnet', name: 'Sonnet 4.5', icon: AnthropicIcon },
      { id: 'opus', name: 'Opus 4.5', icon: AnthropicIcon },
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
                      'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors',
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
