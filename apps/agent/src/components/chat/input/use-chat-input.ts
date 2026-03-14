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
import { useActiveBackend } from '@/stores/backend';
import { useElementContexts, useBrowserStore } from '@/stores/browser/browser-store';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useFileStore } from '@/stores/file/file-store';
import { useOcProviderStore } from '@/stores/opencode';

const logger = createLogger('ChatInput');
const OPENCODE_AGENTS = ['build', 'plan', 'explore'] as const;

function getTextOffset(container: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getSelectionOffsets(container: HTMLElement): { start: number; end: number } {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }

  const range = selection.getRangeAt(0);
  return {
    start: getTextOffset(container, range.startContainer, range.startOffset),
    end: getTextOffset(container, range.endContainer, range.endOffset),
  };
}

export function getCursorOffset(container: HTMLElement): number {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  return getTextOffset(container, range.startContainer, range.startOffset);
}

export function setCursorAtTextOffset(container: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (selection === null) return;
  const activeSelection = selection;

  let remaining = offset;

  function placeRange(boundary: 'before' | 'after', node: Node): void {
    const range = document.createRange();
    if (boundary === 'before') {
      range.setStartBefore(node);
    } else {
      range.setStartAfter(node);
    }
    range.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(range);
  }

  function walk(parent: Node): boolean {
    for (const child of parent.childNodes) {
      if (child instanceof HTMLBRElement) {
        if (remaining === 0) {
          placeRange('before', child);
          return true;
        }
        remaining -= 1;
        continue;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent?.length ?? 0;
        if (remaining <= len) {
          const range = document.createRange();
          range.setStart(child, remaining);
          range.collapse(true);
          activeSelection.removeAllRanges();
          activeSelection.addRange(range);
          return true;
        }
        remaining -= len;
        continue;
      }

      if (child instanceof HTMLElement && walk(child)) {
        return true;
      }
    }

    return false;
  }

  if (walk(container)) return;

  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  activeSelection.removeAllRanges();
  activeSelection.addRange(range);
}

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
  const activeBackend = useActiveBackend();
  const selectedOcAgent = useOcProviderStore((state) => state.selectedAgent);
  const setSelectedOcAgent = useOcProviderStore((state) => state.setSelectedAgent);

  // Core input state
  const [inputText, setInputText] = useState('');
  const [attachedContext, setAttachedContext] = useState<ContextItem[]>([]);
  // Leading command set explicitly on popover selection — NOT derived from text.
  // Explicit state is stable: set on select, cleared when text changes.
  const [leadingCommand, setLeadingCommand] = useState<string | null>(null);

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

  // Drain pending context chips from the store (survives ChatInput unmount).
  // Runs immediately on mount and whenever new chips are queued while mounted.
  useEffect(() => {
    const drainAndAttach = (): void => {
      const items = usePendingContextStore.getState().drainContext();
      if (items.length === 0) return;

      setAttachedContext((prev) => {
        const nextItems = items.filter((item) => {
          return !prev.some((existing) => {
            return (
              existing.type === item.type &&
              existing.path === item.path &&
              (existing.name === item.name || existing.type === 'skill')
            );
          });
        });
        return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
      });
      inputRef.current?.focus();
    };

    drainAndAttach();

    const unsubscribe = usePendingContextStore.subscribe((state) => {
      if (state.pending.length === 0) return;
      drainAndAttach();
    });

    return unsubscribe;
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
      const container = e.currentTarget;
      const text = container.textContent || '';
      setInputText(text);

      // Clear leading command highlight if the text no longer starts with it
      if (leadingCommand !== null) {
        const token = `/${leadingCommand}`;
        const afterToken = text[token.length];
        const stillValid =
          text.startsWith(token) && (afterToken === undefined || /\s/.test(afterToken));
        if (!stillValid) {
          setLeadingCommand(null);
        }
      }

      const cursorPos = getCursorOffset(container);
      const beforeCursor = text.slice(0, cursorPos);
      let handledPopover = false;

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
            if (popover.mentionOpen) {
              popover.setMentionOpen(false);
              popover.setMentionQuery('');
            }
            handledPopover = true;
          } else {
            popover.closeSlashPopover();
          }
        }
      }

      if (!handledPopover) {
        // Detect @ mention
        const lastAtIndex = beforeCursor.lastIndexOf('@');
        if (lastAtIndex !== -1) {
          const afterAt = beforeCursor.slice(lastAtIndex + 1);
          if (!afterAt.includes(' ')) {
            popover.setMentionQuery(afterAt);
            popover.setMentionOpen(true);
            if (popover.slashOpen) {
              popover.setSlashOpen(false);
              popover.setSlashQuery('');
            }
            handledPopover = true;
          }
        }
      }

      if (!handledPopover && popover.mentionOpen) {
        popover.setMentionOpen(false);
        popover.setMentionQuery('');
      }
      if (!handledPopover && popover.slashOpen) {
        popover.setSlashOpen(false);
        popover.setSlashQuery('');
      }
    },
    [popover, slashCommands, leadingCommand]
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

    // Append <ComponentName> tokens for selected browser elements so they
    // persist in JSONL content and are visible in the user message bubble.
    if (elementContexts.length > 0) {
      const elementSuffix = elementContexts.map((el) => `<${el.componentName}>`).join(' ');
      text = `${text} ${elementSuffix}`;
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
    setLeadingCommand(null);
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
      setAttachedContext((prev) => {
        if (
          prev.some(
            (item) => (item.type === 'file' || item.type === 'folder') && item.path === absolutePath
          )
        ) {
          return prev;
        }
        return [...prev, newContext];
      });

      // Remove the @query from input
      if (inputRef.current) {
        const cursorPos = getCursorOffset(inputRef.current);
        const text = inputRef.current.textContent;
        const beforeCursor = text.slice(0, cursorPos);
        const lastAtIndex = beforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
          const newText = text.slice(0, lastAtIndex) + text.slice(cursorPos);
          inputRef.current.textContent = newText;
          setInputText(newText);
          setCursorAtTextOffset(inputRef.current, lastAtIndex);
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
      const tokenEnd = start + 1 + popover.slashQuery.length;

      if (command.kind === 'skill') {
        // Skills become context chips — remove /query token from text
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

        const before = currentText.slice(0, start);
        const after = currentText.slice(tokenEnd).replace(/^ /, '');
        const newText = (before + after).trim();
        inputRef.current.textContent = newText;
        setInputText(newText);
      } else {
        // Regular commands: replace /query with /command + space as plain text.
        // The visual badge is rendered as a CSS overlay in ChatInput.tsx (like ghost text),
        // not as a DOM element inside the contentEditable. This avoids ALL WebKit cursor
        // issues — typed text never merges with the command because there's no styled
        // element in the DOM for the browser to extend.
        const before = currentText.slice(0, start);
        const after = currentText.slice(tokenEnd);
        const replacement = `/${command.name} `;
        const newText = before + replacement + after;
        inputRef.current.textContent = newText;
        setInputText(newText);
        // Set the leading command for blue highlighting (explicit state, not derived)
        if (start === 0) {
          setLeadingCommand(command.name);
        }

        // Place cursor after the command + space
        const cursorPos = start + replacement.length;
        const textNode = inputRef.current.firstChild;
        if (textNode !== null) {
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

      // Shift+Tab cycles the active backend mode when focus is inside the chat input.
      // Scoped here to preserve native reverse-tab navigation elsewhere.
      if (e.key === 'Tab' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();

        if (activeBackend === 'claude') {
          const nextMode: InputMode =
            inputMode === 'default' ? 'plan' : inputMode === 'plan' ? 'accept' : 'default';
          onModeChange(nextMode);
        } else {
          const currentIndex = OPENCODE_AGENTS.indexOf(selectedOcAgent);
          const nextIndex = (currentIndex + 1) % OPENCODE_AGENTS.length;
          const nextAgent = OPENCODE_AGENTS[nextIndex] ?? 'build';
          setSelectedOcAgent(nextAgent);
        }

        return;
      }

      // Enter sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      activeBackend,
      popover,
      slashCommands,
      handleSlashSelect,
      handleSend,
      inputMode,
      onModeChange,
      selectedOcAgent,
      setSelectedOcAgent,
    ]
  );

  // Paste handler — plain text paste with cursor restoration
  const handlePaste = useCallback((e: React.ClipboardEvent): void => {
    const container = inputRef.current;
    if (container === null) return;
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    const currentText = container.textContent;
    const { start, end } = getSelectionOffsets(container);
    const newText = currentText.slice(0, start) + pastedText + currentText.slice(end);
    const cursorPos = start + pastedText.length;
    container.textContent = newText;
    setInputText(newText);
    setCursorAtTextOffset(container, cursorPos);
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
    const base = 'w-full p-1 rounded-[14px] border border-border-menu bg-menu-bg shadow-menu';
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
    leadingCommand,
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
