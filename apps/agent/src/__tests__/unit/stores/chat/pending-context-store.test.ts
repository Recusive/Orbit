import {
  ADD_CONTEXT_CHIP_EVENT,
  ADD_FILE_CHIP_EVENT,
  dispatchAddContextChip,
  dispatchAddFileChip,
} from '@/lib/events/chat-context-events';
import {
  enqueueContext,
  enqueueFileChip,
  usePendingContextStore,
} from '@/stores/chat/pending-context-store';

const FILE_ITEM = {
  id: 'file-1',
  type: 'file' as const,
  path: '/repo/a.ts',
  name: 'a.ts',
};

const FILE_DETAIL = { path: '/repo/a.ts', name: 'a.ts', isDirectory: false };
const FOLDER_DETAIL = { path: '/repo/src', name: 'src', isDirectory: true };

describe('pending-context-store', () => {
  beforeEach(() => {
    usePendingContextStore.setState({ pending: [] });
  });

  it('enqueueContext adds an item to the pending queue', () => {
    usePendingContextStore.getState().enqueueContext(FILE_ITEM);
    expect(usePendingContextStore.getState().pending).toEqual([FILE_ITEM]);
  });

  it('enqueueFileChip converts and adds a file item', () => {
    enqueueFileChip(FILE_DETAIL);
    expect(usePendingContextStore.getState().pending).toEqual([
      {
        type: 'file',
        path: '/repo/a.ts',
        name: 'a.ts',
        id: expect.any(String),
      },
    ]);
  });

  it('enqueueContext deduplicates by type/path/name', () => {
    const store = usePendingContextStore.getState();
    store.enqueueContext(FILE_ITEM);
    store.enqueueContext({ ...FILE_ITEM, id: 'file-2' });
    expect(usePendingContextStore.getState().pending).toEqual([FILE_ITEM]);
  });

  it('drainContext returns all items and clears the queue', () => {
    const store = usePendingContextStore.getState();
    store.enqueueFileChip(FILE_DETAIL);
    store.enqueueFileChip(FOLDER_DETAIL);

    const drained = store.drainContext();
    expect(drained).toEqual([
      {
        type: 'file',
        path: '/repo/a.ts',
        name: 'a.ts',
        id: expect.any(String),
      },
      {
        type: 'folder',
        path: '/repo/src',
        name: 'src',
        id: expect.any(String),
      },
    ]);
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });

  it('enqueueContext helper pushes items from non-hook code', () => {
    enqueueContext(FILE_ITEM);
    expect(usePendingContextStore.getState().pending).toEqual([FILE_ITEM]);
  });

  it('module listener enqueues valid addFileChip events', () => {
    dispatchAddFileChip(FILE_DETAIL);
    expect(usePendingContextStore.getState().pending).toEqual([
      {
        type: 'file',
        path: '/repo/a.ts',
        name: 'a.ts',
        id: expect.any(String),
      },
    ]);
  });

  it('module listener enqueues valid addContextChip events', () => {
    dispatchAddContextChip(FILE_ITEM);
    expect(usePendingContextStore.getState().pending).toEqual([FILE_ITEM]);
  });

  it('module listener ignores invalid addFileChip payloads', () => {
    window.dispatchEvent(
      new CustomEvent(ADD_FILE_CHIP_EVENT, {
        detail: { path: 1, name: 'x', isDirectory: false },
      })
    );
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });

  it('module listener ignores invalid addContextChip payloads', () => {
    window.dispatchEvent(
      new CustomEvent(ADD_CONTEXT_CHIP_EVENT, {
        detail: { foo: 'bar' },
      })
    );
    expect(usePendingContextStore.getState().pending).toEqual([]);
  });
});
