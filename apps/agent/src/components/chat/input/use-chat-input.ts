import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EFFORT_LEVEL_INFO,
  EFFORT_LEVELS,
  THINKING_MODE_DOTS,
  THINKING_MODE_INFO,
  THINKING_MODES,
} from './constants';
import { getFilteredCommandsCount, getCommandAtIndex } from './slash-command-popover';
import { usePopoverNavigation, handlePopoverKeyDown } from './use-popover-navigation';

import type { SlashCommand, UseChatInputOptions, UseChatInputReturn } from './types';
import type { ContextItem, FileEntry } from '@/types/agent/context';
import type { InputMode } from '@/types/protocol';

import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/utils/image-utils';
import { useSlashCommands, useCommandsStore } from '@/stores/agent';
import { useElementContexts, useBrowserStore } from '@/stores/browser/browser-store';
import { useFileStore } from '@/stores/file/file-store';

const logger = createLogger('ChatInput');

export function useChatInput(options: UseChatInputOptions): UseChatInputReturn {
  const {
    inputMode,
    thinkingMode,
    effortLevel,
    isAgentRunning,
    onSend,
    onStop,
    onModeChange,
    onThinkingModeChange,
    onEffortChange,
  } = options;

  // Core input state
  const [inputText, setInputText] = useState('');
  const [attachedContext, setAttachedContext] = useState<ContextItem[]>([]);

  // Slash commands + skills from centralized store (prevents duplicate IPC calls)
  const slashCommands = useSlashCommands();
  const fetchCommands = useCommandsStore((state) => state.fetchCommands);
  const fetchSkills = useCommandsStore((state) => state.fetchSkills);

  // Refs
  const inputRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Guard against ESC key repeat triggering multiple stops
  // React state updates are async, so isAgentRunning can be true for multiple rapid keydown events
  const isStoppingRef = useRef(false);

  // Popover navigation state
  const popover = usePopoverNavigation();

  // Browser element contexts
  const elementContexts = useElementContexts();
  const removeElementContext = useBrowserStore((state) => state.removeElementContext);
  const clearElementContexts = useBrowserStore((state) => state.clearElementContexts);

  // Fetch commands and skills on mount (store handles deduplication)
  useEffect(() => {
    void fetchCommands();
    void fetchSkills();
  }, [fetchCommands, fetchSkills]);

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

  // Listen for prefill event from rewind — populates input with the removed message
  useEffect(() => {
    const handlePrefill = (e: Event): void => {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      if (!text || !inputRef.current) return;
      inputRef.current.textContent = text;
      setInputText(text);
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      if (sel) {
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      inputRef.current.focus();
    };
    window.addEventListener('prefillChatInput', handlePrefill);
    return () => {
      window.removeEventListener('prefillChatInput', handlePrefill);
    };
  }, []);

  // Listen for addSkillChip event — adds a skill as a context chip and focuses input
  useEffect(() => {
    const handleAddSkill = (e: Event): void => {
      const name = (e as CustomEvent<{ name: string }>).detail.name;
      if (!name) return;
      setAttachedContext((prev) => {
        if (prev.some((item) => item.type === 'skill' && item.name === name)) return prev;
        return [...prev, { id: crypto.randomUUID(), type: 'skill', name, path: name }];
      });
      inputRef.current?.focus();
    };
    window.addEventListener('addSkillChip', handleAddSkill);
    return () => {
      window.removeEventListener('addSkillChip', handleAddSkill);
    };
  }, []);

  // Reset stopping guard when agent stops running
  useEffect(() => {
    if (!isAgentRunning) {
      isStoppingRef.current = false;
    }
  }, [isAgentRunning]);

  // Input change handler - detects @ mentions and / commands
  const handleInputChange = useCallback(
    (e: React.SyntheticEvent<HTMLDivElement>): void => {
      const text = e.currentTarget.textContent || '';
      setInputText(text);

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const cursorPos = range.startOffset;
        const beforeCursor = text.slice(0, cursorPos);

        // Detect / slash command — triggers after any whitespace or at start of input.
        // Find the last "/" before cursor that's either at position 0 or preceded by a space.
        const lastSlashIndex = beforeCursor.lastIndexOf('/');
        if (
          lastSlashIndex !== -1 &&
          (lastSlashIndex === 0 || beforeCursor[lastSlashIndex - 1] === ' ')
        ) {
          const afterSlash = beforeCursor.slice(lastSlashIndex + 1);
          if (!afterSlash.includes(' ')) {
            // Only keep the popover open if there are matching commands (or query is empty → show all).
            // When nothing matches the user is likely typing a URL or path, not a slash command.
            if (afterSlash === '' || getFilteredCommandsCount(afterSlash, slashCommands) > 0) {
              popover.setSlashQuery(afterSlash);
              popover.setSlashStartIndex(lastSlashIndex);
              popover.setSlashOpen(true);
              // Close mention if open
              if (popover.mentionOpen) {
                popover.setMentionOpen(false);
                popover.setMentionQuery('');
              }
              return;
            } else {
              // No matches — dismiss the popover silently
              popover.closeSlashPopover();
            }
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
    [popover, slashCommands]
  );

  // Send message handler
  const handleSend = useCallback((): void => {
    let text = inputText.trim();
    if (!text) return;

    // Append @filename tokens for attached files/folders so they persist in JSONL content.
    // The file paths are still sent as attachments for the SDK, but the @tokens ensure
    // the user sees them after switching chats (JSONL content survives, attachedFiles doesn't).
    // NOTE: File tokens are appended (not prepended) so they don't interfere with
    // skill prefix `/command` at the start of the message — agent-bridge checks
    // message.startsWith('/') for slash expansion (agent.ts:1306).
    const fileItems = attachedContext.filter(
      (item) => item.type === 'file' || item.type === 'folder'
    );
    if (fileItems.length > 0) {
      const fileSuffix = fileItems.map((item) => `@${item.name}`).join(' ');
      text = `${text} ${fileSuffix}`;
    }

    // Prepend skill invocation if a skill chip is attached.
    // This must be the LAST prefix operation so `/skillName` stays at position 0,
    // ensuring agent-bridge's `message.startsWith('/')` check succeeds.
    const skillItems = attachedContext.filter((item) => item.type === 'skill');
    if (skillItems.length > 0) {
      const skillPrefix = skillItems.map((s) => `/${s.name}`).join(' ');
      text = `${skillPrefix} ${text}`;
    }

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

    // Extract skill names from attached context
    const skillNames = skillItems.map((s) => s.name);

    onSend(
      text,
      contextFiles.length > 0 ? contextFiles : undefined,
      images.length > 0 ? images : undefined,
      elementContexts.length > 0 ? elementContexts : undefined,
      skillNames.length > 0 ? skillNames : undefined
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
          logger.error('Failed to compress image', error);
        });
    });

    e.target.value = '';
  }, []);

  // Mention selection handler
  const handleMentionSelect = useCallback(
    (file: FileEntry): void => {
      // Fuzzy search returns relative paths — resolve to absolute for file reading
      const rootPath = useFileStore.getState().rootPath;
      const absolutePath =
        rootPath && !file.path.startsWith('/') ? `${rootPath}/${file.path}` : file.path;

      const newContext: ContextItem = {
        id: crypto.randomUUID(),
        type: file.isDirectory ? 'folder' : 'file',
        name: file.name,
        path: absolutePath,
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

  // Slash command selection handler — replaces only the /query token at slashStartIndex
  const handleSlashSelect = useCallback(
    (command: SlashCommand): void => {
      if (!inputRef.current) return;

      const currentText = inputRef.current.textContent;
      const start = popover.slashStartIndex;
      // The token to replace: from "/" through the end of the query (no space after yet)
      const tokenEnd = start + 1 + popover.slashQuery.length; // +1 for the "/" character

      if (command.kind === 'skill') {
        // Skills become context chips — remove the /query token from text
        const skillContext: ContextItem = {
          id: crypto.randomUUID(),
          type: 'skill',
          name: command.name,
          path: command.name,
        };
        setAttachedContext((prev) => {
          if (prev.some((item) => item.type === 'skill' && item.name === command.name)) {
            return prev;
          }
          return [...prev, skillContext];
        });

        // Remove the /query token, trimming any trailing space
        const before = currentText.slice(0, start);
        const after = currentText.slice(tokenEnd).replace(/^ /, '');
        const newText = (before + after).trim();
        inputRef.current.textContent = newText;
        setInputText(newText);
      } else {
        // Regular commands: replace /query with /command-name + space
        const before = currentText.slice(0, start);
        const after = currentText.slice(tokenEnd);
        const replacement = `/${command.name} `;
        const newText = before + replacement + after;
        inputRef.current.textContent = newText;
        setInputText(newText);

        // Place cursor right after the inserted command + space
        const cursorPos = start + replacement.length;
        const textNode = inputRef.current.firstChild;
        if (textNode) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(textNode, Math.min(cursorPos, textNode.textContent?.length ?? 0));
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }

      popover.closeSlashPopover();
      inputRef.current.focus();
    },
    [popover]
  );

  // Context removal handler
  const handleRemoveContext = useCallback((id: string): void => {
    setAttachedContext((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Stop handler with guard against rapid calls (ESC key repeat or rapid button clicks)
  const handleStop = useCallback((): void => {
    if (isStoppingRef.current) {
      return;
    }
    isStoppingRef.current = true;
    onStop();
  }, [onStop]);

  // Global ESC handler — stops the agent from anywhere on screen,
  // not just when the input box is focused. Without this, ESC only works
  // via the React onKeyDown on the contentEditable div.
  useEffect(() => {
    if (!isAgentRunning) return;

    const handleGlobalEscape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Only plain ESC — not Cmd+Esc, Ctrl+Esc, etc.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // If a popover is open, ESC should close it (handled by popover's own listener)
      if (popover.slashOpen || popover.mentionOpen) return;

      e.preventDefault();
      handleStop();
    };

    window.addEventListener('keydown', handleGlobalEscape);
    return () => {
      window.removeEventListener('keydown', handleGlobalEscape);
    };
  }, [isAgentRunning, popover.slashOpen, popover.mentionOpen, handleStop]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      // ESC stop is handled by the global window listener (useEffect above)
      // so it works regardless of which element has focus.

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

      // MentionPopover handles its own keyboard navigation internally
      // Skip sending message when mention popover is open (it handles Enter)
      if (popover.mentionOpen) {
        return;
      }

      // Enter sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [popover, slashCommands, handleSlashSelect, handleSend]
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

  const cycleEffortLevel = useCallback((): void => {
    const currentIndex = EFFORT_LEVELS.indexOf(effortLevel);
    const nextIndex = (currentIndex + 1) % EFFORT_LEVELS.length;
    const nextLevel = EFFORT_LEVELS[nextIndex] ?? 'high';
    onEffortChange(nextLevel);
  }, [effortLevel, onEffortChange]);

  // Utility functions
  const getThinkingInfo = useCallback(() => {
    return THINKING_MODE_INFO[thinkingMode];
  }, [thinkingMode]);

  const getActiveDots = useCallback(() => {
    return THINKING_MODE_DOTS[thinkingMode];
  }, [thinkingMode]);

  const getEffortInfo = useCallback(() => {
    return EFFORT_LEVEL_INFO[effortLevel];
  }, [effortLevel]);

  const getInputBoxClasses = useCallback((): string => {
    const base =
      'w-full p-1 rounded-[14px] border bg-gray-1 dark:bg-[oklch(23%_0_0)] dark:border-white/8 dark:shadow-md border-white shadow-[0_0_12px_rgba(0,0,0,0.08),0_0_24px_rgba(0,0,0,0.05)]';
    switch (inputMode) {
      case 'plan':
        return cn(base, 'ring-2 ring-dotted ring-mode-plan/40');
      case 'accept':
        return cn(base, 'ring-2 ring-dotted ring-mode-accept/40');
      case 'default':
        return base;
    }
  }, [inputMode]);

  const isInputEmpty = inputText.length === 0;

  // Ghost text: show the untyped suffix of the top matching slash command.
  // e.g., typed "/com" → top match "commit" → ghost = "mit"
  const slashGhostText = useMemo(() => {
    if (!popover.slashOpen || popover.slashQuery.length === 0) return '';
    const topCommand = getCommandAtIndex(
      popover.slashQuery,
      popover.slashSelectedIndex,
      slashCommands
    );
    if (topCommand === null) return '';
    const name = topCommand.name.toLowerCase();
    const query = popover.slashQuery.toLowerCase();
    // Only show ghost when the query is a prefix of the command name
    if (!name.startsWith(query)) return '';
    return topCommand.name.slice(popover.slashQuery.length);
  }, [popover.slashOpen, popover.slashQuery, popover.slashSelectedIndex, slashCommands]);

  return {
    // State
    inputText,
    attachedContext,
    slashCommands,
    isInputEmpty,
    slashGhostText,
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
    handleStop,
    cycleInputMode,
    cycleThinkingMode,
    cycleEffortLevel,
    // Utilities
    getThinkingInfo,
    getActiveDots,
    getEffortInfo,
    getInputBoxClasses,
    // Browser context
    elementContexts,
    removeElementContext,
  };
}
