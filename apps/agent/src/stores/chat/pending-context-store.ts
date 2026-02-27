import { create } from 'zustand';

import type { AddFileChipDetail } from '@/lib/events/chat-context-events';

import { ADD_FILE_CHIP_EVENT, isAddFileChipDetail } from '@/lib/events/chat-context-events';

interface PendingContextState {
  /** Queued file chips waiting for ChatInput to mount and drain */
  pending: AddFileChipDetail[];
  /** Add a chip to the queue */
  enqueue: (detail: AddFileChipDetail) => void;
  /** Drain and return all pending chips (clears the queue) */
  drain: () => AddFileChipDetail[];
}

export const usePendingContextStore = create<PendingContextState>()((set, get) => ({
  pending: [],
  enqueue: (detail) => {
    set((state) => {
      if (state.pending.some((item) => item.path === detail.path)) {
        return state;
      }
      return { pending: [...state.pending, detail] };
    });
  },
  drain: () => {
    const items = get().pending;
    if (items.length === 0) return items;
    set({ pending: [] });
    return items;
  },
}));

/** Non-hook enqueue entrypoint for non-React producers (drop handlers, context menus). */
export function enqueueFileChip(detail: AddFileChipDetail): void {
  usePendingContextStore.getState().enqueue(detail);
}

function handleAddFileEvent(event: Event): void {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isAddFileChipDetail(detail)) return;
  enqueueFileChip(detail);
}

if (typeof window !== 'undefined') {
  window.addEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);
    });
  }
}
