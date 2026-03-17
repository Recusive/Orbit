import { IconHammer2 } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconHammer2';
import { IconMap } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconMap';
import { ArrowUp, Image, Square, Telescope } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';

import { OcModelSelector, OcThinkingSelector } from '../oc-control-bar';

import { EffortLevelButton } from './EffortLevelButton';
import { MoreActionsMenu } from './MoreActionsMenu';
import { ThinkingModeButton } from './ThinkingModeButton';
import { INPUT_MODE_LABELS } from './constants';
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
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
import { useActiveBackend } from '@/stores/backend';
import { useOcProviderStore, useOcSelectedModelSupportsImageInput } from '@/stores/opencode';
import { getCapabilities } from '@/types/backend';

type OcAgent = 'build' | 'plan' | 'explore';

function formatOcAgent(agent: OcAgent): string {
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

function getNextOcAgent(agent: OcAgent): OcAgent {
  return agent === 'build' ? 'plan' : agent === 'plan' ? 'explore' : 'build';
}

function getOcAgentTextClass(agent: OcAgent): string {
  switch (agent) {
    case 'build':
      return 'text-primary hover:text-primary hover:bg-primary/10';
    case 'plan':
      return 'text-mode-plan hover:text-mode-plan hover:bg-mode-plan/10';
    case 'explore':
      return 'text-[#d85ba8] hover:text-[#d85ba8] hover:bg-[#d85ba8]/10';
  }
}

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
  effortHoverOpen,
  setEffortHoverOpen,
  onModelChange,
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
  const activeBackend = useActiveBackend();
  const capabilities = getCapabilities(activeBackend);
  const ocSupportsImages = useOcSelectedModelSupportsImageInput();
  const ocAgent = useOcProviderStore((state) => state.selectedAgent);
  const setOcAgent = useOcProviderStore((state) => state.setSelectedAgent);
  const ocProviders = useOcProviderStore((state) => state.providers);
  const ocProviderId = useOcProviderStore((state) => state.selectedProviderId);
  const ocModelId = useOcProviderStore((state) => state.selectedModelId);
  const isAdaptiveModel = model === 'claude-opus-4-6' || model === 'claude-sonnet-4-6';
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const showModePicker = activeBackend === 'claude';
  const showOcAgentPicker = activeBackend === 'opencode';
  const showOcModelSelector = activeBackend === 'opencode';
  const ocProvider = ocProviders.find((item) => item.id === ocProviderId) ?? ocProviders[0];
  const ocModel = ocProvider
    ? ((ocModelId ? ocProvider.models[ocModelId] : undefined) ??
      Object.values(ocProvider.models)[0])
    : undefined;
  const showOcThinkingSelector =
    activeBackend === 'opencode' && Object.keys(ocModel?.variants ?? {}).length > 0;
  const showModelSelector = capabilities.modelSelector === 'claude-models';
  const showOcModelSeparator = showOcAgentPicker && showOcModelSelector;
  const showOcThinkingSeparator = showOcAgentPicker && showOcThinkingSelector;
  const showEffortControl = capabilities.effortLevel && isAdaptiveModel;
  const showThinkingControl = capabilities.thinkingMode && !isAdaptiveModel;
  const showCompactMenu = showEffortControl || showThinkingControl;
  const shouldShowContext = maxTokens > 0;
  const supportsImages = activeBackend === 'opencode' ? ocSupportsImages : true;
  const imageTooltip = supportsImages ? 'Attach image' : "This model doesn't support images";
  const cycleOcAgent = (): void => {
    setOcAgent(getNextOcAgent(ocAgent));
  };

  // Width is 0 before first measurement; avoid entering compact mode prematurely
  const hasMeasured = width > 0;
  const isCompact = hasMeasured && width < INPUT_CONTROLS.collapseBreakpoint;

  // Reset hover states when switching to compact mode
  // Prevents stuck hover card if it was open during resize
  useEffect(() => {
    if (isCompact) {
      setThinkingHoverOpen(false);
      setEffortHoverOpen(false);
    }
  }, [isCompact, setThinkingHoverOpen, setEffortHoverOpen]);

  return (
    <div ref={containerRef} className="flex w-full items-center justify-between gap-1 px-1 pb-1">
      {/* Left Controls - Mode & Model Pickers */}
      <div className="flex items-center gap-0.5">
        {/* Model Picker */}
        {showModelSelector ? <ModelSelector onModelChange={onModelChange} /> : null}
        {showModePicker && showModelSelector ? (
          <div aria-hidden="true" className="mx-1 h-4 w-px bg-border/60" />
        ) : null}
        {/* Mode Picker */}
        {showModePicker ? (
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
        ) : null}
        {showOcModelSelector ? <OcModelSelector /> : null}
        {showOcModelSeparator ? (
          <div aria-hidden="true" className="mx-1 h-4 w-px bg-border/60" />
        ) : null}
        {showOcThinkingSelector ? <OcThinkingSelector /> : null}
        {showOcThinkingSeparator ? (
          <div aria-hidden="true" className="mx-1 h-4 w-px bg-border/60" />
        ) : null}
        {showOcAgentPicker ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={cycleOcAgent}
                aria-label={`Agent mode: ${formatOcAgent(ocAgent)}. Click to change.`}
                className={cn(
                  `h-7 px-2.5 flex items-center gap-1.5 rounded-full ${TRANSITION_CLASSES.button}`,
                  'bg-transparent',
                  getOcAgentTextClass(ocAgent),
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
                )}
              >
                {ocAgent === 'build' ? (
                  <IconHammer2 size={14} aria-hidden="true" />
                ) : ocAgent === 'plan' ? (
                  <IconMap size={14} aria-hidden="true" />
                ) : (
                  <Telescope className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span className="max-w-[120px] truncate text-md font-medium">
                  {formatOcAgent(ocAgent)}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              <span className="leading-none">Agent mode</span>
              <Kbd className="h-[18px] !text-[11px] px-1.5 rounded-[5px] border-transparent bg-white/5 text-inherit">
                Shift + Tab
              </Kbd>
            </TooltipContent>
          </Tooltip>
        ) : null}
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
                    disabled={!supportsImages}
                    aria-label="Attach image"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[9px]',
                      supportsImages
                        ? 'bg-transparent text-muted-foreground/70'
                        : 'bg-transparent text-muted-foreground/30 cursor-not-allowed',
                      supportsImages && TRANSITION_CLASSES.button,
                      supportsImages &&
                        'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
                      supportsImages && 'active:scale-95',
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
            {/* Thinking Mode / Effort Level Button — conditional on model */}
            {showEffortControl ? (
              <EffortLevelButton
                effortLevel={effortLevel}
                effortHoverOpen={effortHoverOpen}
                setEffortHoverOpen={setEffortHoverOpen}
                cycleEffortLevel={cycleEffortLevel}
                getEffortInfo={getEffortInfo}
              />
            ) : showThinkingControl ? (
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
                    disabled={!supportsImages}
                    aria-label="Attach image"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[9px]',
                      supportsImages
                        ? 'bg-transparent text-muted-foreground/70'
                        : 'bg-transparent text-muted-foreground/30 cursor-not-allowed',
                      supportsImages && TRANSITION_CLASSES.button,
                      supportsImages &&
                        'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
                      supportsImages && 'active:scale-95',
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
            usedTokens={usage.inputTokens + usage.outputTokens}
            usage={{
              promptTokens: usage.inputTokens,
              completionTokens: usage.outputTokens,
              totalTokens: usage.inputTokens + usage.outputTokens,
            }}
          >
            <ContextTrigger />
            <ContextContent>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
              </ContextContentBody>
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
