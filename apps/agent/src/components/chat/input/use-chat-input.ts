import { useCallback, useEffect, useRef, useState } from 'react';

import { THINKING_MODE_DOTS, THINKING_MODE_INFO, THINKING_MODES } from './constants';
import { getFilteredFilesCount, getFileAtIndex } from './mention-popover';
import { getFilteredCommandsCount, getCommandAtIndex } from './slash-command-popover';
import { usePopoverNavigation, handlePopoverKeyDown } from './use-popover-navigation';

import type { SlashCommand, UseChatInputOptions, UseChatInputReturn } from './types';
import type { ContextItem, FileEntry } from '@/types/agent/context';
import type { ExtensionMessage, InputMode } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { compressImage } from '@/lib/utils/image-utils';
import { cn } from '@/lib/utils/utils';
import { useElementContexts, useBrowserStore } from '@/stores/browser/browser-store';

export function useChatInput(options: UseChatInputOptions): UseChatInputReturn {
  const {
    inputMode,
    thinkingMode,
    isAgentRunning,
    fileList,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
  } = options;

  // Core input state
  const [inputText, setInputText] = useState('');
  const [attachedContext, setAttachedContext] = useState<ContextItem[]>([]);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const commandsFetchedRef = useRef(false);

  // Refs
  const inputRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Popover navigation state
  const popover = usePopoverNavigation();

  // Browser element contexts
  const elementContexts = useElementContexts();
  const removeElementContext = useBrowserStore((state) => state.removeElementContext);
  const clearElementContexts = useBrowserStore((state) => state.clearElementContexts);

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

  // Input change handler - detects @ mentions and / commands
  const handleInputChange = useCallback(
    (e: React.FormEvent<HTMLDivElement>): void => {
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
            popover.setSlashQuery(afterSlash);
            popover.setSlashOpen(true);
            // Close mention if open
            if (popover.mentionOpen) {
              popover.setMentionOpen(false);
              popover.setMentionQuery('');
            }
            return;
          }
        }

        // Detect @ mention
        const lastAtIndex = beforeCursor.lastIndexOf('@');
        if (lastAtIndex !== -1) {
          const afterAt = beforeCursor.slice(lastAtIndex + 1);
          if (!afterAt.includes(' ')) {
            popover.setMentionQuery(afterAt);
            popover.setMentionOpen(true);
            // Close slash if open
            if (popover.slashOpen) {
              popover.setSlashOpen(false);
              popover.setSlashQuery('');
            }
            return;
          }
        }
      }

      if (popover.mentionOpen) {
        popover.setMentionOpen(false);
        popover.setMentionQuery('');
      }
      if (popover.slashOpen) {
        popover.setSlashOpen(false);
        popover.setSlashQuery('');
      }
    },
    [popover]
  );

  // Send message handler
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
    const images = attachedContext
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

  // Image handlers
  const handleImageClick = useCallback((): void => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }

      compressImage(file)
        .then((compressed) => {
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

    e.target.value = '';
  }, []);

  // Mention selection handler
  const handleMentionSelect = useCallback(
    (file: FileEntry): void => {
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

      popover.closeMentionPopover();
      inputRef.current?.focus();
    },
    [popover]
  );

  // Slash command selection handler
  const handleSlashSelect = useCallback(
    (command: SlashCommand): void => {
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

      popover.closeSlashPopover();
      inputRef.current?.focus();
    },
    [popover]
  );

  // Context removal handler
  const handleRemoveContext = useCallback((id: string): void => {
    setAttachedContext((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // @ button click handler
  const handleAtClick = useCallback((): void => {
    if (inputRef.current) {
      const text = inputRef.current.textContent || '';
      inputRef.current.textContent = text + '@';
      setInputText(text + '@');
      popover.setMentionOpen(true);
      popover.setMentionQuery('');
      inputRef.current.focus();
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [popover]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      // Escape stops the agent when running (highest priority)
      if (e.key === 'Escape' && isAgentRunning && !popover.slashOpen && !popover.mentionOpen) {
        e.preventDefault();
        onStop();
        return;
      }

      // Handle slash command popover
      if (popover.slashOpen) {
        const itemCount = getFilteredCommandsCount(popover.slashQuery, slashCommands);
        const handled = handlePopoverKeyDown(e, {
          itemCount,
          selectedIndex: popover.slashSelectedIndex,
          setSelectedIndex: popover.setSlashSelectedIndex,
          onSelect: () => {
            const selectedCommand = getCommandAtIndex(
              popover.slashQuery,
              popover.slashSelectedIndex,
              slashCommands
            );
            if (selectedCommand) {
              handleSlashSelect(selectedCommand);
            }
          },
          onClose: popover.closeSlashPopover,
        });
        if (handled) return;
      }

      // Handle mention popover
      if (popover.mentionOpen) {
        const itemCount = getFilteredFilesCount(fileList, popover.mentionQuery);
        const handled = handlePopoverKeyDown(e, {
          itemCount,
          selectedIndex: popover.mentionSelectedIndex,
          setSelectedIndex: popover.setMentionSelectedIndex,
          onSelect: () => {
            const selectedFile = getFileAtIndex(
              fileList,
              popover.mentionQuery,
              popover.mentionSelectedIndex
            );
            if (selectedFile) {
              handleMentionSelect(selectedFile);
            }
          },
          onClose: popover.closeMentionPopover,
        });
        if (handled) return;
      }

      // Enter sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      isAgentRunning,
      onStop,
      popover,
      slashCommands,
      fileList,
      handleSlashSelect,
      handleMentionSelect,
      handleSend,
    ]
  );

  // Paste handler
  const handlePaste = useCallback((e: React.ClipboardEvent): void => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(pastedText));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const newText = inputRef.current?.textContent ?? '';
    setInputText(newText);
  }, []);

  // Mode cycling handlers
  const cycleInputMode = useCallback((): void => {
    const nextMode: InputMode =
      inputMode === 'default' ? 'plan' : inputMode === 'plan' ? 'accept' : 'default';
    onModeChange(nextMode);
  }, [inputMode, onModeChange]);

  const cycleThinkingMode = useCallback((): void => {
    const currentIndex = THINKING_MODES.indexOf(thinkingMode);
    const nextIndex = (currentIndex + 1) % THINKING_MODES.length;
    const nextMode = THINKING_MODES[nextIndex] ?? 'off';
    onThinkingModeChange(nextMode);
  }, [thinkingMode, onThinkingModeChange]);

  // Utility functions
  const getThinkingInfo = useCallback(() => {
    return THINKING_MODE_INFO[thinkingMode];
  }, [thinkingMode]);

  const getActiveDots = useCallback(() => {
    return THINKING_MODE_DOTS[thinkingMode];
  }, [thinkingMode]);

  const getInputBoxClasses = useCallback(
    (hasPermissionPending: boolean): string => {
      const base = cn(
        'mx-auto p-1 bg-card border transition-all duration-200',
        hasPermissionPending ? 'rounded-b-lg rounded-t-none border-t-0' : 'rounded-lg',
        'shadow-lg',
        'focus-within:shadow-focus',
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
    },
    [inputMode]
  );

  const isInputEmpty = inputText.length === 0;

  return {
    // State
    inputText,
    attachedContext,
    slashCommands,
    isInputEmpty,
    // Refs
    inputRef,
    imageInputRef,
    // Popover state
    popover,
    // Handlers
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleSend,
    handleImageClick,
    handleImageSelect,
    handleMentionSelect,
    handleSlashSelect,
    handleRemoveContext,
    handleAtClick,
    cycleInputMode,
    cycleThinkingMode,
    // Utilities
    getThinkingInfo,
    getActiveDots,
    getInputBoxClasses,
    // Browser context
    elementContexts,
    removeElementContext,
  };
}
