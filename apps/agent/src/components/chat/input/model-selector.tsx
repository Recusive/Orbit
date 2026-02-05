/**
 * ModelSelector - AI model dropdown selector
 *
 * Uses a React portal to render the popover into document.body, escaping
 * overflow:hidden / CSS containment on ancestor containers (ChatArea).
 *
 * NOTE: Dropdown width comes from @/lib/utils/constants.
 * To change dropdown dimensions, update CHAT_WIDTH.dropdown in constants.ts.
 */
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SiClaude, SiOpenai } from 'react-icons/si';

import type { Model } from '@/types/protocol';
import type { FC } from 'react';

import { CHAT_WIDTH, cn, POPOVER_ANIMATION, TRANSITION_CLASSES } from '@/lib/utils';
import { useModel, useToolStore } from '@/stores/agent/tool-store';

/** Gap between trigger and popover (matches the old mb-2 = 8px) */
const POPOVER_GAP = 8;

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
  /** When true, the option is shown but not selectable (coming soon placeholder) */
  disabled?: boolean;
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
      {
        id: 'gpt5-nano',
        name: 'GPT-5 Nano',
        icon: OpenAIIcon,
        badge: 'Coming soon',
        disabled: true,
      },
      {
        id: 'gpt5-mini',
        name: 'GPT-5 Mini',
        icon: OpenAIIcon,
        badge: 'Coming soon',
        disabled: true,
      },
      { id: 'gpt5', name: 'GPT-5', icon: OpenAIIcon, badge: 'Coming soon', disabled: true },
    ],
  },
];

interface PopoverPosition {
  /** CSS `top` when opening below trigger, undefined when opening above */
  top?: number;
  /** CSS `bottom` when opening above trigger, undefined when opening below */
  bottom?: number;
  left: number;
  /** Which side the popover opens on — drives transform-origin and animation direction */
  side: 'top' | 'bottom';
}

interface ModelSelectorProps {
  onModelChange?: (model: Model) => void;
}

