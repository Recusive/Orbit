/**
 * Commands Store - Single source of truth for slash commands
 *
 * This store ensures list_commands is only called once per app lifecycle,
 * preventing duplicate IPC calls when multiple components need command data.
 */

import { createLogger } from '@orbit/common/lib';
import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { SkillDefinition } from '@/lib/api';
import type { SlashCommandDefinition } from '@/types/protocol';

import {
  listCommands as fetchCommandsFromBackend,
  listSkills as fetchSkillsFromBackend,
  getWorkspacePath,
} from '@/lib/api';

const logger = createLogger('CommandsStore');

// ============================================
// Constants
// ============================================

/** Minimum delay between retry attempts after error (5 seconds) */
const RETRY_COOLDOWN_MS = 5000;

// ============================================
// Helpers
// ============================================

/**
 * Safely get workspace path with fallback.
 * Handles cases where Tauri isn't ready or no folder is open.
 */
async function getWorkspacePathSafe(): Promise<string> {
  try {
    return (await getWorkspacePath()) ?? '';
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn('getWorkspacePath failed, using empty string fallback', { error: errMsg });
    return '';
  }
}

// ============================================
// Types
// ============================================

export interface CommandsState {
  /** List of available slash commands */
  commands: SlashCommandDefinition[];

  /** List of available skills (from .claude/skills/) */
  skills: SkillDefinition[];

  /** Whether commands are currently being fetched */
  isLoading: boolean;

  /** Whether commands have been successfully fetched at least once */
  hasFetched: boolean;

  /** Whether skills have been successfully fetched at least once */
  hasSkillsFetched: boolean;

  /** Monotonic counter to prevent stale refresh responses from overwriting newer data */
  skillsRefreshSeq: number;

  /** Error message if fetch failed */
  error: string | null;

  /** Timestamp of last fetch attempt (for retry cooldown) */
  lastFetchAttempt: number | null;

  /** Fetch commands from backend (no-op if already fetched successfully, allows retry after error) */
  fetchCommands: () => Promise<void>;

  /** Fetch skills from backend (no-op if already fetched successfully) */
  fetchSkills: () => Promise<void>;

  /** Force refresh commands (ignores cache) */
  refreshCommands: () => Promise<void>;

  /** Force refresh skills (ignores cache, sequenced to prevent stale overwrites) */
  refreshSkills: () => Promise<void>;

  /** Clear error state and allow immediate retry */
  clearError: () => void;

  /** Add a command (after creation) */
  addCommand: (command: SlashCommandDefinition) => void;

  /** Update a command (after edit) */
  updateCommand: (command: SlashCommandDefinition) => void;

  /** Remove a command (after deletion) */
  removeCommand: (name: string, scope: string) => void;
}

// ============================================
// Store
// ============================================

