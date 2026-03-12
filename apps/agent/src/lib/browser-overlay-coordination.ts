import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';

let overlayCount = 0;
let hidePromise: Promise<void> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Read the number of active full-viewport overlays that should hide the native browser window.
 */
export function getOverlayCount(): number {
  return overlayCount;
}

/**
 * Single source of truth for whether the native browser window should be visible.
 */
export function shouldBrowserBeVisible(): boolean {
  const { viewId } = useBrowserStore.getState();
  const { reviewPanelOpen, activityTab } = useUIStore.getState();

  return viewId !== null && reviewPanelOpen && activityTab === 'browser' && overlayCount === 0;
}

export function onOverlayMount(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  overlayCount += 1;
  if (overlayCount === 1) {
    hidePromise = hideBrowserSafe();
  }
}

export function onOverlayUnmount(): void {
  overlayCount = Math.max(0, overlayCount - 1);
  if (overlayCount !== 0) {
    return;
  }

  showTimer = setTimeout(() => {
    showTimer = null;
    void showBrowserSafe();
  }, 16);
}

/**
 * Called after browser creation so an already-open overlay can immediately hide the new window.
 */
export function syncBrowserVisibilityAfterCreate(): void {
  if (overlayCount === 0) {
    return;
  }

  hidePromise = hideBrowserSafe();
}

/**
 * Reset module state for tests and HMR cleanup.
 */
export function resetBrowserOverlayCoordination(): void {
  overlayCount = 0;
  hidePromise = null;

  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

async function hideBrowserSafe(): Promise<void> {
  if (useBrowserStore.getState().viewId === null) {
    return;
  }

  try {
    const { browserHide } = await import('@/lib/api/browser');
    await browserHide();
  } catch {
    // Browser may already be hidden or unavailable in browser-only mode.
  }
}

async function showBrowserSafe(): Promise<void> {
  const pendingHide = hidePromise;

  if (pendingHide !== null) {
    await pendingHide;
    if (hidePromise === pendingHide) {
      hidePromise = null;
    }
  }

  if (!shouldBrowserBeVisible()) {
    return;
  }

  try {
    const { browserShow } = await import('@/lib/api/browser');
    await browserShow();
  } catch {
    // Browser may have been closed while the overlay was open.
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetBrowserOverlayCoordination();
  });
}
