import {
  ADD_CONTEXT_CHIP_EVENT,
  ADD_FILE_CHIP_EVENT,
  dispatchAddContextChip,
  dispatchAddFileChip,
  isContextItemDetail,
  isAddFileChipDetail,
} from '@/lib/events/chat-context-events';

describe('chat-context-events', () => {
  describe('isAddFileChipDetail', () => {
    it('accepts a valid payload', () => {
      expect(
        isAddFileChipDetail({
          path: '/a/b.ts',
          name: 'b.ts',
          isDirectory: false,
        })
      ).toBe(true);
    });

    it('rejects a missing or empty path', () => {
      expect(
        isAddFileChipDetail({
          path: '',
          name: 'b.ts',
          isDirectory: false,
        })
      ).toBe(false);
    });

    it('rejects wrong field types', () => {
      expect(
        isAddFileChipDetail({
          path: 123,
          name: 'b.ts',
          isDirectory: 'yes',
        })
      ).toBe(false);
    });

    it('rejects null, undefined, and non-objects', () => {
      expect(isAddFileChipDetail(null)).toBe(false);
      expect(isAddFileChipDetail(undefined)).toBe(false);
      expect(isAddFileChipDetail('not-an-object')).toBe(false);
      expect(isAddFileChipDetail(42)).toBe(false);
    });
  });

  describe('dispatchAddFileChip', () => {
    it('fires a custom event with the provided detail payload', () => {
      const detail = { path: '/x/y.ts', name: 'y.ts', isDirectory: false };
      const handler = vi.fn((event: Event) => {
        const customEvent = event as CustomEvent<unknown>;
        expect(customEvent.detail).toEqual(detail);
      });

      window.addEventListener(ADD_FILE_CHIP_EVENT, handler);
      dispatchAddFileChip(detail);

      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener(ADD_FILE_CHIP_EVENT, handler);
    });
  });

  describe('isContextItemDetail', () => {
    it('accepts a valid context item payload', () => {
      expect(
        isContextItemDetail({
          id: 'ctx-1',
          type: 'file',
          name: 'README.md',
          path: '/repo/README.md',
        })
      ).toBe(true);
    });

    it('rejects objects with extra keys due strict schema', () => {
      expect(
        isContextItemDetail({
          id: 'ctx-1',
          type: 'file',
          name: 'README.md',
          path: '/repo/README.md',
          source: 'vault',
        })
      ).toBe(false);
    });
  });

  describe('dispatchAddContextChip', () => {
    it('fires a custom event with context item detail', () => {
      const detail = {
        id: 'ctx-1',
        type: 'skill' as const,
        name: 'checks',
        path: 'checks',
      };
      const handler = vi.fn((event: Event) => {
        const customEvent = event as CustomEvent<unknown>;
        expect(customEvent.detail).toEqual(detail);
      });

      window.addEventListener(ADD_CONTEXT_CHIP_EVENT, handler);
      dispatchAddContextChip(detail);

      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener(ADD_CONTEXT_CHIP_EVENT, handler);
    });
  });
});
