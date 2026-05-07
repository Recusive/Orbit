import { render, waitFor } from '@testing-library/react';

const { mockInvoke, mockWarn } = vi.hoisted(() => ({
  mockInvoke: vi.fn<[], Promise<void>>(),
  mockWarn: vi.fn(),
}));

vi.mock('@orbit/common/lib', () => ({
  createLogger: () => ({
    warn: mockWarn,
  }),
}));

vi.mock('@/lib/api/core', () => ({
  IS_TAURI: true,
  invoke: mockInvoke,
}));

import { useTrafficLights } from '@/hooks/ui/use-traffic-lights';

function TrafficLightsProbe({ sidebarOpen }: { readonly sidebarOpen: boolean }): null {
  useTrafficLights(sidebarOpen);
  return null;
}

describe('useTrafficLights', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockWarn.mockReset();
  });

  it('logs failed traffic-light IPC updates instead of dropping the rejection', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('traffic light command failed'));

    render(<TrafficLightsProbe sidebarOpen={false} />);

    await waitFor(() => {
      expect(mockWarn).toHaveBeenCalledWith('Failed to update macOS traffic lights visibility', {
        error: 'traffic light command failed',
        sidebarOpen: false,
      });
    });
  });
});
