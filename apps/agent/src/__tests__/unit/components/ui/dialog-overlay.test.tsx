const { onOverlayMountMock, onOverlayUnmountMock } = vi.hoisted(() => ({
  onOverlayMountMock: vi.fn(),
  onOverlayUnmountMock: vi.fn(),
}));

vi.mock('@/lib/browser-overlay-coordination', () => ({
  onOverlayMount: onOverlayMountMock,
  onOverlayUnmount: onOverlayUnmountMock,
}));

import { render } from '@testing-library/react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

describe('DialogOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks overlay mount and unmount through the shared dialog primitive', () => {
    const { unmount } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Overlay Test</DialogTitle>
          <DialogDescription>Tracks browser overlay visibility.</DialogDescription>
          <div>Body</div>
        </DialogContent>
      </Dialog>
    );

    expect(onOverlayMountMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(onOverlayUnmountMock).toHaveBeenCalledTimes(1);
  });
});
