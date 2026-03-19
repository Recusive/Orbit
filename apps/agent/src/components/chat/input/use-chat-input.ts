import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EFFORT_LEVEL_INFO,
  EFFORT_LEVELS,
  THINKING_MODE_DOTS,
  THINKING_MODE_INFO,
  THINKING_MODES,
} from './constants';
import { clearEditor, replaceTriggerRange } from './lexical';
import { getCommandAtIndex } from './slash-command-popover';
import { usePopoverNavigation } from './use-popover-navigation';

import type { SlashCommand, UseChatInputOptions, UseChatInputReturn } from './types';
import type { ContextItem, FileEntry } from '@/types/agent/context';
import type { InputMode } from '@/types/protocol';
import type { LexicalEditor } from 'lexical';

import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/utils/image-utils';
import { useSlashCommands, useCommandsStore } from '@/stores/agent';
import { useActiveBackend } from '@/stores/backend';
import { useElementContexts, useBrowserStore } from '@/stores/browser/browser-store';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useFileStore } from '@/stores/file/file-store';
import { useOcProviderStore, useOcSelectedModelSupportsImageInput } from '@/stores/opencode';

const logger = createLogger('ChatInput');
const OPENCODE_AGENTS = ['build', 'plan', 'explore'] as const;

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
  const ocSupportsImages = useOcSelectedModelSupportsImageInput();
  const selectedOcAgent = useOcProviderStore((state) => state.selectedAgent);
  const selectedOcProviderId = useOcProviderStore((state) => state.selectedProviderId);
  const selectedOcModelId = useOcProviderStore((state) => state.selectedModelId);
  const setSelectedOcAgent = useOcProviderStore((state) => state.setSelectedAgent);
  const supportsImages = activeBackend === 'opencode' ? ocSupportsImages : true;

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
  const editorElementRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<LexicalEditor | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previousActiveBackendRef = useRef(activeBackend);
  const previousOcModelKeyRef = useRef<string | null>(
    selectedOcProviderId !== null && selectedOcModelId !== null
      ? `${selectedOcProviderId}/${selectedOcModelId}`
      : null
  );
  const previousOcSupportsImagesRef = useRef(ocSupportsImages);
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
      editorRef.current?.focus();
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

  useEffect(() => {
    const ocModelKey =
      selectedOcProviderId !== null && selectedOcModelId !== null
        ? `${selectedOcProviderId}/${selectedOcModelId}`
        : null;
    const backendWasOpencode = previousActiveBackendRef.current === 'opencode';
    const backendIsOpencode = activeBackend === 'opencode';
    const modelChangedWhileOpencodeActive =
      backendWasOpencode && backendIsOpencode && previousOcModelKeyRef.current !== ocModelKey;
    const supportDroppedWhileOpencodeActive =
      backendWasOpencode &&
      backendIsOpencode &&
      previousOcSupportsImagesRef.current &&
      !ocSupportsImages;

    if ((modelChangedWhileOpencodeActive || supportDroppedWhileOpencodeActive) && !supportsImages) {
      setAttachedContext((prev) => {
        const next = prev.filter((item) => item.type !== 'image');
        return next.length === prev.length ? prev : next;
      });
    }

    previousActiveBackendRef.current = activeBackend;
    previousOcModelKeyRef.current = ocModelKey;
    previousOcSupportsImagesRef.current = ocSupportsImages;
  }, [activeBackend, ocSupportsImages, selectedOcModelId, selectedOcProviderId, supportsImages]);

  const handleTextChange = useCallback(
    (text: string): void => {
      setInputText(text);

      if (leadingCommand === null) {
        return;
      }

      const token = `/${leadingCommand}`;
      const afterToken = text[token.length];
      const stillValid =
        text.startsWith(token) && (afterToken === undefined || /\s/.test(afterToken));
      if (!stillValid) {
        setLeadingCommand(null);
      }
    },
    [leadingCommand]
  );

  // Send message handler
  const handleSend = useCallback((): void => {
    let text = inputText.trim();

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

    if (!text && images.length === 0) return;

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

    // Append element tokens for selected browser elements so they
    // persist in JSONL content and are visible in the user message bubble.
    // Format: [tagName: "preview..."] when textContent available, otherwise <componentName>
    if (elementContexts.length > 0) {
      const elementSuffix = elementContexts
        .map((el) => {
          if (el.textContent !== undefined && el.textContent !== '') {
            const preview = el.textContent.slice(0, 60);
            // Strip characters that could cause ambiguity with HTML or markdown
            const safePreview = preview.replace(/[<>""`]/g, '');
            return `[${el.tagName}: "${safePreview}"]`;
          }
          return `<${el.componentName}>`;
        })
        .join(' ');
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
    if (editorRef.current) {
      clearEditor(editorRef.current);
    }

    // Extract file paths from attached context
    const contextFiles = attachedContext
      .filter((item) => item.type === 'file' || item.type === 'folder')
      .map((item) => item.path);

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
  }, [attachedContext, clearElementContexts, elementContexts, inputText, onSend]);

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

      const nextText =
        inputText.slice(0, popover.mentionStartIndex) +
        inputText.slice(popover.mentionStartIndex + 1 + popover.mentionQuery.length);
      setInputText(nextText);

      if (editorRef.current !== null) {
        replaceTriggerRange(
          editorRef.current,
          {
            end: popover.mentionStartIndex + 1 + popover.mentionQuery.length,
            kind: 'mention',
            query: popover.mentionQuery,
            start: popover.mentionStartIndex,
          },
          ''
        );
      }

      popover.closeMentionPopover();
      editorRef.current?.focus();
    },
    [inputText, popover]
  );

  // Slash command selection handler — replaces only the /query token at slashStartIndex
  const handleSlashSelect = useCallback(
    (command: SlashCommand): void => {
      const start = popover.slashStartIndex;
      const end = start + 1 + popover.slashQuery.length;
      const triggerRange = {
        end,
        kind: 'slash' as const,
        query: popover.slashQuery,
        start,
      };

      if (command.kind === 'skill') {
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

        const nextText = inputText.slice(0, start) + inputText.slice(end);
        setInputText(nextText);
        if (editorRef.current !== null) {
          replaceTriggerRange(editorRef.current, triggerRange, '');
        }
        setLeadingCommand(null);
      } else {
        const replacement = `/${command.name} `;
        const nextText = inputText.slice(0, start) + replacement + inputText.slice(end);
        setInputText(nextText);
        if (editorRef.current !== null) {
          replaceTriggerRange(editorRef.current, triggerRange, replacement);
        }
        if (start === 0) {
          setLeadingCommand(command.name);
        } else {
          setLeadingCommand(null);
        }
      }

      popover.closeSlashPopover();
      editorRef.current?.focus();
    },
    [inputText, popover]
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

  const handleShiftTab = useCallback((): void => {
    if (activeBackend === 'claude') {
      const nextMode: InputMode =
        inputMode === 'default' ? 'plan' : inputMode === 'plan' ? 'accept' : 'default';
      onModeChange(nextMode);
      return;
    }

    const currentIndex = OPENCODE_AGENTS.indexOf(selectedOcAgent);
    const nextIndex = (currentIndex + 1) % OPENCODE_AGENTS.length;
    const nextAgent = OPENCODE_AGENTS[nextIndex] ?? 'build';
    setSelectedOcAgent(nextAgent);
  }, [activeBackend, inputMode, onModeChange, selectedOcAgent, setSelectedOcAgent]);

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

  const hasAttachedImages = attachedContext.some((item) => item.type === 'image');
  const isInputEmpty = inputText.length === 0 && !hasAttachedImages;

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
    editorElementRef,
    editorRef,
    imageInputRef,
    // Popover state
    popover,
    // Handlers
    handleShiftTab,
    handleTextChange,
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
