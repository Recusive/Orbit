import type { BrowserInfo } from '@/lib/api/browser';
import type { WebviewMessage } from '@/types/protocol';

const {
  browserBackMock,
  browserCloseMock,
  browserCreateMock,
  browserFocusMock,
  browserForwardMock,
  browserHideMock,
  browserNavigateMock,
  browserOpenDevToolsMock,
  browserReloadMock,
  browserSetBoundsMock,
  browserShowMock,
  browserStopMock,
} = vi.hoisted(() => ({
  browserBackMock: vi.fn<[], Promise<void>>(),
  browserCloseMock: vi.fn<[], Promise<void>>(),
  browserCreateMock: vi.fn<[number, number, number, number, string?], Promise<BrowserInfo>>(),
  browserFocusMock: vi.fn<[], Promise<void>>(),
  browserForwardMock: vi.fn<[], Promise<void>>(),
  browserHideMock: vi.fn<[], Promise<void>>(),
  browserNavigateMock: vi.fn<[string], Promise<void>>(),
  browserOpenDevToolsMock: vi.fn<[], Promise<void>>(),
  browserReloadMock: vi.fn<[], Promise<void>>(),
  browserSetBoundsMock: vi.fn<[number, number, number, number], Promise<void>>(),
  browserShowMock: vi.fn<[], Promise<void>>(),
  browserStopMock: vi.fn<[], Promise<void>>(),
}));

const { deactivateGrabMock, injectAndActivateGrabMock, syncBrowserVisibilityAfterCreateMock } =
  vi.hoisted(() => ({
    deactivateGrabMock: vi.fn<[], Promise<void>>(),
    injectAndActivateGrabMock: vi.fn<[], Promise<void>>(),
    syncBrowserVisibilityAfterCreateMock: vi.fn(),
  }));

vi.mock('@/lib/api', () => ({
  browserBack: browserBackMock,
  browserClose: browserCloseMock,
  browserCreate: browserCreateMock,
  browserFocus: browserFocusMock,
  browserForward: browserForwardMock,
  browserHide: browserHideMock,
  browserNavigate: browserNavigateMock,
  browserOpenDevTools: browserOpenDevToolsMock,
  browserReload: browserReloadMock,
  browserSetBounds: browserSetBoundsMock,
  browserShow: browserShowMock,
  browserStop: browserStopMock,
}));

vi.mock('@/lib/browser/react-grab-injector', () => ({
  deactivateGrab: deactivateGrabMock,
  injectAndActivateGrab: injectAndActivateGrabMock,
}));

vi.mock('@/lib/browser-overlay-coordination', () => ({
  syncBrowserVisibilityAfterCreate: syncBrowserVisibilityAfterCreateMock,
}));

import { handleBrowserCreate } from '@/hooks/agent/handlers/browser-handlers';
import { useBrowserLifecycleStore } from '@/stores/browser/browser-lifecycle-store';
import { useBrowserStore } from '@/stores/browser/browser-store';

describe('browser-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useBrowserLifecycleStore.getState().reset();
    useBrowserStore.getState().reset();
    browserCreateMock.mockResolvedValue({
      label: 'browser-1',
      url: 'https://example.com',
      active: true,
    });
    browserSetBoundsMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('syncs overlay visibility after creating the browser', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const message: Extract<WebviewMessage, { type: 'browser:create' }> = {
      type: 'browser:create',
      uuid: '00000000-0000-4000-8000-000000000001',
      bounds: {
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        url: 'https://example.com',
      },
    };

    await handleBrowserCreate(message);

    expect(browserCreateMock).toHaveBeenCalledWith(10, 20, 800, 600, 'https://example.com');
    expect(syncBrowserVisibilityAfterCreateMock).toHaveBeenCalledTimes(1);
    expect(useBrowserStore.getState().viewId).toBe('browser-1');
    expect(useBrowserLifecycleStore.getState().state).toBe('active');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'browser:created',
        request_uuid: message.uuid,
        label: 'browser-1',
        url: 'https://example.com',
      }),
      '*'
    );
  });
});
