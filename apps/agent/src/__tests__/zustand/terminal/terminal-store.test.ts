/**
 * Tests for terminal-store.ts
 *
 * Purpose: Manages terminal sessions - PTY connections, output buffering,
 * command detection, flow control, and session lifecycle.
 * Uses immer middleware for immutable state updates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShellType, TerminalCapabilitiesState } from '@/types/protocol';

import { TERMINAL } from '@/lib/utils/constants';
import { useTerminalStore } from '@/stores/terminal/terminal-store';

// Mock Date.now and Math.random for consistent IDs
let mockTime = 1704067200000;
let mockRandomCounter = 0;
vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
vi.spyOn(Math, 'random').mockImplementation(() => {
  mockRandomCounter++;
  return mockRandomCounter / 1000;
});

// Helper to reset the store to initial state
function resetStore(): void {
  useTerminalStore.setState({
    sessions: [],
    activeSessionId: null,
    maxOutputLines: TERMINAL.maxOutputLines,
    preferences: {
      copyOnSelection: false,
    },
  });
}

// Helper to create mock capabilities
function createMockCapabilities(
  overrides: Partial<TerminalCapabilitiesState> = {}
): TerminalCapabilitiesState {
  return {
    cwd_detection: false,
    command_detection: false,
    shell_integration: false,
    ...overrides,
  };
}

describe('terminal-store', () => {
  beforeEach(() => {
    resetStore();
    mockTime = 1704067200000;
    mockRandomCounter = 0;
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with empty sessions', () => {
      expect(useTerminalStore.getState().sessions).toEqual([]);
    });

    it('should start with null activeSessionId', () => {
      expect(useTerminalStore.getState().activeSessionId).toBeNull();
    });

    it('should start with default maxOutputLines from constants', () => {
      expect(useTerminalStore.getState().maxOutputLines).toBe(TERMINAL.maxOutputLines);
    });

    it('should start with default preferences', () => {
      expect(useTerminalStore.getState().preferences).toEqual({
        copyOnSelection: false,
      });
    });
  });

  // ============================================================================
  // Session Management
  // ============================================================================

  describe('createSession', () => {
    it('should create a new terminal session', () => {
      const { createSession } = useTerminalStore.getState();

      const sessionId = createSession();

      const sessions = useTerminalStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.name).toBe('Terminal 1');
      expect(sessions[0]?.isAlive).toBe(false);
      expect(sessions[0]?.isConnected).toBe(false);
      expect(sessions[0]?.output).toEqual([]);
      expect(sessions[0]?.commandHistory).toEqual([]);
      expect(sessionId).toMatch(/^term_\d+_/);
    });

    it('should auto-select first session', () => {
      const { createSession } = useTerminalStore.getState();

      const sessionId = createSession();

      expect(useTerminalStore.getState().activeSessionId).toBe(sessionId);
    });

    it('should not auto-select subsequent sessions', () => {
      const { createSession } = useTerminalStore.getState();

      const firstId = createSession();
      createSession();

      expect(useTerminalStore.getState().activeSessionId).toBe(firstId);
    });

    it('should create session with custom name', () => {
      const { createSession } = useTerminalStore.getState();

      createSession('My Terminal');

      expect(useTerminalStore.getState().sessions[0]?.name).toBe('My Terminal');
    });

    it('should create session with custom cwd', () => {
      const { createSession } = useTerminalStore.getState();

      createSession(undefined, '/custom/path');

      expect(useTerminalStore.getState().sessions[0]?.cwd).toBe('/custom/path');
    });

    it('should create session with initial command', () => {
      const { createSession } = useTerminalStore.getState();

      createSession(undefined, undefined, 'ssh user@host');

      expect(useTerminalStore.getState().sessions[0]?.initialCommand).toBe('ssh user@host');
    });

    it('should increment session numbers', () => {
      const { createSession } = useTerminalStore.getState();

      createSession();
      createSession();
      createSession();

      const sessions = useTerminalStore.getState().sessions;
      expect(sessions[0]?.name).toBe('Terminal 1');
      expect(sessions[1]?.name).toBe('Terminal 2');
      expect(sessions[2]?.name).toBe('Terminal 3');
    });
  });

  describe('closeSession', () => {
    it('should remove session', () => {
      const { createSession, closeSession } = useTerminalStore.getState();

      const id = createSession();
      closeSession(id);

      expect(useTerminalStore.getState().sessions).toHaveLength(0);
    });

    it('should switch active session when closing active', () => {
      const { createSession, closeSession, setActiveSession } = useTerminalStore.getState();

      const id1 = createSession();
      const id2 = createSession();
      setActiveSession(id2);

      closeSession(id2);

      expect(useTerminalStore.getState().activeSessionId).toBe(id1);
    });

    it('should set activeSessionId to null when closing last session', () => {
      const { createSession, closeSession } = useTerminalStore.getState();

      const id = createSession();
      closeSession(id);

      expect(useTerminalStore.getState().activeSessionId).toBeNull();
    });

    it('should not affect activeSessionId when closing non-active session', () => {
      const { createSession, closeSession } = useTerminalStore.getState();

      const id1 = createSession();
      const id2 = createSession();

      closeSession(id2);

      expect(useTerminalStore.getState().activeSessionId).toBe(id1);
    });

    it('should do nothing for non-existent session', () => {
      const { createSession, closeSession } = useTerminalStore.getState();

      createSession();
      closeSession('nonexistent');

      expect(useTerminalStore.getState().sessions).toHaveLength(1);
    });
  });

  describe('setActiveSession', () => {
    it('should set active session', () => {
      const { createSession, setActiveSession } = useTerminalStore.getState();

      createSession();
      const id2 = createSession();
      setActiveSession(id2);

      expect(useTerminalStore.getState().activeSessionId).toBe(id2);
    });

    it('should allow setting to null', () => {
      const { createSession, setActiveSession } = useTerminalStore.getState();

      createSession();
      setActiveSession(null);

      expect(useTerminalStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('renameSession', () => {
    it('should set custom name', () => {
      const { createSession, renameSession } = useTerminalStore.getState();

      const id = createSession();
      renameSession(id, 'Custom Name');

      expect(useTerminalStore.getState().sessions[0]?.customName).toBe('Custom Name');
    });

    it('should clear customName when set to empty string', () => {
      const { createSession, renameSession } = useTerminalStore.getState();

      const id = createSession();
      renameSession(id, 'Custom');
      renameSession(id, '');

      expect(useTerminalStore.getState().sessions[0]?.customName).toBeUndefined();
    });

    it('should clear customName when set to default name', () => {
      const { createSession, renameSession } = useTerminalStore.getState();

      const id = createSession();
      renameSession(id, 'Custom');
      renameSession(id, 'Terminal 1');

      expect(useTerminalStore.getState().sessions[0]?.customName).toBeUndefined();
    });

    it('should trim whitespace', () => {
      const { createSession, renameSession } = useTerminalStore.getState();

      const id = createSession();
      renameSession(id, '  Custom Name  ');

      expect(useTerminalStore.getState().sessions[0]?.customName).toBe('Custom Name');
    });
  });

  // ============================================================================
  // PTY Connection
  // ============================================================================

  describe('connectSession', () => {
    it('should connect session to PTY', () => {
      const { createSession, connectSession } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123', 12345, 'zsh' as ShellType);

      const session = useTerminalStore.getState().sessions[0];
      expect(session?.terminalId).toBe('pty-123');
      expect(session?.pid).toBe(12345);
      expect(session?.shellType).toBe('zsh');
      expect(session?.isAlive).toBe(true);
      expect(session?.isConnected).toBe(true);
    });

    it('should clear exitCode when connecting', () => {
      const { createSession, connectSession, disconnectSession } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      disconnectSession(id, 1);

      expect(useTerminalStore.getState().sessions[0]?.exitCode).toBe(1);

      connectSession(id, 'pty-456');

      expect(useTerminalStore.getState().sessions[0]?.exitCode).toBeUndefined();
    });

    it('should set capabilities', () => {
      const { createSession, connectSession } = useTerminalStore.getState();

      const id = createSession();
      const capabilities = createMockCapabilities({
        cwd_detection: true,
        shell_integration: true,
      });

      connectSession(id, 'pty-123', undefined, undefined, capabilities);

      expect(useTerminalStore.getState().sessions[0]?.capabilities).toEqual(capabilities);
    });
  });

  describe('disconnectSession', () => {
    it('should disconnect session', () => {
      const { createSession, connectSession, disconnectSession } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      disconnectSession(id);

      const session = useTerminalStore.getState().sessions[0];
      expect(session?.isAlive).toBe(false);
      expect(session?.isConnected).toBe(false);
    });

    it('should set exitCode', () => {
      const { createSession, connectSession, disconnectSession } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      disconnectSession(id, 0);

      expect(useTerminalStore.getState().sessions[0]?.exitCode).toBe(0);
    });

    it('should clear currentCommand', () => {
      const { createSession, connectSession, startCommand, disconnectSession } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      startCommand('pty-123', 'npm test');
      disconnectSession(id);

      expect(useTerminalStore.getState().sessions[0]?.currentCommand).toBeUndefined();
    });
  });

  // ============================================================================
  // Output
  // ============================================================================

  describe('addOutput', () => {
    it('should add output to session', () => {
      const { createSession, addOutput } = useTerminalStore.getState();

      const id = createSession();
      addOutput(id, { type: 'stdout', content: 'Hello World' });

      const output = useTerminalStore.getState().sessions[0]?.output;
      expect(output).toHaveLength(1);
      expect(output?.[0]?.type).toBe('stdout');
      expect(output?.[0]?.content).toBe('Hello World');
      expect(output?.[0]?.timestamp).toBeDefined();
    });

    it('should trim output when exceeding maxOutputLines', () => {
      const { createSession, addOutput } = useTerminalStore.getState();

      // Set max output lines directly to bypass minimum enforcement
      useTerminalStore.setState((state) => {
        state.maxOutputLines = 5;
        return state;
      });

      const id = createSession();

      for (let i = 0; i < 10; i++) {
        addOutput(id, { type: 'stdout', content: `Line ${String(i)}` });
      }

      const output = useTerminalStore.getState().sessions[0]?.output;
      expect(output).toHaveLength(5);
      expect(output?.[0]?.content).toBe('Line 5');
      expect(output?.[4]?.content).toBe('Line 9');
    });

    it('should support different output types', () => {
      const { createSession, addOutput } = useTerminalStore.getState();

      const id = createSession();
      addOutput(id, { type: 'stdout', content: 'stdout' });
      addOutput(id, { type: 'stderr', content: 'stderr' });
      addOutput(id, { type: 'stdin', content: 'stdin' });
      addOutput(id, { type: 'system', content: 'system' });

      const output = useTerminalStore.getState().sessions[0]?.output;
      expect(output?.map((o) => o.type)).toEqual(['stdout', 'stderr', 'stdin', 'system']);
    });
  });

  describe('appendData', () => {
    it('should append data to session by terminalId', () => {
      const { createSession, connectSession, appendData } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      appendData('pty-123', 'Hello');

      const output = useTerminalStore.getState().sessions[0]?.output;
      expect(output).toHaveLength(1);
      expect(output?.[0]?.content).toBe('Hello');
    });

    it('should return byte count', () => {
      const { createSession, connectSession, appendData } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      const bytes = appendData('pty-123', 'Hello');

      expect(bytes).toBe(5);
    });

    it('should track unacknowledged bytes', () => {
      const { createSession, connectSession, appendData } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      appendData('pty-123', 'Hello');
      appendData('pty-123', 'World');

      expect(useTerminalStore.getState().sessions[0]?.unacknowledgedBytes).toBe(10);
    });
  });

  describe('clearOutput', () => {
    it('should clear session output', () => {
      const { createSession, addOutput, clearOutput } = useTerminalStore.getState();

      const id = createSession();
      addOutput(id, { type: 'stdout', content: 'Hello' });
      clearOutput(id);

      expect(useTerminalStore.getState().sessions[0]?.output).toEqual([]);
    });
  });

  // ============================================================================
  // Capabilities & CWD
  // ============================================================================

  describe('updateCapabilities', () => {
    it('should update session capabilities', () => {
      const { createSession, connectSession, updateCapabilities } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      const newCapabilities = createMockCapabilities({
        cwd_detection: true,
        command_detection: true,
        shell_integration: true,
      });

      updateCapabilities('pty-123', newCapabilities);

      expect(useTerminalStore.getState().sessions[0]?.capabilities).toEqual(newCapabilities);
    });
  });

  describe('updateCwd', () => {
    it('should update session cwd', () => {
      const { createSession, connectSession, updateCwd } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      updateCwd('pty-123', '/new/path');

      expect(useTerminalStore.getState().sessions[0]?.cwd).toBe('/new/path');
    });
  });

  // ============================================================================
  // Foreground Process
  // ============================================================================

  describe('updateForegroundProcess', () => {
    it('should update foreground process', () => {
      const { createSession, connectSession, updateForegroundProcess } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      updateForegroundProcess('pty-123', 'node', 54321);

      const process = useTerminalStore.getState().sessions[0]?.foregroundProcess;
      expect(process).toEqual({ name: 'node', pid: 54321 });
    });
  });

  // ============================================================================
  // Command Detection
  // ============================================================================

  describe('startCommand', () => {
    it('should start tracking a command', () => {
      const { createSession, connectSession, startCommand } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      startCommand('pty-123', 'npm test');

      const command = useTerminalStore.getState().sessions[0]?.currentCommand;
      expect(command?.commandLine).toBe('npm test');
      expect(command?.isRunning).toBe(true);
      expect(command?.startTime).toBeDefined();
    });

    it('should work without command line', () => {
      const { createSession, connectSession, startCommand } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      startCommand('pty-123');

      const command = useTerminalStore.getState().sessions[0]?.currentCommand;
      expect(command?.isRunning).toBe(true);
      expect(command?.commandLine).toBeUndefined();
    });
  });

  describe('endCommand', () => {
    it('should end command and add to history', () => {
      const { createSession, connectSession, startCommand, endCommand } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      startCommand('pty-123', 'npm test');
      endCommand('pty-123', 0);

      const session = useTerminalStore.getState().sessions[0];
      expect(session?.currentCommand).toBeUndefined();
      expect(session?.commandHistory).toHaveLength(1);
      expect(session?.commandHistory[0]?.commandLine).toBe('npm test');
      expect(session?.commandHistory[0]?.exitCode).toBe(0);
      expect(session?.commandHistory[0]?.isRunning).toBe(false);
    });

    it('should limit command history to 100', () => {
      const { createSession, connectSession, startCommand, endCommand } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      for (let i = 0; i < 105; i++) {
        startCommand('pty-123', `cmd ${String(i)}`);
        endCommand('pty-123', 0);
      }

      const history = useTerminalStore.getState().sessions[0]?.commandHistory;
      expect(history).toHaveLength(100);
      expect(history?.[0]?.commandLine).toBe('cmd 5');
    });
  });

  // ============================================================================
  // Flow Control
  // ============================================================================

  describe('acknowledgeData', () => {
    it('should reduce unacknowledged bytes', () => {
      const { createSession, connectSession, appendData, acknowledgeData } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');
      appendData('pty-123', 'Hello World'); // 11 bytes

      acknowledgeData('pty-123', 5);

      expect(useTerminalStore.getState().sessions[0]?.unacknowledgedBytes).toBe(6);
    });

    it('should not go below zero', () => {
      const { createSession, connectSession, acknowledgeData } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      acknowledgeData('pty-123', 1000);

      expect(useTerminalStore.getState().sessions[0]?.unacknowledgedBytes).toBe(0);
    });
  });

  describe('shouldPause', () => {
    it('should return false when below high water mark', () => {
      const { createSession, connectSession, shouldPause } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      expect(shouldPause('pty-123')).toBe(false);
    });

    it('should return true when above high water mark', () => {
      const { createSession, connectSession, shouldPause } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      // Manually set unacknowledged bytes above threshold
      useTerminalStore.setState((state) => {
        const session = state.sessions.find((s) => s.terminalId === 'pty-123');
        if (session) session.unacknowledgedBytes = 200000;
        return state;
      });

      expect(shouldPause('pty-123')).toBe(true);
    });

    it('should return false for non-existent session', () => {
      const { shouldPause } = useTerminalStore.getState();

      expect(shouldPause('nonexistent')).toBe(false);
    });
  });

  // ============================================================================
  // Session Updates
  // ============================================================================

  describe('updateSession', () => {
    it('should update session fields', () => {
      const { createSession, updateSession } = useTerminalStore.getState();

      const id = createSession();
      updateSession(id, { cwd: '/updated/path', isAlive: true });

      const session = useTerminalStore.getState().sessions[0];
      expect(session?.cwd).toBe('/updated/path');
      expect(session?.isAlive).toBe(true);
    });
  });

  describe('setMaxOutputLines', () => {
    it('should set max output lines', () => {
      const { setMaxOutputLines } = useTerminalStore.getState();

      setMaxOutputLines(500);

      expect(useTerminalStore.getState().maxOutputLines).toBe(500);
    });

    it('should enforce minimum from constants', () => {
      const { setMaxOutputLines } = useTerminalStore.getState();

      setMaxOutputLines(10);

      expect(useTerminalStore.getState().maxOutputLines).toBe(TERMINAL.minOutputLines);
    });

    it('should trim existing sessions', () => {
      const { createSession, addOutput, setMaxOutputLines } = useTerminalStore.getState();

      const id = createSession();
      for (let i = 0; i < 500; i++) {
        addOutput(id, { type: 'stdout', content: `Line ${String(i)}` });
      }

      setMaxOutputLines(200);

      expect(useTerminalStore.getState().sessions[0]?.output).toHaveLength(200);
    });
  });

  // ============================================================================
  // Preferences
  // ============================================================================

  describe('setCopyOnSelection', () => {
    it('should set copy on selection preference', () => {
      const { setCopyOnSelection } = useTerminalStore.getState();

      setCopyOnSelection(true);
      expect(useTerminalStore.getState().preferences.copyOnSelection).toBe(true);

      setCopyOnSelection(false);
      expect(useTerminalStore.getState().preferences.copyOnSelection).toBe(false);
    });
  });

  // ============================================================================
  // Helpers
  // ============================================================================

  describe('getSessionByTerminalId', () => {
    it('should find session by terminalId', () => {
      const { createSession, connectSession, getSessionByTerminalId } = useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      const session = getSessionByTerminalId('pty-123');
      expect(session?.id).toBe(id);
    });

    it('should return undefined for non-existent terminalId', () => {
      const { getSessionByTerminalId } = useTerminalStore.getState();

      expect(getSessionByTerminalId('nonexistent')).toBeUndefined();
    });
  });

  describe('getActiveSession', () => {
    it('should return active session', () => {
      const { createSession, getActiveSession } = useTerminalStore.getState();

      const id = createSession();

      const session = getActiveSession();
      expect(session?.id).toBe(id);
    });

    it('should return undefined when no active session', () => {
      const { getActiveSession } = useTerminalStore.getState();

      expect(getActiveSession()).toBeUndefined();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle multiple sessions independently', () => {
      const { createSession, connectSession, addOutput } = useTerminalStore.getState();

      const id1 = createSession();
      const id2 = createSession();
      connectSession(id1, 'pty-1');
      connectSession(id2, 'pty-2');

      addOutput(id1, { type: 'stdout', content: 'Output 1' });
      addOutput(id2, { type: 'stdout', content: 'Output 2' });

      const sessions = useTerminalStore.getState().sessions;
      expect(sessions[0]?.output[0]?.content).toBe('Output 1');
      expect(sessions[1]?.output[0]?.content).toBe('Output 2');
    });

    it('should handle rapid command start/end', () => {
      const { createSession, connectSession, startCommand, endCommand } =
        useTerminalStore.getState();

      const id = createSession();
      connectSession(id, 'pty-123');

      for (let i = 0; i < 10; i++) {
        startCommand('pty-123', `cmd ${String(i)}`);
        endCommand('pty-123', 0);
      }

      const history = useTerminalStore.getState().sessions[0]?.commandHistory;
      expect(history).toHaveLength(10);
    });

    it('should handle session operations on non-existent sessions gracefully', () => {
      const { addOutput, clearOutput, disconnectSession } = useTerminalStore.getState();

      // These should not throw
      addOutput('nonexistent', { type: 'stdout', content: 'test' });
      clearOutput('nonexistent');
      disconnectSession('nonexistent');

      expect(useTerminalStore.getState().sessions).toHaveLength(0);
    });
  });
});
