import { ADD_FILE_CHIP_EVENT, dispatchAddFileChip } from '@/lib/events/chat-context-events';
import { enqueueFileChip, usePendingContextStore } from '@/stores/chat/pending-context-store';

const FILE_A = { path: '/repo/a.ts', name: 'a.ts', isDirectory: false };
const FILE_B = { path: '/repo/src', name: 'src', isDirectory: true };

describe('pending-context-store', () => {
  beforeEach(() => {
    usePendingContextStore.setState({ pending: [] });
  });

  it('enqueue adds an item to the pending array', () => {
    usePendingContextStore.getState().enqueue(FILE_A);

    expect(usePendingContextStore.getState().pending).toEqual([FILE_A]);
  });

  it('enqueueFileChip adds an item via non-hook entrypoint', () => {
    enqueueFileChip(FILE_A);

    expect(usePendingContextStore.getState().pending).toEqual([FILE_A]);
  });

  it('enqueue deduplicates by path', () => {
    const store = usePendingContextStore.getState();
    store.enqueue(FILE_A);
    store.enqueue({ ...FILE_A, name: 'renamed.ts' });

    expect(usePendingContextStore.getState().pending).toEqual([FILE_A]);
  });

  it('drain returns all items and clears the queue', () => {
    const store = usePendingContextStore.getState();
    store.enqueue(FILE_A);
    store.enqueue(FILE_B);

    const drained = store.drain();

    expect(drained).toEqual([FILE_A, FILE_B]);
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });

  it('drain returns an empty array when queue is empty', () => {
    const drained = usePendingContextStore.getState().drain();

    expect(drained).toEqual([]);
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });

  it('module-level listener enqueues valid addFileChip events', () => {
    dispatchAddFileChip(FILE_A);

    expect(usePendingContextStore.getState().pending).toEqual([FILE_A]);
  });

  it('module-level listener ignores invalid addFileChip events', () => {
    window.dispatchEvent(
      new CustomEvent(ADD_FILE_CHIP_EVENT, {
        detail: { path: 123, name: 'x', isDirectory: false },
      })
    );

    expect(usePendingContextStore.getState().pending).toEqual([]);
  });
});
