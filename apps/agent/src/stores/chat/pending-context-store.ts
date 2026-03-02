import { create } from 'zustand';

import type { AddFileChipDetail } from '@/lib/events/chat-context-events';
import type { ContextItem } from '@/types/agent/context';

import {
  ADD_CONTEXT_CHIP_EVENT,
  ADD_FILE_CHIP_EVENT,
  isAddFileChipDetail,
  isContextItemDetail,
} from '@/lib/events/chat-context-events';

interface PendingContextState {
  /** Queued context chips waiting for ChatInput to mount and drain. */
  pending: ContextItem[];
  /** Add a context chip to the queue. */
  enqueueContext: (item: ContextItem) => void;
  /** Add a file/folder chip to the queue. */
  enqueueFileChip: (detail: AddFileChipDetail) => void;
  /** Drain and return all pending chips (clears the queue). */
  drainContext: () => ContextItem[];
}

function isDuplicate(existing: ContextItem, incoming: ContextItem): boolean {
  return (
    existing.type === incoming.type &&
    existing.path === incoming.path &&
    (existing.name === incoming.name || existing.type === 'skill')
  );
}

function toContextItem(detail: AddFileChipDetail): ContextItem {
  return {
    id: crypto.randomUUID(),
    type: detail.isDirectory ? 'folder' : 'file',
    name: detail.name,
    path: detail.path,
  };
}

export const usePendingContextStore = create<PendingContextState>()((set, get) => ({
  pending: [],
  enqueueContext: (item) => {
    set((state) => {
      if (state.pending.some((existing) => isDuplicate(existing, item))) {
        return state;
      }
      return { pending: [...state.pending, item] };
    });
  },
  enqueueFileChip: (detail) => {
    get().enqueueContext(toContextItem(detail));
  },
  drainContext: () => {
    const items = get().pending;
    if (items.length === 0) return items;
    set({ pending: [] });
    return items;
  },
}));

/** Non-hook enqueue entrypoint for non-React producers (drop handlers, dialogs, context menus). */
export function enqueueFileChip(detail: AddFileChipDetail): void {
  usePendingContextStore.getState().enqueueFileChip(detail);
}

/** Non-hook enqueue entrypoint for generic context chips. */
export function enqueueContext(item: ContextItem): void {
  usePendingContextStore.getState().enqueueContext(item);
}

function handleAddFileEvent(event: Event): void {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isAddFileChipDetail(detail)) return;
  enqueueFileChip(detail);
}

function handleAddContextEvent(event: Event): void {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isContextItemDetail(detail)) return;
  enqueueContext(detail);
}

if (typeof window !== 'undefined') {
  window.addEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);
  window.addEventListener(ADD_CONTEXT_CHIP_EVENT, handleAddContextEvent);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);
      window.removeEventListener(ADD_CONTEXT_CHIP_EVENT, handleAddContextEvent);
    });
  }
}
