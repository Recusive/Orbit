import {
  ArrowRight,
  AtSign,
  Coins,
  Globe,
  Image,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContextItem, FileEntry } from '@/types/context';
import type { InputMode } from '@/types/protocol';
import type { FC } from 'react';

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from '@/components/chat/context';
import { ContextChips } from '@/components/chat/context-chips';
import { MentionPopover, getFilteredFilesCount, getFileAtIndex } from '@/components/chat/mention-popover';
import { ModelSelector } from '@/components/chat/model-selector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CONTENT_WIDTH, INPUT_SIZES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const INPUT_MODE_LABELS: Record<InputMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

interface ChatInputProps {
  readonly inputMode: InputMode;
  readonly isAgentRunning: boolean;
  readonly fileList: FileEntry[];
  readonly onSend: (text: string) => void;
  readonly onModeChange: (mode: InputMode) => void;
}

export const ChatInput: FC<ChatInputProps> = ({
  inputMode,
  isAgentRunning,
  fileList,
  onSend,
  onModeChange,
}) => {
  const [inputText, setInputText] = useState('');
  const [thinkingMode, setThinkingMode] = useState<'off' | 'think' | 'hard' | 'ultra'>('off');
  const [attachedContext, setAttachedContext] = useState<ContextItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLDivElement>(null);

  // Reset selection index when mention query changes
  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionQuery]);

  const handleInputChange = (e: React.FormEvent<HTMLDivElement>): void => {
    const text = e.currentTarget.textContent || '';
    setInputText(text);

    // Detect @ mention
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const cursorPos = range.startOffset;
      const beforeCursor = text.slice(0, cursorPos);
      const lastAtIndex = beforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const afterAt = beforeCursor.slice(lastAtIndex + 1);
        if (!afterAt.includes(' ')) {
          setMentionQuery(afterAt);
          setMentionOpen(true);
          return;
        }
      }
    }

    if (mentionOpen) {
      setMentionOpen(false);
      setMentionQuery('');
    }
  };

  const handleSend = useCallback((): void => {
    const text = inputText.trim();
    if (!text || isAgentRunning) return;

    // Clear input immediately
    setInputText('');
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }

    onSend(text);
    // TODO: Send attachedContext when context support is implemented
    setAttachedContext([]);
  }, [inputText, isAgentRunning, onSend]);

  const handleMentionSelect = useCallback((file: FileEntry): void => {
    const newContext: ContextItem = {
      id: crypto.randomUUID(),
      type: file.isDirectory ? 'folder' : 'file',
      name: file.name,
      path: file.path,
    };
    setAttachedContext((prev) => [...prev, newContext]);

    // Remove the @query from input
    if (inputRef.current) {
      const text = inputRef.current.textContent || '';
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const cursorPos = range.startOffset;
        const beforeCursor = text.slice(0, cursorPos);
        const lastAtIndex = beforeCursor.lastIndexOf('@');
        if (lastAtIndex !== -1) {
          const newText = text.slice(0, lastAtIndex) + text.slice(cursorPos);
          inputRef.current.textContent = newText;
          setInputText(newText);
        }
      }
    }

    setMentionOpen(false);
    setMentionQuery('');
    inputRef.current?.focus();
  }, []);

  const handleRemoveContext = useCallback((id: string): void => {
    setAttachedContext((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAtClick = useCallback((): void => {
    if (inputRef.current) {
      const text = inputRef.current.textContent || '';
      inputRef.current.textContent = text + '@';
      setInputText(text + '@');
      setMentionOpen(true);
      setMentionQuery('');
      inputRef.current.focus();
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (mentionOpen) {
      const itemCount = getFilteredFilesCount(fileList, mentionQuery);

      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        setMentionQuery('');
        setMentionSelectedIndex(0);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % Math.max(1, itemCount));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + itemCount) % Math.max(1, itemCount));
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selectedFile = getFileAtIndex(fileList, mentionQuery, mentionSelectedIndex);
        if (selectedFile) {
          handleMentionSelect(selectedFile);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cycleInputMode = useCallback((): void => {
    const nextMode: InputMode = inputMode === 'default' ? 'plan'
      : inputMode === 'plan' ? 'accept'
      : 'default';
    onModeChange(nextMode);
  }, [inputMode, onModeChange]);

  const getInputBoxClasses = (): string => {
    const base = 'mx-auto p-1 rounded-lg bg-muted transition-colors';
    switch (inputMode) {
      case 'plan':
        return `${base} border-2 border-dashed border-mode-plan`;
      case 'accept':
        return `${base} border-2 border-dashed border-mode-accept`;
      case 'default':
        return `${base} border border-border focus-within:border-muted-foreground/30 dark:focus-within:border-muted-foreground/50`;
    }
  };

  const isInputEmpty = inputText.length === 0;

  return (
    <div className="p-4 pt-0 shrink-0 relative">
      <div className={getInputBoxClasses()} style={{ maxWidth: CONTENT_WIDTH.inputBox }}>
        {/* Context Chips Row - shown when items attached */}
        {attachedContext.length > 0 ? (
          <ContextChips
            items={attachedContext}
            onRemove={handleRemoveContext}
            className="border-b border-border/50"
          />
        ) : null}

        {/* Input Area */}
        <div
          ref={inputRef}
          className="p-2 text-sm outline-none"
          style={{ minHeight: INPUT_SIZES.textareaMinHeight }}
          contentEditable={!isAgentRunning}
          suppressContentEditableWarning
          data-placeholder="Plan, @ for context, / for commands"
          data-empty={isInputEmpty}
          onInput={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        {/* Mention Popover */}
        <MentionPopover
          open={mentionOpen}
          onOpenChange={setMentionOpen}
          query={mentionQuery}
          onQueryChange={setMentionQuery}
          onSelect={handleMentionSelect}
          files={fileList}
          anchorRef={inputRef}
          selectedIndex={mentionSelectedIndex}
          onSelectedIndexChange={setMentionSelectedIndex}
        />

        {/* Controls Row */}
        <div className="flex w-full items-center justify-between gap-1 px-1 pb-1">
          {/* Left Controls - Mode & Model Pickers */}
          <div className="flex items-center gap-0.5">
            {/* Mode Picker */}
            <button
              onClick={cycleInputMode}
              className={cn(
                'h-7 px-2 flex items-center gap-1.5 rounded hover:bg-accent transition-colors',
                inputMode === 'default' && 'border border-border opacity-70 hover:opacity-100',
                inputMode === 'plan' && 'text-mode-plan',
                inputMode === 'accept' && 'text-mode-accept'
              )}
            >
              <span className="text-xs font-medium">{INPUT_MODE_LABELS[inputMode]}</span>
            </button>
            {/* Model Picker */}
            <ModelSelector />
          </div>

          {/* Right Controls - Action Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleAtClick}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors"
              title="Add Context (@)"
            >
              <AtSign className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors',
                    thinkingMode === 'off' && 'opacity-70 hover:opacity-100',
                    thinkingMode === 'think' && 'opacity-100 text-mode-think',
                    thinkingMode === 'hard' && 'opacity-100 text-orange-500',
                    thinkingMode === 'ultra' && 'opacity-100 text-red-500'
                  )}
                  title="Think Config"
                >
                  <Lightbulb className={cn(
                    'h-4 w-4',
                    thinkingMode === 'think' && 'fill-mode-think',
                    thinkingMode === 'hard' && 'fill-orange-500',
                    thinkingMode === 'ultra' && 'fill-red-500'
                  )} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="p-2">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className="text-xs text-muted-foreground">Think config</span>
                  {thinkingMode !== 'off' ? (
                    <span className={cn(
                      'flex items-center gap-1 text-[10px]',
                      thinkingMode === 'think' && 'text-mode-think',
                      thinkingMode === 'hard' && 'text-orange-500',
                      thinkingMode === 'ultra' && 'text-red-500'
                    )}>
                      {thinkingMode === 'think' && '4k'}
                      {thinkingMode === 'hard' && '10k'}
                      {thinkingMode === 'ultra' && '32k'}
                      <Coins className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>
                <div className="relative flex gap-1 bg-muted rounded-md p-1 border border-border">
                  {/* Sliding indicator */}
                  <div
                    className="absolute top-1 bottom-1 left-1 bg-background rounded shadow-sm transition-all duration-200"
                    style={{
                      width: 'var(--tab-width)',
                      transform: `translateX(calc(${String(['off', 'think', 'hard', 'ultra'].indexOf(thinkingMode))} * (var(--tab-width) + 4px)))`,
                      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                      // @ts-expect-error CSS custom property
                      '--tab-width': '38px',
                    }}
                  />
                  {(['off', 'think', 'hard', 'ultra'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setThinkingMode(mode); }}
                      className={cn(
                        'relative z-10 w-[38px] py-1 text-xs font-medium rounded transition-colors duration-200 capitalize',
                        thinkingMode === mode
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors" title="Web Browser">
              <Globe className="h-4 w-4" />
            </button>
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 transition-colors" title="Attach Image">
              <Image className="h-4 w-4" />
            </button>
            {/* Context Usage */}
            <Context maxTokens={200000} usedTokens={45000} usage={{ promptTokens: 32000, completionTokens: 13000, totalTokens: 45000 }}>
              <ContextTrigger />
              <ContextContent>
                <ContextContentHeader />
                <ContextContentBody>
                  <ContextInputUsage />
                  <ContextOutputUsage />
                </ContextContentBody>
              </ContextContent>
            </Context>
            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isInputEmpty || isAgentRunning}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-full transition-colors',
                isInputEmpty || isAgentRunning
                  ? 'bg-primary/30 text-primary-foreground opacity-50 cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {isAgentRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
