import {
  executeBrowserTool,
  resetBrowserToolState,
} from '@/hooks/agent/handlers/browser-tool-handler';

const {
  mockBrowserBack,
  mockBrowserClose,
  mockBrowserEval,
  mockBrowserEvalAsync,
  mockBrowserForward,
  mockBrowserHas,
  mockBrowserInfo,
  mockBrowserNavigate,
  mockBrowserReload,
  mockBrowserScreenshot,
  mockBrowserToolResponse,
} = vi.hoisted(() => ({
  mockBrowserBack: vi.fn<[], Promise<void>>(),
  mockBrowserClose: vi.fn<[], Promise<void>>(),
  mockBrowserEval: vi.fn<[string], Promise<string>>(),
  mockBrowserEvalAsync: vi.fn<[string], Promise<string>>(),
  mockBrowserForward: vi.fn<[], Promise<void>>(),
  mockBrowserHas: vi.fn<[], Promise<boolean>>(),
  mockBrowserInfo: vi.fn<[], Promise<{ label: string; url: string; active: boolean } | null>>(),
  mockBrowserNavigate: vi.fn<[string], Promise<void>>(),
  mockBrowserReload: vi.fn<[], Promise<void>>(),
  mockBrowserScreenshot: vi.fn<[], Promise<string>>(),
  mockBrowserToolResponse: vi.fn<[string, unknown], Promise<void>>(),
}));

const { mockRecordBrowserActivityFromAI } = vi.hoisted(() => ({
  mockRecordBrowserActivityFromAI: vi.fn<() => void>(),
}));

const browserStoreState = vi.hoisted(() => ({
  isActive: false,
  navigation: { url: '' },
  reset: vi.fn<() => void>(),
  setPendingNavigationUrl: vi.fn<(url: string | null) => void>(),
}));

const browserLifecycleStoreState = vi.hoisted(() => ({
  reset: vi.fn<() => void>(),
}));

const uiStoreState = vi.hoisted(() => ({
  openBrowserTab: vi.fn<() => void>(),
  setActivityTab: vi.fn<(tab: string) => void>(),
}));

vi.mock('@/hooks/agent/handlers/browser-handlers', () => ({
  recordBrowserActivityFromAI: mockRecordBrowserActivityFromAI,
}));

vi.mock('@/lib/api/browser', () => ({
  browserBack: mockBrowserBack,
  browserClose: mockBrowserClose,
  browserEval: mockBrowserEval,
  browserEvalAsync: mockBrowserEvalAsync,
  browserForward: mockBrowserForward,
  browserHas: mockBrowserHas,
  browserInfo: mockBrowserInfo,
  browserNavigate: mockBrowserNavigate,
  browserReload: mockBrowserReload,
  browserScreenshot: mockBrowserScreenshot,
  browserToolResponse: mockBrowserToolResponse,
}));

vi.mock('@/stores/browser/browser-store', () => ({
  useBrowserStore: {
    getState: () => browserStoreState,
  },
}));

vi.mock('@/stores/browser/browser-lifecycle-store', () => ({
  useBrowserLifecycleStore: {
    getState: () => browserLifecycleStoreState,
  },
}));

vi.mock('@/stores/ui/ui-store', () => ({
  useUIStore: {
    getState: () => uiStoreState,
  },
}));

describe('browser-tool-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBrowserToolState();

    browserStoreState.isActive = false;
    browserStoreState.navigation.url = '';

    mockBrowserHas.mockResolvedValue(true);
    mockBrowserNavigate.mockResolvedValue(undefined);
    mockBrowserInfo.mockResolvedValue(null);
  });

  describe('browser_screenshot', () => {
    it('returns parsed screenshot result on success', async () => {
      const payload = {
        image: 'base64-image-data',
        mimeType: 'image/jpeg',
        metadata: { captureMethod: 'native_wkwebview' },
      };
      mockBrowserScreenshot.mockResolvedValue(JSON.stringify(payload));

      const result = await executeBrowserTool('browser_screenshot', {});

      expect(result).toEqual({ success: true, result: payload });
    });

    it('returns a precondition error when no browser exists', async () => {
      mockBrowserScreenshot.mockRejectedValue(new Error('No browser exists'));

      const result = await executeBrowserTool('browser_screenshot', {});

      expect(result).toEqual({ success: false, error: 'No browser exists' });
    });

    it('returns a precondition error when browser window is missing', async () => {
      mockBrowserScreenshot.mockRejectedValue(new Error('Browser window not found'));

      const result = await executeBrowserTool('browser_screenshot', {});

      expect(result).toEqual({ success: false, error: 'Browser window not found' });
    });

    it('falls back to metadata when capture fails after browser exists', async () => {
      mockBrowserScreenshot.mockRejectedValue(new Error('Screenshot capture failed: native error'));
      mockBrowserInfo.mockResolvedValue({
        label: 'browser-window',
        url: 'https://example.com',
        active: true,
      });

      const result = await executeBrowserTool('browser_screenshot', {});

      expect(result.success).toBe(true);
      const typedResult = result as {
        success: true;
        result: {
          image: null;
          metadata: { url: string; error: string };
        };
      };
      expect(typedResult.result.image).toBeNull();
      expect(typedResult.result.metadata.url).toBe('https://example.com');
      expect(typedResult.result.metadata.error).toContain('Screenshot capture failed:');
    });
  });

  describe('browser_open/browser_navigate stale state', () => {
    it('browser_open uses browserHas and resets stale store state', async () => {
      browserStoreState.isActive = true;
      mockBrowserHas.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await executeBrowserTool('browser_open', { url: 'about:blank' });

      expect(mockBrowserHas).toHaveBeenCalled();
      expect(mockBrowserNavigate).not.toHaveBeenCalled();
      expect(browserStoreState.reset).toHaveBeenCalledTimes(1);
      expect(browserLifecycleStoreState.reset).toHaveBeenCalledTimes(1);
      expect(browserStoreState.setPendingNavigationUrl).toHaveBeenCalledWith('about:blank');
      expect(result.success).toBe(true);
    });

    it('browser_navigate also resets stale state when backend browser is missing', async () => {
      browserStoreState.isActive = true;
      mockBrowserHas.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await executeBrowserTool('browser_navigate', { url: 'about:blank' });

      expect(mockBrowserHas).toHaveBeenCalled();
      expect(mockBrowserNavigate).not.toHaveBeenCalled();
      expect(browserStoreState.reset).toHaveBeenCalledTimes(1);
      expect(browserLifecycleStoreState.reset).toHaveBeenCalledTimes(1);
      expect(browserStoreState.setPendingNavigationUrl).toHaveBeenCalledWith('about:blank');
      expect(result.success).toBe(true);
    });
  });
});
