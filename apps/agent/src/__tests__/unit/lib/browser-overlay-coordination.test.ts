import * as browserApi from '@/lib/api/browser';
import {
  getOverlayCount,
  onOverlayMount,
  onOverlayUnmount,
  resetBrowserOverlayCoordination,
  shouldBrowserBeVisible,
  syncBrowserVisibilityAfterCreate,
} from '@/lib/browser-overlay-coordination';
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';

const browserHideMock = vi.spyOn(browserApi, 'browserHide');
const browserShowMock = vi.spyOn(browserApi, 'browserShow');

interface DeferredPromise<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe('browser-overlay-coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetBrowserOverlayCoordination();
    useBrowserStore.getState().reset();
    useUIStore.setState(useUIStore.getInitialState(), true);
    browserHideMock.mockResolvedValue(undefined);
    browserShowMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetBrowserOverlayCoordination();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('requires an active browser view, visible browser tab, open review panel, and no overlays', () => {
    useBrowserStore.getState().setViewId('browser-1');
    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'browser' });

    expect(shouldBrowserBeVisible()).toBe(true);

    onOverlayMount();
    expect(shouldBrowserBeVisible()).toBe(false);

    resetBrowserOverlayCoordination();
    expect(shouldBrowserBeVisible()).toBe(true);

    useUIStore.setState({ reviewPanelOpen: false });
    expect(shouldBrowserBeVisible()).toBe(false);

    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'source' });
    expect(shouldBrowserBeVisible()).toBe(false);

    useBrowserStore.getState().reset();
    expect(shouldBrowserBeVisible()).toBe(false);
  });

  it('keeps the browser hidden until all nested overlays close', async () => {
    useBrowserStore.getState().setViewId('browser-1');
    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'browser' });

    onOverlayMount();
    onOverlayMount();

    expect(getOverlayCount()).toBe(2);

    onOverlayUnmount();
    await vi.advanceTimersByTimeAsync(16);
    await flushAsyncWork();
    expect(browserShowMock).not.toHaveBeenCalled();

    onOverlayUnmount();
    await vi.advanceTimersByTimeAsync(16);
    await flushAsyncWork();
    expect(browserShowMock).toHaveBeenCalledTimes(1);
  });

  it('shows only after the last overlay closes and the debounce elapses', async () => {
    useBrowserStore.getState().setViewId('browser-1');
    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'browser' });

    onOverlayMount();
    onOverlayUnmount();

    expect(browserShowMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15);
    expect(browserShowMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushAsyncWork();
    expect(browserShowMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending show when another overlay opens before the debounce completes', async () => {
    useBrowserStore.getState().setViewId('browser-1');
    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'browser' });

    onOverlayMount();
    onOverlayUnmount();
    onOverlayMount();
    await flushAsyncWork();

    await vi.advanceTimersByTimeAsync(16);
    await flushAsyncWork();

    expect(browserHideMock).toHaveBeenCalledTimes(2);
    expect(browserShowMock).not.toHaveBeenCalled();
    expect(getOverlayCount()).toBe(1);
  });

  it('waits for the post-create hide before showing the browser again', async () => {
    useUIStore.setState({ reviewPanelOpen: true, activityTab: 'browser' });

    onOverlayMount();
    expect(browserHideMock).not.toHaveBeenCalled();

    useBrowserStore.getState().setViewId('browser-1');

    const deferredHide = createDeferredPromise<undefined>();
    browserHideMock.mockReturnValueOnce(deferredHide.promise);

    syncBrowserVisibilityAfterCreate();

    onOverlayUnmount();
    await vi.advanceTimersByTimeAsync(16);
    await flushAsyncWork();
    expect(browserShowMock).not.toHaveBeenCalled();

    deferredHide.resolve(undefined);
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(0);
    await flushAsyncWork();

    expect(browserShowMock).toHaveBeenCalledTimes(1);
  });
});
