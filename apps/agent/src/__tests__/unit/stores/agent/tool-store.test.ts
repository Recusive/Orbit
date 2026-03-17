/**
 * Tests for tool-store.ts
 *
 * Purpose: Manages tool executions, permissions, usage tracking, model selection,
 * and session caching. Uses immer middleware with Set support.
 */
import { enableMapSet } from 'immer';

// Enable immer's MapSet plugin for Set<string> support (processedMessageIds)
enableMapSet();

import type { PermissionRequest, UsageData } from '@/stores/agent/tool-store';

import { useToolStore } from '@/stores/agent/tool-store';

// Mock Date.now for consistent timestamps
let mockTime = 1704067200000;
vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

// Helper to create mock tool input
function createMockToolInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    command: 'test command',
    ...overrides,
  };
}

// Helper to create a mock permission request
function createMockPermissionRequest(
  requestId: string,
  sessionId = 'session-1',
  toolName = 'bash'
): PermissionRequest {
  return {
    requestId,
    sessionId,
    toolName,
    toolInput: createMockToolInput(),
    createdAt: mockTime,
  };
}

// Helper to reset the store
function resetStore(): void {
  useToolStore.getState().reset();
}

describe('tool-store', () => {
  beforeEach(() => {
    resetStore();
    mockTime = 1704067200000;
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with default input mode', () => {
      expect(useToolStore.getState().inputMode).toBe('default');
    });

    it('should start with thinking mode ultra', () => {
      expect(useToolStore.getState().thinkingMode).toBe('ultra');
    });

    it('should start with claude-sonnet-4-6 model', () => {
      expect(useToolStore.getState().model).toBe('claude-sonnet-4-6');
    });

    it('should start with empty active tools', () => {
      expect(useToolStore.getState().activeTools).toEqual({});
    });

    it('should start with empty completed tools', () => {
      expect(useToolStore.getState().completedTools).toEqual([]);
    });

    it('should start with no pending permissions', () => {
      expect(useToolStore.getState().pendingPermissions).toEqual([]);
    });

    it('should start with null currentSessionId', () => {
      expect(useToolStore.getState().currentSessionId).toBeNull();
    });

    it('should start with zero usage', () => {
      const usage = useToolStore.getState().sessionUsage;
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.cacheReadInputTokens).toBe(0);
      expect(usage.cacheCreationInputTokens).toBe(0);
      expect(usage.totalCostUsd).toBe(0);
    });

    it('should start with empty session cache', () => {
      expect(useToolStore.getState().sessionCache).toEqual({});
    });
  });

  // ============================================================================
  // Mode Setters
  // ============================================================================

  describe('setInputMode', () => {
    it('should set input mode', () => {
      const { setInputMode } = useToolStore.getState();

      setInputMode('accept');
      expect(useToolStore.getState().inputMode).toBe('accept');

      setInputMode('plan');
      expect(useToolStore.getState().inputMode).toBe('plan');

      setInputMode('default');
      expect(useToolStore.getState().inputMode).toBe('default');
    });
  });

  describe('setThinkingMode', () => {
    it('should set thinking mode', () => {
      const { setThinkingMode } = useToolStore.getState();

      setThinkingMode('think');
      expect(useToolStore.getState().thinkingMode).toBe('think');

      setThinkingMode('hard');
      expect(useToolStore.getState().thinkingMode).toBe('hard');

      setThinkingMode('ultra');
      expect(useToolStore.getState().thinkingMode).toBe('ultra');

      setThinkingMode('off');
      expect(useToolStore.getState().thinkingMode).toBe('off');
    });
  });

  describe('setModel', () => {
    it('should set model', () => {
      const { setModel } = useToolStore.getState();

      setModel('haiku');
      expect(useToolStore.getState().model).toBe('haiku');

      setModel('claude-opus-4-6');
      expect(useToolStore.getState().model).toBe('claude-opus-4-6');

      setModel('claude-sonnet-4-6');
      expect(useToolStore.getState().model).toBe('claude-sonnet-4-6');
    });
  });

  // ============================================================================
  // Tool Lifecycle
  // ============================================================================

  describe('startTool', () => {
    it('should add tool to active tools', () => {
      const { startTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());

      const activeTools = useToolStore.getState().activeTools;
      expect(activeTools['tool-1']).toBeDefined();
      expect(activeTools['tool-1']?.toolName).toBe('bash');
      expect(activeTools['tool-1']?.messageId).toBe('msg-1');
      expect(activeTools['tool-1']?.status).toBe('running');
    });

    it('should set contentOffset when provided', () => {
      const { startTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput(), 100);

      expect(useToolStore.getState().activeTools['tool-1']?.contentOffset).toBe(100);
    });

    it('should set ordinal when provided', () => {
      const { startTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput(), 100, 'session-1', 7);

      expect(useToolStore.getState().activeTools['tool-1']?.ordinal).toBe(7);
    });

    it('should track startedAt timestamp', () => {
      const { startTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());

      expect(useToolStore.getState().activeTools['tool-1']?.startedAt).toBe(mockTime);
    });
  });

  describe('completeTool', () => {
    it('should move tool from active to completed on success', () => {
      const { startTool, completeTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      completeTool('tool-1', 'output text', true);

      const state = useToolStore.getState();
      expect(state.activeTools['tool-1']).toBeUndefined();
      expect(state.completedTools).toHaveLength(1);
      expect(state.completedTools[0]?.status).toBe('success');
      expect(state.completedTools[0]?.toolOutput).toBe('output text');
      expect(state.completedTools[0]?.success).toBe(true);
    });

    it('should mark tool as error on failure', () => {
      const { startTool, completeTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      completeTool('tool-1', 'error message', false);

      const completed = useToolStore.getState().completedTools[0];
      expect(completed?.status).toBe('error');
      expect(completed?.success).toBe(false);
    });

    it('should set completedAt timestamp', () => {
      const { startTool, completeTool } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      mockTime += 1000;
      completeTool('tool-1', 'output', true);

      expect(useToolStore.getState().completedTools[0]?.completedAt).toBe(mockTime);
    });

    it('should do nothing for non-existent tool', () => {
      const { completeTool } = useToolStore.getState();

      completeTool('nonexistent', 'output', true);

      expect(useToolStore.getState().completedTools).toEqual([]);
    });
  });

  describe('updateToolInput', () => {
    it('should replace the active tool input when it changes', () => {
      const { startTool, updateToolInput } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'todowrite', {});
      updateToolInput('tool-1', {
        todos: [{ id: '1', content: 'Ship it', status: 'pending' }],
      });

      expect(useToolStore.getState().activeTools['tool-1']?.toolInput).toEqual({
        todos: [{ id: '1', content: 'Ship it', status: 'pending' }],
      });
    });

    it('should ignore unchanged payloads', () => {
      const { startTool, updateToolInput } = useToolStore.getState();

      const toolInput = {
        todos: [{ id: '1', content: 'Ship it', status: 'pending' }],
      };

      startTool('tool-1', 'msg-1', 'todowrite', toolInput);
      const original = useToolStore.getState().activeTools['tool-1'];

      updateToolInput('tool-1', {
        todos: [{ id: '1', content: 'Ship it', status: 'pending' }],
      });

      expect(useToolStore.getState().activeTools['tool-1']).toBe(original);
    });
  });

  // ============================================================================
  // Permission Management
  // ============================================================================

  describe('addPermissionRequest', () => {
    it('should add permission request', () => {
      const { addPermissionRequest } = useToolStore.getState();

      addPermissionRequest(createMockPermissionRequest('req-1'));

      expect(useToolStore.getState().pendingPermissions).toHaveLength(1);
      expect(useToolStore.getState().pendingPermissions[0]?.requestId).toBe('req-1');
    });

    it('should allow multiple requests', () => {
      const { addPermissionRequest } = useToolStore.getState();

      addPermissionRequest(createMockPermissionRequest('req-1'));
      addPermissionRequest(createMockPermissionRequest('req-2'));

      expect(useToolStore.getState().pendingPermissions).toHaveLength(2);
    });
  });

  describe('removePermissionRequest', () => {
    it('should remove permission request by id', () => {
      const { addPermissionRequest, removePermissionRequest } = useToolStore.getState();

      addPermissionRequest(createMockPermissionRequest('req-1'));
      addPermissionRequest(createMockPermissionRequest('req-2'));

      removePermissionRequest('req-1');

      const pending = useToolStore.getState().pendingPermissions;
      expect(pending).toHaveLength(1);
      expect(pending[0]?.requestId).toBe('req-2');
    });
  });

  describe('clearPermissions', () => {
    it('should clear all pending permissions', () => {
      const { addPermissionRequest, clearPermissions } = useToolStore.getState();

      addPermissionRequest(createMockPermissionRequest('req-1'));
      addPermissionRequest(createMockPermissionRequest('req-2'));

      clearPermissions();

      expect(useToolStore.getState().pendingPermissions).toEqual([]);
    });
  });

  // ============================================================================
  // Usage Tracking
  // ============================================================================

  describe('addUsage', () => {
    it('should accumulate usage', () => {
      const { addUsage } = useToolStore.getState();

      addUsage(
        'msg-1',
        {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 10,
        },
        0.05
      );

      const usage = useToolStore.getState().sessionUsage;
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.cacheReadInputTokens).toBe(20);
      expect(usage.cacheCreationInputTokens).toBe(10);
      expect(usage.totalCostUsd).toBe(0.05);
    });

    it('should not double-count same message ID', () => {
      const { addUsage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 }); // Duplicate

      const usage = useToolStore.getState().sessionUsage;
      expect(usage.inputTokens).toBe(100); // Not 200
      expect(usage.outputTokens).toBe(50); // Not 100
    });

    it('should count different message IDs', () => {
      const { addUsage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      addUsage('msg-2', { input_tokens: 100, output_tokens: 50 });

      const usage = useToolStore.getState().sessionUsage;
      expect(usage.inputTokens).toBe(200);
      expect(usage.outputTokens).toBe(100);
    });

    it('should handle missing optional cache fields', () => {
      const { addUsage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });

      const usage = useToolStore.getState().sessionUsage;
      expect(usage.cacheReadInputTokens).toBe(0);
      expect(usage.cacheCreationInputTokens).toBe(0);
    });
  });

  describe('resetUsage', () => {
    it('should reset usage to zero', () => {
      const { addUsage, resetUsage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      resetUsage();

      const usage = useToolStore.getState().sessionUsage;
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalCostUsd).toBe(0);
    });

    it('should clear processed message IDs', () => {
      const { addUsage, resetUsage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      resetUsage();

      // Should be able to add same ID again
      addUsage('msg-1', { input_tokens: 200, output_tokens: 100 });

      expect(useToolStore.getState().sessionUsage.inputTokens).toBe(200);
    });
  });

  describe('switchSession', () => {
    it('should cache current session and reset for new session', () => {
      const { addUsage, switchSession, startTool } = useToolStore.getState();

      // Set up session 1
      switchSession('session-1');
      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());

      // Switch to session 2
      switchSession('session-2');

      // Session 2 should start fresh
      expect(useToolStore.getState().sessionUsage.inputTokens).toBe(0);
      expect(useToolStore.getState().activeTools).toEqual({});
    });

    it('should restore cached session data', () => {
      const { addUsage, switchSession } = useToolStore.getState();

      // Set up session 1
      switchSession('session-1');
      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });

      // Switch to session 2
      switchSession('session-2');
      addUsage('msg-2', { input_tokens: 200, output_tokens: 100 });

      // Switch back to session 1
      switchSession('session-1');

      // Should restore session 1 data
      expect(useToolStore.getState().sessionUsage.inputTokens).toBe(100);
      expect(useToolStore.getState().sessionUsage.outputTokens).toBe(50);
    });
  });

  describe('restoreSessionUsage', () => {
    it('should restore usage for a session', () => {
      const { restoreSessionUsage, switchSession } = useToolStore.getState();

      const usage: UsageData = {
        inputTokens: 500,
        outputTokens: 200,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 50,
        totalCostUsd: 0.25,
      };

      restoreSessionUsage('session-1', usage, ['msg-1', 'msg-2']);

      // Switch to the session to verify
      switchSession('session-1');

      const currentUsage = useToolStore.getState().sessionUsage;
      expect(currentUsage.inputTokens).toBe(500);
      expect(currentUsage.outputTokens).toBe(200);
    });

    it('should update active session if it matches', () => {
      const { switchSession, restoreSessionUsage } = useToolStore.getState();

      switchSession('session-1');

      const usage: UsageData = {
        inputTokens: 500,
        outputTokens: 200,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        totalCostUsd: 0.25,
      };

      restoreSessionUsage('session-1', usage);

      expect(useToolStore.getState().sessionUsage.inputTokens).toBe(500);
    });
  });

  // ============================================================================
  // Computed Values
  // ============================================================================

  describe('getContextPercentage', () => {
    it('should calculate context percentage', () => {
      const { addUsage, getContextPercentage } = useToolStore.getState();

      // 200k context for all models
      addUsage('msg-1', { input_tokens: 50000, output_tokens: 50000 }); // 100k total

      expect(getContextPercentage()).toBe(50);
    });

    it('should cap at 100%', () => {
      const { addUsage, getContextPercentage } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 150000, output_tokens: 100000 }); // 250k > 200k

      expect(getContextPercentage()).toBe(100);
    });

    it('should return 0 for no usage', () => {
      const { getContextPercentage } = useToolStore.getState();

      expect(getContextPercentage()).toBe(0);
    });
  });

  describe('getMaxTokens', () => {
    it('should return 200k for all models', () => {
      const { getMaxTokens, setModel } = useToolStore.getState();

      expect(getMaxTokens()).toBe(200000);

      setModel('haiku');
      expect(getMaxTokens()).toBe(200000);

      setModel('claude-opus-4-6');
      expect(getMaxTokens()).toBe(200000);
    });
  });

  describe('getUsedTokens', () => {
    it('should return sum of input and output tokens', () => {
      const { addUsage, getUsedTokens } = useToolStore.getState();

      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });

      expect(getUsedTokens()).toBe(150);
    });
  });

  // ============================================================================
  // Tool Lookup
  // ============================================================================

  describe('getToolsForMessage', () => {
    it('should return tools for a specific message', () => {
      const { startTool, getToolsForMessage } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      startTool('tool-2', 'msg-1', 'write', createMockToolInput());
      startTool('tool-3', 'msg-2', 'read', createMockToolInput());

      const tools = getToolsForMessage('msg-1');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.toolName)).toContain('bash');
      expect(tools.map((t) => t.toolName)).toContain('write');
    });

    it('should include both active and completed tools', () => {
      const { startTool, completeTool, getToolsForMessage } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      completeTool('tool-1', 'output', true);
      startTool('tool-2', 'msg-1', 'write', createMockToolInput());

      const tools = getToolsForMessage('msg-1');

      expect(tools).toHaveLength(2);
    });

    it('should deduplicate by tool ID', () => {
      const { startTool, completeTool, getToolsForMessage } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      completeTool('tool-1', 'output', true);

      const tools = getToolsForMessage('msg-1');

      expect(tools).toHaveLength(1);
    });

    it('should sort by startedAt', () => {
      const { startTool, getToolsForMessage } = useToolStore.getState();

      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      mockTime += 1000;
      startTool('tool-2', 'msg-1', 'write', createMockToolInput());
      mockTime -= 500;
      startTool('tool-3', 'msg-1', 'read', createMockToolInput());

      const tools = getToolsForMessage('msg-1');

      expect(tools[0]?.id).toBe('tool-1');
      expect(tools[1]?.id).toBe('tool-3');
      expect(tools[2]?.id).toBe('tool-2');
    });
  });

  describe('restoreToolsForMessage', () => {
    it('should restore tools from persisted data', () => {
      const { restoreToolsForMessage } = useToolStore.getState();

      restoreToolsForMessage('msg-1', [
        {
          id: 'tool-1',
          name: 'bash',
          input: { command: 'ls' },
          output: 'file1',
          success: true,
          contentOffset: 12,
          ordinal: 3,
        },
        {
          id: 'tool-2',
          name: 'write',
          input: { path: '/test' },
          success: false,
          ordinal: 4,
        },
      ]);

      const completed = useToolStore.getState().completedTools;
      expect(completed).toHaveLength(2);
      expect(completed[0]?.toolName).toBe('bash');
      expect(completed[0]?.status).toBe('success');
      expect(completed[0]?.contentOffset).toBe(12);
      expect(completed[0]?.ordinal).toBe(3);
      expect(completed[1]?.status).toBe('error');
      expect(completed[1]?.ordinal).toBe(4);
    });

    it('should not add duplicate tools', () => {
      const { restoreToolsForMessage } = useToolStore.getState();

      restoreToolsForMessage('msg-1', [{ id: 'tool-1', name: 'bash', input: {}, success: true }]);

      restoreToolsForMessage('msg-1', [{ id: 'tool-1', name: 'bash', input: {}, success: true }]);

      expect(useToolStore.getState().completedTools).toHaveLength(1);
    });
  });

  // ============================================================================
  // Reset
  // ============================================================================

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const {
        setInputMode,
        setThinkingMode,
        setModel,
        startTool,
        addUsage,
        addPermissionRequest,
        switchSession,
        reset,
      } = useToolStore.getState();

      // Set up various state
      setInputMode('accept');
      setThinkingMode('ultra');
      setModel('claude-opus-4-6');
      switchSession('session-1');
      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      addUsage('msg-1', { input_tokens: 100, output_tokens: 50 });
      addPermissionRequest(createMockPermissionRequest('req-1'));

      // Reset
      reset();

      const state = useToolStore.getState();
      expect(state.inputMode).toBe('default');
      expect(state.thinkingMode).toBe('ultra');
      expect(state.model).toBe('claude-sonnet-4-6');
      expect(state.activeTools).toEqual({});
      expect(state.completedTools).toEqual([]);
      expect(state.pendingPermissions).toEqual([]);
      expect(state.currentSessionId).toBeNull();
      expect(state.sessionUsage.inputTokens).toBe(0);
      expect(state.sessionCache).toEqual({});
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid tool start/complete cycles', () => {
      const { startTool, completeTool } = useToolStore.getState();

      for (let i = 0; i < 100; i++) {
        startTool(`tool-${String(i)}`, 'msg-1', 'bash', createMockToolInput());
        completeTool(`tool-${String(i)}`, `output-${String(i)}`, true);
      }

      const state = useToolStore.getState();
      expect(state.activeTools).toEqual({});
      expect(state.completedTools).toHaveLength(100);
    });

    it('should handle session switching with tools', () => {
      const { switchSession, startTool, completeTool, getToolsForMessage } =
        useToolStore.getState();

      // Session 1
      switchSession('session-1');
      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      completeTool('tool-1', 'output', true);

      // Session 2
      switchSession('session-2');
      startTool('tool-2', 'msg-2', 'write', createMockToolInput());

      // Back to Session 1
      switchSession('session-1');

      // Session 1 tools should be restored
      const tools = getToolsForMessage('msg-1');
      expect(tools).toHaveLength(1);
      expect(tools[0]?.id).toBe('tool-1');
    });

    it('should handle concurrent tools correctly', () => {
      const { startTool, completeTool, getToolsForMessage } = useToolStore.getState();

      // Start multiple tools at once
      startTool('tool-1', 'msg-1', 'bash', createMockToolInput());
      startTool('tool-2', 'msg-1', 'write', createMockToolInput());
      startTool('tool-3', 'msg-1', 'read', createMockToolInput());

      // Complete them in different order
      completeTool('tool-2', 'output-2', true);
      completeTool('tool-1', 'output-1', true);
      completeTool('tool-3', 'output-3', true);

      const state = useToolStore.getState();
      expect(state.activeTools).toEqual({});
      expect(state.completedTools).toHaveLength(3);

      const tools = getToolsForMessage('msg-1');
      expect(tools).toHaveLength(3);
    });

    it('should preserve tool order through session switches', () => {
      const { switchSession, startTool, completeTool, getToolsForMessage } =
        useToolStore.getState();

      switchSession('session-1');
      startTool('tool-1', 'msg-1', 'first', createMockToolInput());
      mockTime += 1000;
      startTool('tool-2', 'msg-1', 'second', createMockToolInput());
      completeTool('tool-1', 'output', true);
      completeTool('tool-2', 'output', true);

      // Switch away and back
      switchSession('session-2');
      switchSession('session-1');

      const tools = getToolsForMessage('msg-1');
      expect(tools[0]?.toolName).toBe('first');
      expect(tools[1]?.toolName).toBe('second');
    });
  });
});
