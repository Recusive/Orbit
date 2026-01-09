import { ArrowUp, AtSign, Globe, Image, Square } from 'lucide-react';

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

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/utils';

export const InputControls: FC<InputControlsProps> = ({
  inputMode,
  thinkingMode,
  isAgentRunning,
  isInputEmpty,
  usage,
  maxTokens,
  imageInputRef,
  thinkingHoverOpen,
  setThinkingHoverOpen,
  onModelChange,
  cycleInputMode,
  cycleThinkingMode,
  handleAtClick,
  handleImageClick,
  handleImageSelect,
  handleSend,
  onStop,
  getThinkingInfo,
  getActiveDots,
}) => {
  return (
    <div className="flex w-full items-center justify-between gap-1 px-1 pb-1">
      {/* Left Controls - Mode & Model Pickers */}
      <div className="flex items-center gap-0.5">
        {/* Mode Picker */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={cycleInputMode}
              className={cn(
                'h-7 px-2.5 flex items-center gap-1.5 rounded-lg transition-all duration-150',
                'hover:scale-[1.02] active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                inputMode === 'default' &&
                  'bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                inputMode === 'plan' && 'bg-mode-plan/10 text-mode-plan hover:bg-mode-plan/20',
                inputMode === 'accept' &&
                  'bg-mode-accept/10 text-mode-accept hover:bg-mode-accept/20'
              )}
            >
              <span className="text-sm font-medium">{INPUT_MODE_LABELS[inputMode]}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Input mode</TooltipContent>
        </Tooltip>
        {/* Model Picker */}
        <ModelSelector onModelChange={onModelChange} />
      </div>

      {/* Right Controls - Action Buttons */}
      <div className="flex items-center gap-0.5">
        {/* @ Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleAtClick}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-lg',
                'bg-transparent text-muted-foreground/70',
                'transition-all duration-150',
                'hover:bg-muted/50 hover:text-foreground hover:scale-[1.08]',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
              )}
            >
              <AtSign className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Add context (@)</TooltipContent>
        </Tooltip>

        {/* Thinking Mode Button */}
        <ThinkingModeButton
          thinkingMode={thinkingMode}
          thinkingHoverOpen={thinkingHoverOpen}
          setThinkingHoverOpen={setThinkingHoverOpen}
          cycleThinkingMode={cycleThinkingMode}
          getThinkingInfo={getThinkingInfo}
          getActiveDots={getActiveDots}
        />

        {/* Globe Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-lg',
                'bg-transparent text-muted-foreground/70',
                'transition-all duration-150',
                'hover:bg-muted/50 hover:text-foreground hover:scale-[1.08]',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
              )}
            >
              <Globe className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Web browser</TooltipContent>
        </Tooltip>

        {/* Image Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleImageClick}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-lg',
                'bg-transparent text-muted-foreground/70',
                'transition-all duration-150',
                'hover:bg-muted/50 hover:text-foreground hover:scale-[1.08]',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
              )}
            >
              <Image className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Attach image</TooltipContent>
        </Tooltip>

        {/* Hidden file input for images */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* Context Usage */}
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

        {/* Send/Stop Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={isAgentRunning && isInputEmpty ? onStop : handleSend}
              disabled={!isAgentRunning && isInputEmpty}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-full',
                'transition-all duration-200 ease-out',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                isAgentRunning && isInputEmpty
                  ? 'bg-red-400/80 text-white dark:bg-red-400/70 hover:bg-red-400/90 dark:hover:bg-red-400/80'
                  : isInputEmpty
                    ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-[0_0_16px_-2px_var(--primary)] active:scale-95'
              )}
            >
              {isAgentRunning && isInputEmpty ? (
                <Square className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
              ) : (
                <ArrowUp className="h-4 w-4" />
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
};
