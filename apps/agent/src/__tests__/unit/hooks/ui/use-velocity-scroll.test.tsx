import { fireEvent, render, screen } from '@testing-library/react';

import type { FC } from 'react';

import { useVelocityScroll } from '@/hooks/ui/use-velocity-scroll';

const mockMutationObserverDisconnect = vi.fn();
const mockMutationObserverObserve = vi.fn();
const mockResizeObserverDisconnect = vi.fn();
const mockResizeObserverObserve = vi.fn();

interface HarnessProps {
  readonly enabled: boolean;
  readonly onUserScrollStart?: (() => void) | undefined;
}

const Harness: FC<HarnessProps> = ({ enabled, onUserScrollStart }) => {
  const ref = useVelocityScroll({
    enabled,
    warmupEvents: 1,
    ...(onUserScrollStart ? { onUserScrollStart } : {}),
  });

  return (
    <div data-testid="scroller" ref={ref}>
      <div data-testid="virtuoso-list" />
    </div>
  );
};

describe('useVelocityScroll', () => {
  beforeEach(() => {
    mockMutationObserverDisconnect.mockClear();
    mockMutationObserverObserve.mockClear();
    mockResizeObserverDisconnect.mockClear();
    mockResizeObserverObserve.mockClear();
    vi.spyOn(globalThis.MutationObserver.prototype, 'observe').mockImplementation(
      mockMutationObserverObserve
    );
    vi.spyOn(globalThis.MutationObserver.prototype, 'disconnect').mockImplementation(
      mockMutationObserverDisconnect
    );
    vi.spyOn(globalThis.ResizeObserver.prototype, 'observe').mockImplementation(
      mockResizeObserverObserve
    );
    vi.spyOn(globalThis.ResizeObserver.prototype, 'disconnect').mockImplementation(
      mockResizeObserverDisconnect
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not attach observers when disabled and tears them down when disabled after attach', () => {
    const { rerender } = render(<Harness enabled={true} />);

    expect(mockMutationObserverObserve).toHaveBeenCalled();
    expect(mockResizeObserverObserve).toHaveBeenCalled();

    rerender(<Harness enabled={false} />);

    expect(mockMutationObserverDisconnect).toHaveBeenCalled();
    expect(mockResizeObserverDisconnect).toHaveBeenCalled();
  });

  it('fires onUserScrollStart once after warmup completes', () => {
    const onUserScrollStart = vi.fn();

    render(<Harness enabled={true} onUserScrollStart={onUserScrollStart} />);

    const scroller = screen.getByTestId('scroller');
    fireEvent.wheel(scroller, { deltaY: 40 });
    expect(onUserScrollStart).not.toHaveBeenCalled();

    fireEvent.wheel(scroller, { deltaY: 40 });
    expect(onUserScrollStart).toHaveBeenCalledTimes(1);

    fireEvent.wheel(scroller, { deltaY: 40 });
    expect(onUserScrollStart).toHaveBeenCalledTimes(1);
  });
});
