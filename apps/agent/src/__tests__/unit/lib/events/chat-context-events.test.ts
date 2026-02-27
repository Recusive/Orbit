import {
  ADD_FILE_CHIP_EVENT,
  dispatchAddFileChip,
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
});
