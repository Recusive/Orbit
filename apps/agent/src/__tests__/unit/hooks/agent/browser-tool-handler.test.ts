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
  mockBrowserWaitForSelector,
  mockBrowserWaitForUrl,
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
  mockBrowserWaitForSelector: vi.fn<
    [string, string | undefined, number | undefined],
    Promise<void>
  >(),
  mockBrowserWaitForUrl: vi.fn<[string, number | undefined], Promise<void>>(),
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
  browserWaitForSelector: mockBrowserWaitForSelector,
  browserWaitForUrl: mockBrowserWaitForUrl,
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
    mockBrowserWaitForSelector.mockResolvedValue(undefined);
    mockBrowserWaitForUrl.mockResolvedValue(undefined);
  });

  describe('browser_screenshot', () => {
    it('returns parsed screenshot result on success', async () => {
      const payload = {
        filePath: '/tmp/orbit-screenshot-12345.jpg',
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
          filePath: null;
          metadata: { url: string; error: string };
        };
      };
      expect(typedResult.result.filePath).toBeNull();
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

  describe('runtime-backed tools', () => {
    it('browser_snapshot returns a degraded success payload when CSP blocks runtime injection', async () => {
      mockBrowserInfo.mockResolvedValue({
        label: 'browser-window',
        url: 'https://example.com',
        active: true,
      });
      mockBrowserEval
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('null')
        .mockRejectedValueOnce(new Error('CSP blocked inline script injection'));

      const result = await executeBrowserTool('browser_snapshot', {});

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        epoch: 1,
        snapshot: '- document [CSP blocked — runtime could not be injected]',
        refCount: 0,
        totalElements: 0,
        emittedElements: 0,
        truncated: false,
        url: 'https://example.com',
        title: '',
        durationMs: 0,
      });
    });

    it('browser_runtime_info reports unavailable when no browser is open', async () => {
      mockBrowserHas.mockResolvedValue(false);

      const result = await executeBrowserTool('browser_runtime_info', {});

      expect(result).toEqual({
        success: true,
        result: { available: false, reason: 'No browser open' },
      });
    });

    it('re-injects the orbit runtime when the bundled version does not match', async () => {
      mockBrowserEval
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('"0.9.0"')
        .mockResolvedValueOnce('"1.0.0"')
        .mockResolvedValueOnce(
          JSON.stringify({
            available: true,
            version: '1.0.0',
            epoch: 4,
            capabilities: {
              snapshot: true,
              refResolution: true,
              consoleCapture: true,
              networkCapture: true,
              storageAccess: true,
            },
          })
        );

      const result = await executeBrowserTool('browser_runtime_info', {});

      expect(result).toEqual({
        success: true,
        result: {
          available: true,
          version: '1.0.0',
          epoch: 4,
          capabilities: {
            snapshot: true,
            refResolution: true,
            consoleCapture: true,
            networkCapture: true,
            storageAccess: true,
          },
        },
      });
      expect(mockBrowserEval.mock.calls[2]?.[0]).toContain("const RUNTIME_VERSION = '1.0.0'");
    });

    it('browser_type selector fallback appends text instead of replacing the existing value', async () => {
      mockBrowserEval.mockResolvedValueOnce('false').mockResolvedValueOnce('{"typed":true}');

      const result = await executeBrowserTool('browser_type', {
        selector: '#search',
        text: 'abc',
      });

      expect(result).toEqual({ success: true, result: { typed: true } });
      const injectedScript = mockBrowserEval.mock.calls[1]?.[0] ?? '';
      expect(injectedScript).toContain('let currentValue =');
      expect(injectedScript).toContain('currentValue + character');
      expect(injectedScript).toContain("dispatchEvent(new Event('change'");
    });
  });

  describe('wait tools', () => {
    it('browser_wait_for_selector delegates to the browser wait API', async () => {
      const result = await executeBrowserTool('browser_wait_for_selector', {
        selector: '#ready',
        state: 'visible',
        timeout: 45000,
      });

      expect(mockBrowserWaitForSelector).toHaveBeenCalledWith('#ready', 'visible', 45000);
      expect(result).toEqual({ success: true, result: { matched: true } });
    });

    it('browser_wait_for_url clamps timeout to the phase maximum', async () => {
      const result = await executeBrowserTool('browser_wait_for_url', {
        url: '/dashboard/i',
        timeout: 999999,
      });

      expect(mockBrowserWaitForUrl).toHaveBeenCalledWith('/dashboard/i', 120000);
      expect(result).toEqual({ success: true, result: { matched: true } });
    });
  });
});