export const ModelSelector: FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ bottom: 0, left: 0, side: 'top' });
  const selectedModel = useModel();
  const setModel = useToolStore((s) => s.setModel);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Calculate popover position from trigger's viewport rect.
  // Uses the actual popover height (when available) to decide whether to open
  // above or below the trigger. Falls back to an estimate on first render,
  // then corrects after the portal mounts via a second layout effect.
  // (Code review: Opus cycle 1, issues #2 & #3)
  const updatePosition = useCallback((): void => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Use actual popover height if already rendered, otherwise estimate
    const popoverHeight = popoverRef.current?.offsetHeight ?? 300;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove >= popoverHeight || spaceAbove >= spaceBelow) {
      // Default: open above (bottom-anchored)
      setPosition({
        bottom: window.innerHeight - rect.top + POPOVER_GAP,
        left: rect.left,
        side: 'top',
      });
    } else {
      // Flip: open below (top-anchored)
      setPosition({
        top: rect.bottom + POPOVER_GAP,
        left: rect.left,
        side: 'bottom',
      });
    }
  }, []);

  // Initial positioning (before paint, uses estimate since portal isn't mounted yet)
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  // Post-mount correction: once the portal is in the DOM, re-measure with the
  // real popover height and flip if the estimate was wrong.
  useEffect(() => {
    if (!isOpen || isAnimatingOut) return;
    // RAF ensures the portal DOM is mounted and popoverRef.current has its real height
    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, isAnimatingOut, updatePosition]);

  // Reposition popover on window resize/scroll while open
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Auto-focus popover container when opened for keyboard accessibility.
  // This ensures screen readers announce the popover and Tab starts cycling
  // within the focus trap. (Code review: Opus cycle 1, issue #3)
  useEffect(() => {
    if (!isOpen || isAnimatingOut) return;
    // Defer to next frame so the portal DOM is mounted
    const rafId = requestAnimationFrame(() => {
      popoverRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, isAnimatingOut]);

  // Handle closing with exit animation
  const handleClose = useCallback((): void => {
    if (!isOpen || isAnimatingOut) return;
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsAnimatingOut(false);
    }, POPOVER_ANIMATION.exitDurationMs);
  }, [isOpen, isAnimatingOut]);

  // Close popover when clicking outside or pressing Escape
  // Escape key is standard UX for dismissing popovers (code review: Opus cycle 1, issue #3)
  useEffect(() => {
    if (!isOpen) return;

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

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        // Return focus to trigger button after closing
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const selectedModelData = MODEL_GROUPS.flatMap((g) => g.models).find(
    (m) => m.id === selectedModel
  );

  const handleSelectModel = (model: ModelOption): void => {
    // Disabled models (coming soon) don't close the menu or change selection
    if (model.disabled === true) return;
    // Only allow valid Model values
    if (model.id === 'haiku' || model.id === 'sonnet' || model.id === 'opus') {
      setModel(model.id);
      onModelChange?.(model.id);
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

  // Focus trap: cycle Tab within the popover when open.
  // Without this, Tab escapes the portal to document.body elements.
  // (Code review: Opus cycle 1, issue #3)
  const handlePopoverKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;

    const popover = popoverRef.current;
    if (!popover) return;

    const focusable = popover.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap from first → last
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      // Tab: wrap from last → first
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }, []);

  // Popover content — rendered via portal into document.body
  const popoverContent = isOpen ? (
    <div
      ref={popoverRef}
      role="listbox"
      aria-label="Select model"
      tabIndex={-1}
      onKeyDown={handlePopoverKeyDown}
      className={cn(
        'fixed bg-card/50 backdrop-blur-md backdrop-saturate-150 border-[3px] border-border/40 rounded-xl shadow-lg overflow-hidden z-50 outline-none',
        position.side === 'top' ? 'origin-bottom-left' : 'origin-top-left',
        // Enter: rich 3-property animation (scale + fade + slide), ease-out
        !isAnimatingOut &&
          cn(
            'animate-in fade-in-0 zoom-in-[0.97]',
            position.side === 'top' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'
          ),
        // Exit: fade-only for clean disappearance (no zoom/slide = no "deflating ghost")
        isAnimatingOut && 'animate-out fade-out-0'
      )}
      style={{
        width: CHAT_WIDTH.dropdown,
        ...(position.bottom !== undefined ? { bottom: position.bottom } : {}),
        ...(position.top !== undefined ? { top: position.top } : {}),
        left: position.left,
        // Enter uses ease-out (fast arrival, gentle settle)
        // Exit uses ease-in (gentle start, fast departure)
        animationTimingFunction: isAnimatingOut
          ? POPOVER_ANIMATION.exitEasing
          : POPOVER_ANIMATION.enterEasing,
        animationDuration: isAnimatingOut
          ? POPOVER_ANIMATION.exitDuration
          : POPOVER_ANIMATION.enterDuration,
      }}
    >
      <div className="p-1.5">
        {MODEL_GROUPS.map((group) => (
          <div key={group.label} className="mb-1 last:mb-0">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              {group.label}
            </div>
            {group.models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  handleSelectModel(model);
                }}
                disabled={model.disabled === true}
                title={model.disabled === true ? 'Coming soon' : undefined}
                className={cn(
                  `w-full flex items-center justify-between px-2 py-1.5 text-xs ${TRANSITION_CLASSES.item} mt-0.5 first:mt-0 group`,
                  model.disabled === true
                    ? 'opacity-40 cursor-not-allowed'
                    : selectedModel === model.id
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
  ) : null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={cn(
          'h-7 px-2.5 flex items-center gap-1.5 rounded-lg',
          'bg-transparent text-muted-foreground',
          TRANSITION_CLASSES.button,
          'hover:bg-muted/50 hover:text-foreground',
          'active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
          isOpen && 'bg-muted/50 text-foreground'
        )}
      >
        {selectedModelData ? <selectedModelData.icon /> : null}
        <span className="text-sm font-medium">{selectedModelData?.name ?? 'Select Model'}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/60 transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Popover — portaled to document.body to escape overflow:hidden ancestors */}
      {popoverContent !== null ? createPortal(popoverContent, document.body) : null}
    </div>
  );
};
