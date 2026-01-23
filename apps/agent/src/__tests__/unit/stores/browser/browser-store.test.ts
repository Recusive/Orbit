/**
 * Tests for browser-store.ts
 *
 * Purpose: Manages webview browser state - session, navigation, element selection.
 * Persisted to localStorage for viewId and isActive (survives webview reloads).
 */

import type { ReactElementContext } from '@/types/protocol';

import { useBrowserStore } from '@/stores/browser/browser-store';

// Mock localStorage using globalThis assignment
// Store mock functions separately to avoid unbound-method lint errors
let mockStore: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockStore[key] ?? null);
const mockSetItem = vi.fn((key: string, value: string) => {
  mockStore[key] = value;
});
const mockRemoveItem = vi.fn((key: string) => {
  Reflect.deleteProperty(mockStore, key);
});
const mockClear = vi.fn(() => {
  mockStore = {};
});

const localStorageMock: Storage = {
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  clear: mockClear,
  key: (): string | null => null,
  get length(): number {
    return Object.keys(mockStore).length;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Helper to create mock element context
function createMockElement(selector: string): ReactElementContext {
  return {
    componentName: 'TestComponent',
    filePath: '/src/components/Test.tsx',
    lineNumber: 10,
    props: {},
    componentStack: ['App', 'TestComponent'],
    tagName: 'div',
    selector,
    outerHTML: `<div id="${selector}">Test</div>`,
    displayName: 'TestComponent',
  };
}

describe('browser-store', () => {
  beforeEach(() => {
    // Reset store
    const { reset } = useBrowserStore.getState();
    reset();
    mockClear();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with null viewId', () => {
      const state = useBrowserStore.getState();
      expect(state.viewId).toBeNull();
    });

    it('should start with isCreating false', () => {
      const state = useBrowserStore.getState();
      expect(state.isCreating).toBe(false);
    });

    it('should start with isActive false', () => {
      const state = useBrowserStore.getState();
      expect(state.isActive).toBe(false);
    });

    it('should have empty navigation state', () => {
      const state = useBrowserStore.getState();
      expect(state.navigation).toEqual({
        url: '',
        title: '',
        canGoBack: null, // null = unknown, treated as enabled in UI
        canGoForward: null,
        isLoading: false,
      });
    });

    it('should have empty element contexts', () => {
      const state = useBrowserStore.getState();
      expect(state.elementContexts).toEqual([]);
    });
  });

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  describe('setCreating', () => {
    it('should set isCreating to true', () => {
      const { setCreating } = useBrowserStore.getState();
      setCreating(true);
      expect(useBrowserStore.getState().isCreating).toBe(true);
    });

    it('should clear error when setting isCreating to true', () => {
      const { setError, setCreating } = useBrowserStore.getState();
      setError('Previous error');
      setCreating(true);
      expect(useBrowserStore.getState().error).toBeNull();
    });
  });

  describe('setViewId', () => {
    it('should set viewId and isActive', () => {
      const { setViewId } = useBrowserStore.getState();
      setViewId('view-123');

      const state = useBrowserStore.getState();
      expect(state.viewId).toBe('view-123');
      expect(state.isActive).toBe(true);
      expect(state.isCreating).toBe(false);
    });

    it('should persist viewId to localStorage', () => {
      const { setViewId } = useBrowserStore.getState();
      setViewId('view-123');

      expect(mockSetItem).toHaveBeenCalledWith('orbit-browser-viewId', 'view-123');
      expect(mockSetItem).toHaveBeenCalledWith('orbit-browser-isActive', 'true');
    });

    it('should clear state when viewId is null', () => {
      const { setViewId } = useBrowserStore.getState();
      setViewId('view-123');
      setViewId(null);

      const state = useBrowserStore.getState();
      expect(state.viewId).toBeNull();
      expect(state.isActive).toBe(false);
    });

    it('should remove from localStorage when viewId is null', () => {
      const { setViewId } = useBrowserStore.getState();
      setViewId('view-123');
      setViewId(null);

      expect(mockRemoveItem).toHaveBeenCalledWith('orbit-browser-viewId');
      expect(mockRemoveItem).toHaveBeenCalledWith('orbit-browser-isActive');
    });
  });

  describe('setActive', () => {
    it('should set isActive', () => {
      const { setActive } = useBrowserStore.getState();
      setActive(true);
      expect(useBrowserStore.getState().isActive).toBe(true);
    });

    it('should persist to localStorage', () => {
      const { setActive } = useBrowserStore.getState();
      setActive(true);
      expect(mockSetItem).toHaveBeenCalledWith('orbit-browser-isActive', 'true');
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const { setViewId, setNavigation, addElementContext, setError, reset } =
        useBrowserStore.getState();

      // Setup some state
      setViewId('view-123');
      setNavigation({ url: 'https://example.com', title: 'Test' });
      addElementContext(createMockElement('#btn'));
      setError('Some error');

      // Reset
      reset();

      const state = useBrowserStore.getState();
      expect(state.viewId).toBeNull();
      expect(state.isActive).toBe(false);
      expect(state.navigation.url).toBe('');
      expect(state.elementContexts).toEqual([]);
      expect(state.error).toBeNull();
    });

    it('should clear localStorage', () => {
      const { setViewId, reset } = useBrowserStore.getState();
      setViewId('view-123');
      vi.clearAllMocks();

      reset();

      expect(mockRemoveItem).toHaveBeenCalledWith('orbit-browser-viewId');
      expect(mockRemoveItem).toHaveBeenCalledWith('orbit-browser-isActive');
    });
  });

  // ============================================================================
  // Navigation
  // ============================================================================

  describe('setNavigation', () => {
    it('should update navigation partially', () => {
      const { setNavigation } = useBrowserStore.getState();

      setNavigation({ url: 'https://example.com' });
      expect(useBrowserStore.getState().navigation.url).toBe('https://example.com');
      expect(useBrowserStore.getState().navigation.title).toBe(''); // Unchanged

      setNavigation({ title: 'Example Site', canGoBack: true });
      expect(useBrowserStore.getState().navigation.url).toBe('https://example.com'); // Unchanged
      expect(useBrowserStore.getState().navigation.title).toBe('Example Site');
      expect(useBrowserStore.getState().navigation.canGoBack).toBe(true);
    });
  });

  describe('setLoading', () => {
    it('should set navigation.isLoading', () => {
      const { setLoading } = useBrowserStore.getState();

      setLoading(true);
      expect(useBrowserStore.getState().navigation.isLoading).toBe(true);

      setLoading(false);
      expect(useBrowserStore.getState().navigation.isLoading).toBe(false);
    });
  });

  // ============================================================================
  // Element Selection
  // ============================================================================

  describe('setSelectingElement', () => {
    it('should enable selection mode', () => {
      const { setSelectingElement } = useBrowserStore.getState();
      setSelectingElement(true);
      expect(useBrowserStore.getState().isSelectingElement).toBe(true);
    });

    it('should clear selectedElement when disabling selection mode', () => {
      const { setSelectingElement, setSelectedElement } = useBrowserStore.getState();

      setSelectingElement(true);
      setSelectedElement(createMockElement('#test'));
      setSelectingElement(false);

      expect(useBrowserStore.getState().selectedElement).toBeNull();
    });
  });

  describe('setSelectedElement', () => {
    it('should set selected element and exit selection mode', () => {
      const { setSelectingElement, setSelectedElement } = useBrowserStore.getState();

      setSelectingElement(true);
      const element = createMockElement('#btn');
      setSelectedElement(element);

      const state = useBrowserStore.getState();
      expect(state.selectedElement).toEqual(element);
      expect(state.isSelectingElement).toBe(false);
    });

    it('should auto-add element to contexts', () => {
      const { setSelectedElement } = useBrowserStore.getState();

      const element = createMockElement('#btn');
      setSelectedElement(element);

      expect(useBrowserStore.getState().elementContexts).toContainEqual(element);
    });

    it('should not add duplicate element to contexts', () => {
      const { setSelectedElement, addElementContext } = useBrowserStore.getState();

      const element = createMockElement('#btn');
      addElementContext(element);
      setSelectedElement(element); // Same selector

      expect(useBrowserStore.getState().elementContexts).toHaveLength(1);
    });

    it('should clear selected element when set to null', () => {
      const { setSelectedElement } = useBrowserStore.getState();

      setSelectedElement(createMockElement('#btn'));
      setSelectedElement(null);

      expect(useBrowserStore.getState().selectedElement).toBeNull();
    });
  });

  // ============================================================================
  // Element Context Management
  // ============================================================================

  describe('addElementContext', () => {
    it('should add element to contexts', () => {
      const { addElementContext } = useBrowserStore.getState();

      const element = createMockElement('#btn1');
      addElementContext(element);

      expect(useBrowserStore.getState().elementContexts).toHaveLength(1);
      expect(useBrowserStore.getState().elementContexts[0]).toEqual(element);
    });

    it('should not add duplicate by selector', () => {
      const { addElementContext } = useBrowserStore.getState();

      const element1 = createMockElement('#btn');
      const element2 = createMockElement('#btn'); // Same selector

      addElementContext(element1);
      addElementContext(element2);

      expect(useBrowserStore.getState().elementContexts).toHaveLength(1);
    });

    it('should add multiple unique elements', () => {
      const { addElementContext } = useBrowserStore.getState();

      addElementContext(createMockElement('#btn1'));
      addElementContext(createMockElement('#btn2'));
      addElementContext(createMockElement('#btn3'));

      expect(useBrowserStore.getState().elementContexts).toHaveLength(3);
    });
  });

  describe('removeElementContext', () => {
    it('should remove element at index', () => {
      const { addElementContext, removeElementContext } = useBrowserStore.getState();

      addElementContext(createMockElement('#btn1'));
      addElementContext(createMockElement('#btn2'));
      addElementContext(createMockElement('#btn3'));

      removeElementContext(1); // Remove middle element

      const selectors = useBrowserStore.getState().elementContexts.map((e) => e.selector);
      expect(selectors).toEqual(['#btn1', '#btn3']);
    });
  });

  describe('clearElementContexts', () => {
    it('should clear all element contexts', () => {
      const { addElementContext, clearElementContexts } = useBrowserStore.getState();

      addElementContext(createMockElement('#btn1'));
      addElementContext(createMockElement('#btn2'));

      clearElementContexts();

      expect(useBrowserStore.getState().elementContexts).toEqual([]);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('setError', () => {
    it('should set error message', () => {
      const { setError } = useBrowserStore.getState();
      setError('Connection failed');
      expect(useBrowserStore.getState().error).toBe('Connection failed');
    });

    it('should clear error when set to null', () => {
      const { setError } = useBrowserStore.getState();
      setError('Error');
      setError(null);
      expect(useBrowserStore.getState().error).toBeNull();
    });
  });

  // ============================================================================
  // Selector Hooks
  // ============================================================================

  describe('selector hooks', () => {
    // Testing selector logic without React
    it('useBrowserViewId should select viewId', () => {
      const { setViewId } = useBrowserStore.getState();
      setViewId('view-123');

      // Simulate selector
      const selector = (state: ReturnType<typeof useBrowserStore.getState>): string | null =>
        state.viewId;
      expect(selector(useBrowserStore.getState())).toBe('view-123');
    });

    it('useBrowserUrl should select navigation.url', () => {
      const { setNavigation } = useBrowserStore.getState();
      setNavigation({ url: 'https://example.com' });

      const selector = (state: ReturnType<typeof useBrowserStore.getState>): string =>
        state.navigation.url;
      expect(selector(useBrowserStore.getState())).toBe('https://example.com');
    });
  });
});