export const useCommandsStore = create<CommandsState>()(
  immer((set, get) => ({
    commands: [],
    skills: [],
    isLoading: false,
    hasFetched: false,
    hasSkillsFetched: false,
    skillsRefreshSeq: 0,
    error: null,
    lastFetchAttempt: null,

    fetchCommands: async () => {
      const state = get();

      // Skip if already fetched successfully or currently loading
      if (state.hasFetched || state.isLoading) {
        logger.debug('Commands already fetched or loading, skipping');
        return;
      }

      // If there was an error, check cooldown to prevent retry spam
      if (state.error && state.lastFetchAttempt !== null) {
        const elapsed = Date.now() - state.lastFetchAttempt;
        if (elapsed < RETRY_COOLDOWN_MS) {
          logger.debug(
            `Retry cooldown active (${String(Math.round((RETRY_COOLDOWN_MS - elapsed) / 1000))}s remaining)`
          );
          return;
        }
        logger.info('Retrying command fetch after cooldown');
      }

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
        draft.lastFetchAttempt = Date.now();
      });

      try {
        const workspacePath = await getWorkspacePathSafe();
        const commands = await fetchCommandsFromBackend(workspacePath);

        logger.info(`Commands fetched successfully (${String(commands.length)} commands)`);

        set((draft) => {
          draft.commands = commands;
          draft.isLoading = false;
          draft.hasFetched = true;
          draft.error = null;
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch commands';
        logger.error(`Failed to fetch commands: ${errorMessage}`);

        set((draft) => {
          draft.isLoading = false;
          // DON'T set hasFetched = true on error - allow retry after cooldown
          draft.error = errorMessage;
        });
      }
    },

    refreshCommands: async () => {
      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        const workspacePath = await getWorkspacePathSafe();
        const commands = await fetchCommandsFromBackend(workspacePath);

        logger.info(`Commands refreshed successfully (${String(commands.length)} commands)`);

        set((draft) => {
          draft.commands = commands;
          draft.isLoading = false;
          draft.hasFetched = true;
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to refresh commands';
        logger.error(`Failed to refresh commands: ${errorMessage}`);

        set((draft) => {
          draft.isLoading = false;
          draft.error = errorMessage;
        });
      }
    },

    refreshSkills: async () => {
      const refreshSeq = get().skillsRefreshSeq + 1;

      set((draft) => {
        draft.skillsRefreshSeq = refreshSeq;
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        const workspacePath = await getWorkspacePathSafe();
        const skills = await fetchSkillsFromBackend(workspacePath);

        logger.info(`Skills refreshed successfully (${String(skills.length)} skills)`);

        set((draft) => {
          if (draft.skillsRefreshSeq !== refreshSeq) {
            return;
          }

          draft.skills = skills;
          draft.isLoading = false;
          draft.hasSkillsFetched = true;
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to refresh skills';
        logger.warn(`Failed to refresh skills: ${errorMessage}`);

        set((draft) => {
          if (draft.skillsRefreshSeq !== refreshSeq) {
            return;
          }

          draft.isLoading = false;
          // Skills are non-critical — don't set error to avoid blocking command UI
        });
      }
    },

    fetchSkills: async () => {
      const state = get();

      // Skip if already fetched successfully
      if (state.hasSkillsFetched) {
        return;
      }

      try {
        const workspacePath = await getWorkspacePathSafe();
        const skills = await fetchSkillsFromBackend(workspacePath);

        logger.info(`Skills fetched successfully (${String(skills.length)} skills)`);

        set((draft) => {
          draft.skills = skills;
          draft.hasSkillsFetched = true;
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch skills';
        logger.warn(`Failed to fetch skills: ${errorMessage}`);
        // Skills are non-critical — don't block on failure
      }
    },

    addCommand: (command: SlashCommandDefinition) => {
      set((draft) => {
        draft.commands.push(command);
      });
    },

    updateCommand: (command: SlashCommandDefinition) => {
      set((draft) => {
        const index = draft.commands.findIndex(
          (c) => c.name === command.name && c.scope === command.scope
        );
        if (index >= 0) {
          draft.commands[index] = command;
        }
      });
    },

    removeCommand: (name: string, scope: string) => {
      set((draft) => {
        draft.commands = draft.commands.filter((c) => !(c.name === name && c.scope === scope));
      });
    },

    clearError: () => {
      set((draft) => {
        draft.error = null;
        draft.lastFetchAttempt = null; // Reset cooldown to allow immediate retry
      });
    },
  }))
);

// ============================================
// Selectors
// ============================================

/** Get all commands */
export const useCommands = (): SlashCommandDefinition[] =>
  useCommandsStore((state) => state.commands);

/** Get loading state */
export const useCommandsLoading = (): boolean => useCommandsStore((state) => state.isLoading);

/** Get whether commands have been fetched */
export const useCommandsHasFetched = (): boolean => useCommandsStore((state) => state.hasFetched);

/** Get error state */
export const useCommandsError = (): string | null => useCommandsStore((state) => state.error);

/** Simplified commands for chat input (name + description only) */
export interface SlashCommand {
  name: string;
  description: string;
  /** Distinguishes skills from regular slash commands in the popover */
  kind?: 'command' | 'skill';
}

/**
 * Get simplified commands for chat input, including skills.
 *
 * Selects both commands and skills arrays (referentially stable from Zustand store)
 * then merges with useMemo. Skills appear after commands with `kind: 'skill'`.
 */
export const useSlashCommands = (): SlashCommand[] => {
  const commands = useCommandsStore((state) => state.commands);
  const skills = useCommandsStore((state) => state.skills);
  return useMemo(
    () => [
      ...commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description ?? '',
        kind: 'command' as const,
      })),
      ...skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        kind: 'skill' as const,
      })),
    ],
    [commands, skills]
  );
};
