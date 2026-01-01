import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { ArrowUp, AtSign, Coins, Globe, Image, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from './context';
import { ContextChips } from './context-chips';
import { MentionPopover, getFilteredFilesCount, getFileAtIndex } from './mention-popover';
import { ModelSelector } from './model-selector';
import {
  SlashCommandPopover,
  getFilteredCommandsCount,
  getCommandAtIndex,
} from './slash-command-popover';

import type { SlashCommand } from './slash-command-popover';
import type { ContextItem, FileEntry } from '@/types/context';
import type {
  ExtensionMessage,
  InputMode,
  Model,
  ReactElementContext,
  ThinkingMode,
} from '@/types/protocol';
import type { FC } from 'react';

import { ElementContextList } from '@/components/browser';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTauri } from '@/hooks/use-tauri';
import { CONTENT_WIDTH, INPUT_SIZES } from '@/lib/constants';
import { compressImage } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { useElementContexts, useBrowserStore } from '@/stores/browser-store';

const INPUT_MODE_LABELS: Record<InputMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

interface UsageData {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  data: string; // Base64 encoded
  previewUrl: string; // Data URL for display
}

interface ChatInputProps {
  readonly inputMode: InputMode;
  readonly thinkingMode: ThinkingMode;
  readonly isAgentRunning: boolean;
  readonly fileList: FileEntry[];
  readonly usage: UsageData;
  readonly maxTokens: number;
  readonly onSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ) => void;
  readonly onStop: () => void;
  readonly onModeChange: (mode: InputMode) => void;
  readonly onThinkingModeChange: (mode: ThinkingMode) => void;
  readonly onModelChange: (model: Model) => void;
}

