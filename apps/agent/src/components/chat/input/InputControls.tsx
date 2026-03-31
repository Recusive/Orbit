import { ArrowUp, Image, Square } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';

import { EffortLevelSelector } from './EffortLevelSelector';
import { MoreActionsMenu } from './MoreActionsMenu';
import { ThinkingModeButton } from './ThinkingModeButton';
import { INPUT_MODE_LABELS } from './constants';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextMoreButton,
  ContextOutputUsage,
  ContextTrigger,
} from './context';
import { ModelSelector } from './model-selector';

import type { InputControlsProps } from './types';
import type { FC } from 'react';

import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useContainerWidth } from '@/hooks/ui';
import { cn, INPUT_CONTROLS, TRANSITION_CLASSES } from '@/lib/utils';
import { getContextUsedTokens } from '@/stores/agent/tool-store';

export const InputControls: FC<InputControlsProps> = memo(function InputControls({
  inputMode,
  model,
  thinkingMode,
  effortLevel,
  isAgentRunning,
  isInputEmpty,
  usage,
  maxTokens,
  imageInputRef,
  thinkingHoverOpen,
  setThinkingHoverOpen,
  onModelChange,
  onEffortChange,
  cycleInputMode,
  cycleThinkingMode,
  cycleEffortLevel,
  handleImageClick,
  handleImageSelect,
  handleSend,
  handleStop,
  getThinkingInfo,
  getActiveDots,
  getEffortInfo,
}) {
  const isAdaptiveModel = model === 'claude-opus-4-6' || model === 'claude-sonnet-4-6';
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const showEffortControl = isAdaptiveModel;
  const showThinkingControl = !isAdaptiveModel;
  const showCompactMenu = showThinkingControl;
  const shouldShowContext = maxTokens > 0;
  const imageTooltip = 'Attach image';

  // Width is 0 before first measurement; avoid entering compact mode prematurely
  const hasMeasured = width > 0;
  const isCompact = hasMeasured && width < INPUT_CONTROLS.collapseBreakpoint;

  // Reset hover states when switching to compact mode
  // Prevents stuck hover card if it was open during resize
  useEffect(() => {
    if (isCompact) {
      setThinkingHoverOpen(false);
    }
  }, [isCompact, setThinkingHoverOpen]);

  return (
    <div
      ref={containerRef}
      className="input-controls-container flex w-full items-center justify-between gap-1 px-1 pb-1"
    >
      {/* Left Controls - Model / Effort / Mode */}
      <div className="flex items-center gap-0.5">
        {/* Model Picker */}
        <ModelSelector onModelChange={onModelChange} />
        {/* Effort Level Selector — only for adaptive models */}
        {showEffortControl ? (
          <>
            <div aria-hidden="true" className="auto-hide-separator h-4 w-px bg-border/60" />
            <EffortLevelSelector effortLevel={effortLevel} onEffortChange={onEffortChange} />
          </>
        ) : null}
        <div aria-hidden="true" className="auto-hide-separator h-4 w-px bg-border/60" />
        {/* Mode Picker */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={cycleInputMode}
              aria-label={`Input mode: ${INPUT_MODE_LABELS[inputMode]}. Click to change.`}
              className={cn(
                `h-7 px-2.5 flex items-center gap-1.5 rounded-full ${TRANSITION_CLASSES.button}`,
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                inputMode === 'default' &&
                  'bg-transparent text-muted-foreground hover:bg-lg-control-hover hover:text-foreground',
                inputMode === 'plan' && 'bg-mode-plan/10 text-mode-plan hover:bg-mode-plan/20',
                inputMode === 'accept' &&
                  'bg-mode-accept/10 text-mode-accept hover:bg-mode-accept/20'
              )}
            >
              <span className="text-md font-medium">{INPUT_MODE_LABELS[inputMode]}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-1.5">
            <span className="leading-none">Input mode</span>
            <Kbd className="h-[18px] !text-[11px] px-1.5 rounded-[5px] border-transparent bg-white/5 text-inherit">
              Shift + Tab
            </Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right Controls - Action Buttons */}
      <div className="flex items-center gap-0.5">
        {isCompact ? (
          // Compact mode: Thinking/Effort collapsed into dropdown; Image stays visible
          // Order: Menu → Image → Context → Send
          <>
            {/* More Actions Dropdown - contains Thinking/Effort */}
            {showCompactMenu ? (
              <MoreActionsMenu
                model={model}
                cycleThinkingMode={cycleThinkingMode}
                thinkingMode={thinkingMode}
                getThinkingInfo={getThinkingInfo}
                cycleEffortLevel={cycleEffortLevel}
                effortLevel={effortLevel}
                getEffortInfo={getEffortInfo}
              />
            ) : null}

            {/* Image Button - stays visible in compact mode */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    onClick={handleImageClick}
                    aria-label="Attach image"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[9px]',
                      'bg-transparent text-muted-foreground/70',
                      TRANSITION_CLASSES.button,
                      'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
                      'active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
                    )}
                  >
                    <Image className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{imageTooltip}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          // Expanded mode: all buttons inline
          <>
            {/* Thinking Mode Button — only for non-adaptive models */}
            {showThinkingControl ? (
              <ThinkingModeButton
                thinkingMode={thinkingMode}
                thinkingHoverOpen={thinkingHoverOpen}
                setThinkingHoverOpen={setThinkingHoverOpen}
                cycleThinkingMode={cycleThinkingMode}
                getThinkingInfo={getThinkingInfo}
                getActiveDots={getActiveDots}
              />
            ) : null}

            {/* Image Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    onClick={handleImageClick}
                    aria-label="Attach image"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[9px]',
                      'bg-transparent text-muted-foreground/70',
                      TRANSITION_CLASSES.button,
                      'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
                      'active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
                    )}
                  >
                    <Image className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{imageTooltip}</TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Hidden file input for images - MUST stay outside conditional render */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* Context Usage */}
        {shouldShowContext ? (
          <Context
            maxTokens={maxTokens}
            usedTokens={getContextUsedTokens(usage)}
            usage={{
              promptTokens: usage.inputTokens,
              cacheReadTokens: usage.cacheReadInputTokens ?? 0,
              cacheCreationTokens: usage.cacheCreationInputTokens ?? 0,
              completionTokens: usage.outputTokens,
              totalTokens: getContextUsedTokens(usage) + usage.outputTokens,
            }}
          >
            <ContextTrigger />
            <ContextContent>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextCacheUsage />
                <ContextOutputUsage />
              </ContextContentBody>
              <ContextContentFooter className="bg-transparent">
                <ContextMoreButton />
              </ContextContentFooter>
            </ContextContent>
          </Context>
        ) : null}

        {/* Send/Stop Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-demo-send
              onClick={isAgentRunning && isInputEmpty ? handleStop : handleSend}
              disabled={!isAgentRunning && isInputEmpty}
              aria-label={
                isAgentRunning && isInputEmpty
                  ? 'Stop agent'
                  : isAgentRunning
                    ? 'Queue message'
                    : 'Send message'
              }
              className={cn(
                'ml-1.5 h-7 w-7 flex items-center justify-center rounded-full',
                'transition-[background-color,color,transform,box-shadow] duration-200 ease-out',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                isAgentRunning && isInputEmpty
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30'
                  : isInputEmpty
                    ? 'bg-lg-control text-muted-foreground/50 cursor-not-allowed'
                    : 'bg-foreground text-background hover:bg-foreground/90 hover:scale-105 active:scale-95'
              )}
            >
              {isAgentRunning && isInputEmpty ? (
                <Square className="h-2.5 w-2.5 fill-current" strokeWidth={0} aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isAgentRunning && isInputEmpty
              ? 'Stop (Esc)'
              : isAgentRunning
                ? 'Queue message'
                : 'Send message'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});
