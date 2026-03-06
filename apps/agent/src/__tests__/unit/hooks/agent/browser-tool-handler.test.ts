import {
  executeBrowserTool,
  resetBrowserToolState,
} from '@/hooks/agent/handlers/browser-tool-handler';

const {
  mockBrowserBack,
  mockBrowserClose,
  mockBrowserEnsureRuntime,
  mockBrowserEval,
  mockBrowserForward,
  mockBrowserGetTitle,
  mockBrowserGetUrl,
  mockBrowserHas,
  mockBrowserInfo,
  mockBrowserInvokeRuntime,
  mockBrowserNavigate,
  mockBrowserReload,
  mockBrowserRuntimeVersion,
  mockBrowserScreenshot,
  mockBrowserToolResponse,
  mockBrowserWaitForSelector,
  mockBrowserWaitForUrl,
} = vi.hoisted(() => ({
  mockBrowserBack: vi.fn<[], Promise<void>>(),
  mockBrowserClose: vi.fn<[], Promise<void>>(),
  mockBrowserEnsureRuntime: vi.fn<[], Promise<void>>(),
  mockBrowserEval: vi.fn<[string], Promise<string>>(),
  mockBrowserForward: vi.fn<[], Promise<void>>(),
  mockBrowserGetTitle: vi.fn<[], Promise<string>>(),
  mockBrowserGetUrl: vi.fn<[], Promise<string>>(),
  mockBrowserHas: vi.fn<[], Promise<boolean>>(),
  mockBrowserInfo: vi.fn<[], Promise<{ label: string; url: string; active: boolean } | null>>(),
  mockBrowserInvokeRuntime: vi.fn<[string, unknown[]], Promise<string>>(),
  mockBrowserNavigate: vi.fn<[string], Promise<void>>(),
  mockBrowserReload: vi.fn<[], Promise<void>>(),
  mockBrowserRuntimeVersion: vi.fn<[], Promise<string | null>>(),
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
  browserEnsureRuntime: mockBrowserEnsureRuntime,
  browserEval: mockBrowserEval,
  browserForward: mockBrowserForward,
  browserGetTitle: mockBrowserGetTitle,
  browserGetUrl: mockBrowserGetUrl,
  browserHas: mockBrowserHas,
  browserInfo: mockBrowserInfo,
  browserInvokeRuntime: mockBrowserInvokeRuntime,
  browserNavigate: mockBrowserNavigate,
  browserReload: mockBrowserReload,
  browserRuntimeVersion: mockBrowserRuntimeVersion,
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

    mockBrowserEnsureRuntime.mockResolvedValue(undefined);
    mockBrowserEval.mockResolvedValue('null');
    mockBrowserGetTitle.mockResolvedValue('{"title":"Example Domain"}');
    mockBrowserGetUrl.mockResolvedValue('{"url":"https://example.com"}');
    mockBrowserHas.mockResolvedValue(true);
    mockBrowserInfo.mockResolvedValue(null);
    mockBrowserInvokeRuntime.mockResolvedValue('{}');
    mockBrowserNavigate.mockResolvedValue(undefined);
    mockBrowserReload.mockResolvedValue(undefined);
    mockBrowserRuntimeVersion.mockResolvedValue('1.0.0');
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
      expect(result.result).toEqual({
        filePath: null,
        metadata: {
          url: 'https://example.com',
          error: 'Screenshot capture failed: Screenshot capture failed: native error',
        },
      });
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
    it('browser_snapshot invokes the runtime through the typed command path', async () => {
      mockBrowserInfo.mockResolvedValue({
        label: 'browser-window',
        url: 'https://example.com',
        active: true,
      });
      mockBrowserInvokeRuntime.mockResolvedValue(
        JSON.stringify({
          epoch: 4,
          snapshot: '- document',
          refCount: 1,
          totalElements: 1,
          emittedElements: 1,
          truncated: false,
          url: 'https://example.com',
          title: 'Example Domain',
          durationMs: 3,
        })
      );

      const result = await executeBrowserTool('browser_snapshot', {
        interactive: true,
        cursor: false,
        compact: false,
      });

      expect(mockBrowserEnsureRuntime).toHaveBeenCalledTimes(1);
      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('snapshot', [
        {
          interactive: true,
          cursor: false,
          compact: false,
        },
      ]);
      expect(result).toEqual({
        success: true,
        result: {
          epoch: 4,
          snapshot: '- document',
          refCount: 1,
          totalElements: 1,
          emittedElements: 1,
          truncated: false,
          url: 'https://example.com',
          title: 'Example Domain',
          durationMs: 3,
        },
      });
    });

    it('browser_snapshot returns a degraded success payload when the runtime is unavailable', async () => {
      mockBrowserInfo.mockResolvedValue({
        label: 'browser-window',
        url: 'https://example.com',
        active: true,
      });
      mockBrowserEnsureRuntime.mockRejectedValue(new Error('Orbit runtime unavailable.'));

      const result = await executeBrowserTool('browser_snapshot', {});

      expect(result).toEqual({
        success: true,
        result: {
          epoch: 1,
          snapshot: '- document [Orbit runtime unavailable]',
          refCount: 0,
          totalElements: 0,
          emittedElements: 0,
          truncated: false,
          url: 'https://example.com',
          title: '',
          durationMs: 0,
        },
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

    it('browser_runtime_info reports runtime unavailable when ensure fails', async () => {
      mockBrowserEnsureRuntime.mockRejectedValue(new Error('Orbit runtime unavailable.'));

      const result = await executeBrowserTool('browser_runtime_info', {});

      expect(result).toEqual({
        success: true,
        result: { available: false, reason: 'Runtime unavailable' },
      });
    });

    it('browser_click with selector target uses browserInvokeRuntime', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"clicked":true}');

      const result = await executeBrowserTool('browser_click', {
        selector: '#submit',
      });

      expect(mockBrowserEnsureRuntime).toHaveBeenCalledTimes(1);
      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('click', [{ selector: '#submit' }]);
      expect(result).toEqual({ success: true, result: { clicked: true } });
    });

    it('browser_type with selector target uses browserInvokeRuntime', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"typed":true}');

      const result = await executeBrowserTool('browser_type', {
        selector: '#search',
        text: 'abc',
      });

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('type', [
        { selector: '#search' },
        'abc',
      ]);
      expect(result).toEqual({ success: true, result: { typed: true } });
    });

    it('browser_get_text without a target defaults to document body', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"text":"Example body"}');

      const result = await executeBrowserTool('browser_get_text', {});

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('getText', [{ selector: 'body' }]);
      expect(result).toEqual({ success: true, result: { text: 'Example body' } });
    });

    it('browser_get_text with a selector target uses browserInvokeRuntime', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"text":"Hello world"}');

      const result = await executeBrowserTool('browser_get_text', {
        selector: '.content',
      });

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('getText', [{ selector: '.content' }]);
      expect(result).toEqual({ success: true, result: { text: 'Hello world' } });
    });

    it('browser_get_html without a target defaults to body and passes outer=false', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"html":"<div>Example</div>"}');

      const result = await executeBrowserTool('browser_get_html', {});

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('getHtml', [
        { selector: 'body' },
        false,
      ]);
      expect(result).toEqual({ success: true, result: { html: '<div>Example</div>' } });
    });

    it('browser_get_html with a selector target uses browserInvokeRuntime', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"html":"<section>Example</section>"}');

      const result = await executeBrowserTool('browser_get_html', {
        selector: '.panel',
        outer: true,
      });

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('getHtml', [
        { selector: '.panel' },
        true,
      ]);
      expect(result).toEqual({ success: true, result: { html: '<section>Example</section>' } });
    });

    it('browser_count uses the runtime count method', async () => {
      mockBrowserInvokeRuntime.mockResolvedValue('{"count":3}');

      const result = await executeBrowserTool('browser_count', {
        selector: '.row',
      });

      expect(mockBrowserInvokeRuntime).toHaveBeenCalledWith('count', ['.row']);
      expect(result).toEqual({ success: true, result: { count: 3 } });
    });
  });

  describe('native browser metadata tools', () => {
    it('browser_get_url uses browserGetUrl instead of eval', async () => {
      mockBrowserGetUrl.mockResolvedValue('{"url":"https://news.ycombinator.com/"}');

      const result = await executeBrowserTool('browser_get_url', {});

      expect(mockBrowserGetUrl).toHaveBeenCalledTimes(1);
      expect(mockBrowserEval).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        result: { url: 'https://news.ycombinator.com/' },
      });
    });

    it('browser_get_title uses browserGetTitle instead of eval', async () => {
      mockBrowserGetTitle.mockResolvedValue('{"title":"Hacker News"}');

      const result = await executeBrowserTool('browser_get_title', {});

      expect(mockBrowserGetTitle).toHaveBeenCalledTimes(1);
      expect(mockBrowserEval).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        result: { title: 'Hacker News' },
      });
    });
  });

  describe('browser_eval', () => {
    it('still uses browserEval for the user-facing eval tool', async () => {
      mockBrowserEval.mockResolvedValue('{"value":42}');

      const result = await executeBrowserTool('browser_eval', {
        script: 'return { value: 42 }',
      });

      expect(mockBrowserEval).toHaveBeenCalledWith('return { value: 42 }');
      expect(result).toEqual({ success: true, result: { value: 42 } });
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