export const ChatInput: FC<ChatInputProps> = ({
  inputMode,
  thinkingMode,
  isAgentRunning,
  fileList,
  usage,
  maxTokens,
  onSend,
  onStop,
  onModeChange,
  onThinkingModeChange,
  onModelChange,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedContext, setAttachedContext] = useState<ContextItem[]>([]);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const commandsFetchedRef = useRef(false);

  // Fetch slash commands from backend
  const handleCommandsMessage = useCallback((message: ExtensionMessage): void => {
    if (message.type === 'commands:list:response') {
      const commands: SlashCommand[] = message.commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description ?? '',
      }));
      setSlashCommands(commands);
    }
  }, []);

  const { postMessage } = useTauri({ onMessage: handleCommandsMessage });

  // Fetch commands on mount
  useEffect(() => {
    if (!commandsFetchedRef.current) {
      commandsFetchedRef.current = true;
      postMessage({
        type: 'commands:list',
        uuid: crypto.randomUUID(),
      });
    }
  }, [postMessage]);

  // Browser element contexts
  const elementContexts = useElementContexts();
  const removeElementContext = useBrowserStore((state) => state.removeElementContext);
  const clearElementContexts = useBrowserStore((state) => state.clearElementContexts);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [thinkingHoverOpen, setThinkingHoverOpen] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Reset selection index when mention query changes
  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionQuery]);

  // Reset selection index when slash query changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashQuery]);

  // Listen for focus event from feedback button
  useEffect(() => {
    const handleFocusEvent = (): void => {
      inputRef.current?.focus();
    };
    window.addEventListener('focusChatInput', handleFocusEvent);
    return () => {
      window.removeEventListener('focusChatInput', handleFocusEvent);
    };
  }, []);

  const handleInputChange = (e: React.FormEvent<HTMLDivElement>): void => {
    const text = e.currentTarget.textContent || '';
    setInputText(text);

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const cursorPos = range.startOffset;
      const beforeCursor = text.slice(0, cursorPos);

      // Detect / slash command (only at start of input)
      if (beforeCursor.startsWith('/')) {
        const afterSlash = beforeCursor.slice(1);
        if (!afterSlash.includes(' ')) {
          setSlashQuery(afterSlash);
          setSlashOpen(true);
          // Close mention if open
          if (mentionOpen) {
            setMentionOpen(false);
            setMentionQuery('');
          }
          return;
        }
      }

      // Detect @ mention
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const afterAt = beforeCursor.slice(lastAtIndex + 1);
        if (!afterAt.includes(' ')) {
          setMentionQuery(afterAt);
          setMentionOpen(true);
          // Close slash if open
          if (slashOpen) {
            setSlashOpen(false);
            setSlashQuery('');
          }
          return;
        }
      }
    }

    if (mentionOpen) {
      setMentionOpen(false);
      setMentionQuery('');
    }
    if (slashOpen) {
      setSlashOpen(false);
      setSlashQuery('');
    }
  };

  const handleSend = useCallback((): void => {
    const text = inputText.trim();
    if (!text) return;

    // Clear input immediately
    setInputText('');
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }

    // Extract file paths from attached context
    const contextFiles = attachedContext
      .filter((item) => item.type === 'file' || item.type === 'folder')
      .map((item) => item.path);

    // Extract images from attached context
    const images: ImageAttachment[] = attachedContext
      .filter(
        (item): item is ContextItem & { type: 'image'; imageData: string; mimeType: string } =>
          item.type === 'image' && item.imageData !== undefined && item.mimeType !== undefined
      )
      .map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        data: item.imageData,
        previewUrl: item.previewUrl ?? '',
      }));

    onSend(
      text,
      contextFiles.length > 0 ? contextFiles : undefined,
      images.length > 0 ? images : undefined,
      elementContexts.length > 0 ? elementContexts : undefined
    );
    setAttachedContext([]);
    clearElementContexts();
  }, [inputText, onSend, attachedContext, clearElementContexts, elementContexts]);

  const handleImageClick = useCallback((): void => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return;
      }

      // Compress and resize image before adding
      compressImage(file)
        .then((compressed) => {
          // Create preview URL from compressed data
          const previewUrl = `data:${compressed.mimeType};base64,${compressed.data}`;

          const newContext: ContextItem = {
            id: crypto.randomUUID(),
            type: 'image',
            name: file.name,
            path: file.name,
            mimeType: compressed.mimeType,
            imageData: compressed.data,
            previewUrl,
          };
          setAttachedContext((prev) => [...prev, newContext]);
        })
        .catch((error: unknown) => {
          console.error('[ImageCompression] Failed to compress image:', error);
        });
    });

    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

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

  const handleSlashSelect = useCallback((command: SlashCommand): void => {
    // Replace the /query with the full command
    if (inputRef.current) {
      inputRef.current.textContent = `/${command.name} `;
      setInputText(`/${command.name} `);
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    setSlashOpen(false);
    setSlashQuery('');
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
    // Escape stops the agent when running (highest priority)
    if (e.key === 'Escape' && isAgentRunning && !slashOpen && !mentionOpen) {
      e.preventDefault();
      onStop();
      return;
    }

    // Handle slash command popover
    if (slashOpen) {
      const itemCount = getFilteredCommandsCount(slashQuery, slashCommands);

      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        setSlashQuery('');
        setSlashSelectedIndex(0);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex((prev) => (prev + 1) % Math.max(1, itemCount));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex((prev) => (prev - 1 + itemCount) % Math.max(1, itemCount));
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selectedCommand = getCommandAtIndex(slashQuery, slashSelectedIndex, slashCommands);
        if (selectedCommand) {
          handleSlashSelect(selectedCommand);
        }
        return;
      }
    }

    // Handle mention popover
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
    const nextMode: InputMode =
      inputMode === 'default' ? 'plan' : inputMode === 'plan' ? 'accept' : 'default';
    onModeChange(nextMode);
  }, [inputMode, onModeChange]);

  const cycleThinkingMode = useCallback((): void => {
    const modes: readonly ThinkingMode[] = ['off', 'think', 'hard', 'ultra'] as const;
    const currentIndex = modes.indexOf(thinkingMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex] ?? 'off';
    onThinkingModeChange(nextMode);
  }, [thinkingMode, onThinkingModeChange]);

  // Get thinking mode info for display
  const getThinkingInfo = (): { level: string; tokens: string } => {
    switch (thinkingMode) {
      case 'off':
        return { level: 'Off', tokens: '0' };
      case 'think':
        return { level: 'Think', tokens: '4k' };
      case 'hard':
        return { level: 'Hard', tokens: '10k' };
      case 'ultra':
        return { level: 'Ultra', tokens: '32k' };
    }
  };

  // Get number of active dots (0-3)
  const getActiveDots = (): number => {
    switch (thinkingMode) {
      case 'off':
        return 0;
      case 'think':
        return 1;
      case 'hard':
        return 2;
      case 'ultra':
        return 3;
    }
  };

  const getInputBoxClasses = (): string => {
    const base = cn(
      'mx-auto p-1 rounded-[14px] bg-card border transition-all duration-200',
      // Light mode shadows only
      'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_12px_-4px_rgba(0,0,0,0.05)]',
      'focus-within:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_8px_24px_-8px_rgba(0,0,0,0.08)]',
      'dark:shadow-none dark:focus-within:shadow-none'
    );
    switch (inputMode) {
      case 'plan':
        return `${base} border-2 border-dotted border-mode-plan`;
      case 'accept':
        return `${base} border-2 border-dotted border-mode-accept`;
      case 'default':
        return `${base} border-border/50 focus-within:border-border/70`;
    }
  };

  const isInputEmpty = inputText.length === 0;

  return (
    <div className="p-4 pt-0 shrink-0 relative">
      <div className={getInputBoxClasses()} style={{ maxWidth: CONTENT_WIDTH.inputBox }}>
        {/* Element Context Chips - selected browser elements */}
        <ElementContextList elements={elementContexts} onRemove={removeElementContext} />

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
          className="p-2 text-sm outline-none overflow-y-auto"
          style={{ minHeight: INPUT_SIZES.textareaMinHeight, maxHeight: 300 }}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Plan, @ for context, / for commands"
          data-empty={isInputEmpty}
          onInput={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(text));
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }}
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

        {/* Slash Command Popover */}
        <SlashCommandPopover
          open={slashOpen}
          onOpenChange={setSlashOpen}
          query={slashQuery}
          onSelect={handleSlashSelect}
          anchorRef={inputRef}
          selectedIndex={slashSelectedIndex}
          commands={slashCommands}
        />

        {/* Controls Row */}
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
                  <span className="text-[11px] font-medium">{INPUT_MODE_LABELS[inputMode]}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Input mode</TooltipContent>
            </Tooltip>
            {/* Model Picker */}
            <ModelSelector onModelChange={onModelChange} />
          </div>

          {/* Right Controls - Action Buttons */}
          <div className="flex items-center gap-0.5">
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
            {/* Thinking Mode Button with HoverCard */}
            <HoverCard open={thinkingHoverOpen}>
              <div
                onMouseEnter={() => {
                  setThinkingHoverOpen(true);
                }}
                onMouseLeave={() => {
                  setThinkingHoverOpen(false);
                }}
              >
                <HoverCardTrigger asChild>
                  <button
                    onClick={cycleThinkingMode}
                    className={cn(
                      'h-7 flex items-center justify-center gap-1 px-1.5 rounded-lg',
                      'transition-all duration-150',
                      'hover:bg-muted/50 hover:scale-[1.02]',
                      'active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                      thinkingMode === 'off' && 'text-muted-foreground/70 hover:text-foreground'
                    )}
                  >
                    <IconImagine
                      size={16}
                      className={cn(
                        'transition-colors duration-150',
                        thinkingMode !== 'off' && 'text-primary'
                      )}
                    />
                    {/* Vertical dots indicator */}
                    <div className="flex flex-col gap-[2px]">
                      {[2, 1, 0].map((dotIndex) => {
                        const activeDots = getActiveDots();
                        const isActive = dotIndex < activeDots;
                        return (
                          <div
                            key={dotIndex}
                            className={cn(
                              'w-[4px] h-[4px] rounded-full transition-all duration-200',
                              isActive
                                ? 'bg-black dark:bg-white shadow-[0_0_6px_rgba(0,0,0,0.4)] dark:shadow-[0_0_6px_rgba(255,255,255,0.8)]'
                                : 'bg-muted-foreground/30'
                            )}
                          />
                        );
                      })}
                    </div>
                  </button>
                </HoverCardTrigger>
              </div>
              <HoverCardContent
                side="top"
                align="center"
                className="w-auto p-2.5 rounded-lg border-border/50 bg-popover/98 backdrop-blur-sm"
                onMouseEnter={() => {
                  setThinkingHoverOpen(true);
                }}
                onMouseLeave={() => {
                  setThinkingHoverOpen(false);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <IconImagine
                      size={16}
                      className={cn(
                        thinkingMode !== 'off' ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span className="text-xs font-medium">{getThinkingInfo().level}</span>
                  </div>
                  {thinkingMode !== 'off' ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Coins className="h-3 w-3" />
                      <span>{getThinkingInfo().tokens} tokens</span>
                    </div>
                  ) : null}
                </div>
              </HoverCardContent>
            </HoverCard>
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
            {isAgentRunning && isInputEmpty ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onStop}
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-full',
                      'bg-destructive text-destructive-foreground',
                      'transition-all duration-150',
                      'hover:bg-destructive/90 hover:scale-105',
                      'active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
                    )}
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Stop (Esc)</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleSend}
                    disabled={isInputEmpty}
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-full',
                      'transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                      isInputEmpty
                        ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-[0_0_16px_-2px_var(--primary)] active:scale-95'
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isAgentRunning ? 'Queue message' : 'Send message'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
