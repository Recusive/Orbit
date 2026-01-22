/**
 * Tests for browser-lifecycle-store.ts
 *
 * Purpose: Manages browser idle lifecycle transitions and idle countdowns.
 */

import {
  selectFormattedIdleTime,
  selectIsBrowserRunning,
  selectShouldAutoClose,
  useBrowserLifecycleStore,
} from '@/stores/browser/browser-lifecycle-store';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_DURATION_MS = 60 * 1000;

describe('browser-lifecycle-store', () => {
  beforeEach(() => {
    useBrowserLifecycleStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start idle with no label or error', () => {
      const state = useBrowserLifecycleStore.getState();

      expect(state.state).toBe('idle');
      expect(state.label).toBeNull();
      expect(state.error).toBeNull();
      expect(state.idleWarningShown).toBe(false);
      expect(state.idleTimeRemaining).toBeNull();
    });
  });

  // ============================================================================
  // Basic Actions
  // ============================================================================

  describe('setState', () => {
    it('should update the lifecycle state', () => {
      useBrowserLifecycleStore.getState().setState('active');

      expect(useBrowserLifecycleStore.getState().state).toBe('active');
    });
  });

  describe('setLabel', () => {
    it('should update the browser label', () => {
      useBrowserLifecycleStore.getState().setLabel('webview-1');

      expect(useBrowserLifecycleStore.getState().label).toBe('webview-1');
    });
  });

  describe('setError', () => {
    it('should set and clear errors', () => {
      const { setError } = useBrowserLifecycleStore.getState();

      setError('Something went wrong');
      expect(useBrowserLifecycleStore.getState().error).toBe('Something went wrong');

      setError(null);
      expect(useBrowserLifecycleStore.getState().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset state back to initial values', () => {
      useBrowserLifecycleStore.setState({
        state: 'active',
        label: 'webview-2',
        idleWarningShown: true,
        idleTimeRemaining: 10,
        error: 'error',
      });

      useBrowserLifecycleStore.getState().reset();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('idle');
      expect(state.label).toBeNull();
      expect(state.idleWarningShown).toBe(false);
      expect(state.idleTimeRemaining).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  // ============================================================================
  // Activity Tracking
  // ============================================================================

  describe('recordActivity', () => {
    it('should ignore activity when browser is idle', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'idle',
        lastActivity: now - 5_000,
      });

      useBrowserLifecycleStore.getState().recordActivity();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('idle');
      expect(state.lastActivity).toBe(now - 5_000);
    });

    it('should return to active and clear warning when inactive', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'inactive',
        lastActivity: now - 10_000,
        idleWarningShown: true,
        idleTimeRemaining: 12,
      });

      useBrowserLifecycleStore.getState().recordActivity();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('active');
      expect(state.idleWarningShown).toBe(false);
      expect(state.idleTimeRemaining).toBeNull();
      expect(state.lastActivity).toBe(now);
    });
  });

  // ============================================================================
  // Idle Timer
  // ============================================================================

  describe('tick', () => {
    it('should do nothing when browser is not running', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'idle',
        lastActivity: now - (IDLE_TIMEOUT_MS + WARNING_DURATION_MS),
      });

      useBrowserLifecycleStore.getState().tick();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('idle');
      expect(state.idleWarningShown).toBe(false);
      expect(state.idleTimeRemaining).toBeNull();
    });

    it('should show idle warning after timeout', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'active',
        lastActivity: now - IDLE_TIMEOUT_MS,
        idleWarningShown: false,
        idleTimeRemaining: null,
      });

      useBrowserLifecycleStore.getState().tick();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('inactive');
      expect(state.idleWarningShown).toBe(true);
      expect(state.idleTimeRemaining).toBe(60);
    });

    it('should count down remaining idle time while warning is shown', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'inactive',
        lastActivity: now - (IDLE_TIMEOUT_MS + 10_000),
        idleWarningShown: true,
      });

      useBrowserLifecycleStore.getState().tick();

      expect(useBrowserLifecycleStore.getState().idleTimeRemaining).toBe(50);
    });

    it('should transition to closing when idle timeout expires', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useBrowserLifecycleStore.setState({
        state: 'inactive',
        lastActivity: now - (IDLE_TIMEOUT_MS + WARNING_DURATION_MS + 1_000),
        idleWarningShown: true,
      });

      useBrowserLifecycleStore.getState().tick();

      const state = useBrowserLifecycleStore.getState();
      expect(state.state).toBe('closing');
      expect(state.idleTimeRemaining).toBe(0);
    });
  });

  // ============================================================================
  // Selectors
  // ============================================================================

  describe('selectors', () => {
    it('selectIsBrowserRunning should return true for active and inactive', () => {
      useBrowserLifecycleStore.setState({ state: 'active' });
      expect(selectIsBrowserRunning(useBrowserLifecycleStore.getState())).toBe(true);

      useBrowserLifecycleStore.setState({ state: 'inactive' });
      expect(selectIsBrowserRunning(useBrowserLifecycleStore.getState())).toBe(true);
    });

    it('selectIsBrowserRunning should return false for idle/closing/starting', () => {
      useBrowserLifecycleStore.setState({ state: 'idle' });
      expect(selectIsBrowserRunning(useBrowserLifecycleStore.getState())).toBe(false);

      useBrowserLifecycleStore.setState({ state: 'starting' });
      expect(selectIsBrowserRunning(useBrowserLifecycleStore.getState())).toBe(false);

      useBrowserLifecycleStore.setState({ state: 'closing' });
      expect(selectIsBrowserRunning(useBrowserLifecycleStore.getState())).toBe(false);
    });

    it('selectShouldAutoClose should reflect idleTimeRemaining === 0', () => {
      useBrowserLifecycleStore.setState({ idleTimeRemaining: 1 });
      expect(selectShouldAutoClose(useBrowserLifecycleStore.getState())).toBe(false);

      useBrowserLifecycleStore.setState({ idleTimeRemaining: 0 });
      expect(selectShouldAutoClose(useBrowserLifecycleStore.getState())).toBe(true);
    });

    it('selectFormattedIdleTime should format minutes and seconds', () => {
      useBrowserLifecycleStore.setState({ idleTimeRemaining: 75 });
      expect(selectFormattedIdleTime(useBrowserLifecycleStore.getState())).toBe('1:15');

      useBrowserLifecycleStore.setState({ idleTimeRemaining: 9 });
      expect(selectFormattedIdleTime(useBrowserLifecycleStore.getState())).toBe('9s');

      useBrowserLifecycleStore.setState({ idleTimeRemaining: null });
      expect(selectFormattedIdleTime(useBrowserLifecycleStore.getState())).toBeNull();
    });
  });
});
