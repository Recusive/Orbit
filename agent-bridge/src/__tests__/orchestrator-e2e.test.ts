/*---------------------------------------------------------------------------------------------
 *  Orchestrator E2E Integration Tests
 *
 *  Tests the full orchestrator pipeline with real Claude API calls.
 *
 *  Prerequisites:
 *  - OAuth credentials from Claude Code CLI (stored in macOS Keychain)
 *  - Or ANTHROPIC_API_KEY environment variable as fallback
 *
 *  Run with:
 *  cd agent-bridge && bun test orchestrator-e2e --timeout 300000
 *--------------------------------------------------------------------------------------------*/

import { describe, test, expect, afterEach } from 'bun:test';

import {
  // Orchestrator
  createOrchestrator,
  // Components
  createBlackboard,
  createIntentAnalyzer,
  createTaskDecomposer,
  createNodeLockManager,
  // Agents
  createLayoutAgent,
  createComponentAgent,
  createStyleAgent,
  createIntegrationAgent,
  // Types
} from '../canvas/index.js';
import { ClaudeCredentials } from '../common/auth/credentials.js';
import { createLogger } from '../common/logging/logger.js';

const logger = createLogger('orchestrator-e2e');

import type { CanvasSnapshot, OrchestratorState, TaskOutput } from '../canvas/index.js';

// Check for credentials (OAuth from Keychain or API key fallback)
const credentials = ClaudeCredentials.getCredentials();
const hasCredentials = credentials.hasCredentials;
const describeWithApi = hasCredentials ? describe : describe.skip;

// ============================================================================
// Unit Tests (No API Required)
// ============================================================================

describe('Orchestrator Unit Tests (No API)', () => {
  // Test 1: Intent Analyzer classifies intents correctly
  test('IntentAnalyzer classifies simple intents for fast path', () => {
    const analyzer = createIntentAnalyzer();

    // Simple intent → fast path (pattern: "add a button")
    const simpleResult = analyzer.analyze('Add a button');
    expect(simpleResult.useFastPath).toBe(true);
    expect(simpleResult.category).toBe('create-component');
    expect(simpleResult.complexity).toBe('simple');
    expect(simpleResult.fastPathAgent).toBe('component');
  });

  test('IntentAnalyzer classifies complex intents for full orchestration', () => {
    const analyzer = createIntentAnalyzer();

    // Complex intent → full orchestration
    const complexResult = analyzer.analyze(
      'Create a dashboard with a header, sidebar navigation, and a grid of metric cards'
    );
    expect(complexResult.useFastPath).toBe(false);
    expect(complexResult.complexity).toBe('complex');
  });

  test('IntentAnalyzer detects style-change category', () => {
    const analyzer = createIntentAnalyzer();

    const styleResult = analyzer.analyze('Change the background color to blue');
    expect(styleResult.category).toBe('style-change');
    expect(styleResult.fastPathAgent).toBe('style');
  });

  test('IntentAnalyzer detects layout-change category', () => {
    const analyzer = createIntentAnalyzer();

    const layoutResult = analyzer.analyze('Create a two-column layout');
    expect(layoutResult.category).toBe('layout-change');
  });

  test('IntentAnalyzer detects full-page category', () => {
    const analyzer = createIntentAnalyzer();

    const pageResult = analyzer.analyze('Build a landing page for my product');
    expect(pageResult.category).toBe('full-page');
    expect(pageResult.useFastPath).toBe(false);
  });

  // Test 2: Task Decomposer creates valid task graphs
  test('TaskDecomposer creates valid task graph for simple intent', () => {
    const analyzer = createIntentAnalyzer();
    const decomposer = createTaskDecomposer();

    const analysis = analyzer.analyze('Create a button component');
    const result = decomposer.decompose(analysis);

    expect(result.graph).toBeDefined();
    expect(result.graph.tasks.size).toBeGreaterThan(0);
    expect(result.graph.stages.length).toBeGreaterThan(0);
  });

  test('TaskDecomposer creates multi-stage graph for complex intent', () => {
    const analyzer = createIntentAnalyzer();
    const decomposer = createTaskDecomposer();

    const analysis = analyzer.analyze('Create a landing page with hero section and feature cards');
    const result = decomposer.decompose(analysis);

    expect(result.graph).toBeDefined();
    expect(result.graph.stages.length).toBeGreaterThan(1);
    expect(result.graph.tasks.size).toBeGreaterThan(1);

    // Verify stage order: layout → component → style → integration
    const stageNames = result.graph.stages.map((s) => s.name);
    expect(stageNames).toContain('Layout');
  });

  // Test 3: Blackboard state management
  test('Blackboard manages canvas state correctly', () => {
    const blackboard = createBlackboard();

    const mockState: CanvasSnapshot = {
      nodes: [
        {
          id: 'node-1',
          type: 'sandpack',
          position: { x: 0, y: 0 },
          data: { name: 'Button', label: 'Primary Button' },
        },
        {
          id: 'node-2',
          type: 'page',
          position: { x: 100, y: 0 },
          data: { name: 'Container', label: 'Main Container' },
        },
      ],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    };

    blackboard.setCanvasState(mockState);
    const slice = blackboard.getSlice(['node-1']);

    expect(slice.relevantNodes.length).toBeGreaterThan(0);
    expect(slice.relevantNodes.some((n) => n.id === 'node-1')).toBe(true);
  });

  test('Blackboard getSlice includes connected nodes', () => {
    const blackboard = createBlackboard();

    const mockState: CanvasSnapshot = {
      nodes: [
        { id: 'node-1', type: 'sandpack', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-2', type: 'sandpack', position: { x: 100, y: 0 }, data: {} },
        { id: 'node-3', type: 'sandpack', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    };

    blackboard.setCanvasState(mockState);

    // Get slice for node-1, should include connected node-2
    const slice = blackboard.getSlice(['node-1'], { includeConnected: true });
    expect(slice.relevantNodes.some((n) => n.id === 'node-2')).toBe(true);
  });

  test('Blackboard manages pending changes', () => {
    const blackboard = createBlackboard();

    blackboard.setCanvasState({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    });

    // Add pending changes
    blackboard.addPendingChanges('task-1', [
      { type: 'create', nodeId: 'new-node', after: { name: 'NewButton' } },
    ]);

    const pending = blackboard.getPendingChanges('task-1');
    expect(pending.length).toBe(1);
    expect(pending[0]?.nodeId).toBe('new-node');

    // Commit changes
    const committed = blackboard.commitChanges('task-1');
    expect(committed.length).toBe(1);

    // Pending should now be empty
    const afterCommit = blackboard.getPendingChanges('task-1');
    expect(afterCommit.length).toBe(0);
  });

  test('Blackboard tracks task outputs', () => {
    const blackboard = createBlackboard();

    const output: TaskOutput = {
      success: true,
      changes: [{ type: 'create', nodeId: 'node-1' }],
      nodeIds: ['node-1'],
    };

    blackboard.setTaskOutput('task-1', output);
    const retrieved = blackboard.getTaskOutput('task-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.success).toBe(true);
    expect(retrieved?.nodeIds).toContain('node-1');
  });

  // Test 4: Node Lock Manager handles concurrent locks
  test('NodeLockManager acquires and releases locks', () => {
    const lockManager = createNodeLockManager();

    // Acquire lock
    const result1 = lockManager.acquireLock({
      taskId: 'task-1',
      agentId: 'agent-1',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });
    expect(result1.success).toBe(true);
    expect(result1.lock).toBeDefined();

    // Release lock
    const released = lockManager.releaseLock('task-1', 'node-1');
    expect(released).toBe(true);
  });

  test('NodeLockManager prevents conflicting write locks', () => {
    const lockManager = createNodeLockManager();

    // Acquire first lock
    const result1 = lockManager.acquireLock({
      taskId: 'task-1',
      agentId: 'agent-1',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });
    expect(result1.success).toBe(true);

    // Try to acquire conflicting lock from different agent
    const result2 = lockManager.acquireLock({
      taskId: 'task-2',
      agentId: 'agent-2',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });
    expect(result2.success).toBe(false);
    expect(result2.conflictingLock).toBeDefined();

    // Release first lock
    lockManager.releaseLock('task-1', 'node-1');

    // Now second agent can acquire
    const result3 = lockManager.acquireLock({
      taskId: 'task-2',
      agentId: 'agent-2',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });
    expect(result3.success).toBe(true);
  });

  test('NodeLockManager allows same agent to access own locks', () => {
    const lockManager = createNodeLockManager();

    // Acquire first lock
    lockManager.acquireLock({
      taskId: 'task-1',
      agentId: 'agent-1',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });

    // Same agent can access again (different task)
    const result2 = lockManager.acquireLock({
      taskId: 'task-2',
      agentId: 'agent-1',
      nodeId: 'node-1',
      type: 'read',
      timeout: 5000,
    });
    expect(result2.success).toBe(true);
  });

  test('NodeLockManager releaseAllLocks removes all locks for a task', () => {
    const lockManager = createNodeLockManager();

    // Acquire multiple locks
    lockManager.acquireLock({
      taskId: 'task-1',
      agentId: 'agent-1',
      nodeId: 'node-1',
      type: 'write',
      timeout: 5000,
    });
    lockManager.acquireLock({
      taskId: 'task-1',
      agentId: 'agent-1',
      nodeId: 'node-2',
      type: 'write',
      timeout: 5000,
    });

    expect(lockManager.getTotalLockCount()).toBe(2);

    // Release all locks for task
    const released = lockManager.releaseAllLocks('task-1');
    expect(released).toBe(2);
    expect(lockManager.getTotalLockCount()).toBe(0);
  });

  // Test 5: Agent creation
  test('LayoutAgent can be created', () => {
    const agent = createLayoutAgent('layout-test-1');
    expect(agent.id).toBe('layout-test-1');
    expect(agent.type).toBe('layout');
    expect(agent.getAgentName()).toBe('Layout');
    agent.dispose();
  });

  test('ComponentAgent can be created', () => {
    const agent = createComponentAgent('component-test-1');
    expect(agent.id).toBe('component-test-1');
    expect(agent.type).toBe('component');
    expect(agent.getAgentName()).toBe('Component');
    agent.dispose();
  });

  test('StyleAgent can be created', () => {
    const agent = createStyleAgent('style-test-1');
    expect(agent.id).toBe('style-test-1');
    expect(agent.type).toBe('style');
    expect(agent.getAgentName()).toBe('Style');
    agent.dispose();
  });

  test('IntegrationAgent can be created', () => {
    const agent = createIntegrationAgent('integration-test-1');
    expect(agent.id).toBe('integration-test-1');
    expect(agent.type).toBe('integration');
    expect(agent.getAgentName()).toBe('Integration');
    agent.dispose();
  });

  // Test 6: Orchestrator creation and state
  test('Orchestrator can be created with default config', () => {
    const orchestrator = createOrchestrator();
    const state = orchestrator.getState();

    expect(state.status).toBe('idle');
    expect(state.completedTasks).toBe(0);
    expect(state.totalTasks).toBe(0);
    expect(state.errors).toEqual([]);

    orchestrator.dispose();
  });

  test('Orchestrator can be created with custom config', () => {
    const orchestrator = createOrchestrator({
      enableFastPath: false,
      maxConcurrentTasks: 5,
      fastPathConfidenceThreshold: 0.8,
    });

    const state = orchestrator.getState();
    expect(state.status).toBe('idle');

    orchestrator.dispose();
  });

  test('Orchestrator emits state change events', () => {
    const orchestrator = createOrchestrator();
    const states: OrchestratorState[] = [];

    orchestrator.onStateChange((state) => {
      states.push(state);
    });

    // Trigger a state change
    orchestrator.setStatus('analyzing');

    expect(states.length).toBeGreaterThan(0);
    expect(states[states.length - 1]?.status).toBe('analyzing');

    orchestrator.dispose();
  });

  test('Orchestrator reset clears state', () => {
    const orchestrator = createOrchestrator();

    // Set some state
    orchestrator.setStatus('executing');

    // Reset
    orchestrator.reset();

    const state = orchestrator.getState();
    expect(state.status).toBe('idle');
    expect(state.completedTasks).toBe(0);

    orchestrator.dispose();
  });
});

// ============================================================================
// E2E Integration Tests (API Required)
// ============================================================================

describeWithApi('Orchestrator E2E Integration Tests (API Required)', () => {
  // Clean up agents after each test
  afterEach(() => {
    // Agents dispose themselves
  });

  // Test: Single agent with real API call
  test('LayoutAgent executes with real Claude API', async () => {
    const agent = createLayoutAgent('layout-e2e-1', {
      thinkingEnabled: false,
      timeout: 60000,
    });

    const textMessages: string[] = [];
    const toolUses: { name: string; id: string; input: unknown }[] = [];

    agent.onText((text) => {
      textMessages.push(text);
      logger.debug({ preview: text.slice(0, 100) }, 'Text received');
    });

    agent.onToolUse((tool) => {
      toolUses.push(tool);
      logger.debug({ name: tool.name }, 'Tool used');
    });

    agent.onThinking((thinking) => {
      logger.debug({ preview: thinking.slice(0, 100) }, 'Thinking');
    });

    const output = await agent.execute(
      {
        id: 'task-layout-1',
        type: 'layout',
        agentId: 'layout-e2e-1',
        prompt:
          'Describe a simple two-column layout with a sidebar on the left (250px) and main content area on the right. Just describe it in text, no tools needed.',
        dependencies: [],
        status: 'running',
        assignedNodeIds: [],
      },
      {
        relevantNodes: [],
        relevantEdges: [],
        constraints: [],
        siblingOutputs: new Map(),
      }
    );

    expect(output.success).toBe(true);
    expect(textMessages.length).toBeGreaterThan(0);

    logger.info({ output }, 'LayoutAgent completed');

    agent.dispose();
  }, 60000);

  // Test: ComponentAgent with real API call
  test('ComponentAgent executes with real Claude API', async () => {
    const agent = createComponentAgent('component-e2e-1', {
      thinkingEnabled: false,
      timeout: 60000,
    });

    const textMessages: string[] = [];

    agent.onText((text) => {
      textMessages.push(text);
      logger.debug({ preview: text.slice(0, 100) }, 'Text received');
    });

    const output = await agent.execute(
      {
        id: 'task-component-1',
        type: 'component',
        agentId: 'component-e2e-1',
        prompt:
          'Write a simple React button component with props for label and onClick. Just output the code in your response, no tools needed.',
        dependencies: [],
        status: 'running',
        assignedNodeIds: [],
      },
      {
        relevantNodes: [],
        relevantEdges: [],
        constraints: [],
        siblingOutputs: new Map(),
      }
    );

    expect(output.success).toBe(true);
    expect(textMessages.length).toBeGreaterThan(0);

    // Check that output contains React code
    const fullText = textMessages.join('');
    expect(fullText.toLowerCase()).toMatch(/button|onclick|react/i);

    logger.info({ output }, 'ComponentAgent completed');

    agent.dispose();
  }, 60000);

  // Test: Full orchestrator with simple intent
  test('Orchestrator processes simple intent end-to-end', () => {
    const orchestrator = createOrchestrator({
      enableFastPath: true,
      maxConcurrentTasks: 2,
    });

    const states: OrchestratorState[] = [];

    orchestrator.onStateChange((state) => {
      states.push(state);
      logger.debug(
        {
          status: state.status,
          currentStage: state.currentStage,
          totalStages: state.stages.length,
        },
        'State changed'
      );
    });

    orchestrator.onError((error) => {
      logger.error({ error }, 'Orchestrator error');
    });

    const canvasState: CanvasSnapshot = {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    };

    // Simple intent - just analyze (no execution without MCP server)
    const result = orchestrator.processIntent('Create a button component', canvasState);

    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.decomposition).toBeDefined();
    expect(result.analysis.category).toBe('create-component');

    logger.info(
      {
        category: result.analysis.category,
        complexity: result.analysis.complexity,
        useFastPath: result.analysis.useFastPath,
        taskCount: result.decomposition.graph.tasks.size,
      },
      'Orchestrator analysis completed'
    );

    orchestrator.dispose();
  }, 30000);

  // Test: Full orchestrator with complex intent
  test('Orchestrator processes complex intent end-to-end', () => {
    const orchestrator = createOrchestrator({
      enableFastPath: true,
      maxConcurrentTasks: 2,
    });

    const states: OrchestratorState[] = [];

    orchestrator.onStateChange((state) => {
      states.push(state);
      logger.debug(
        { status: state.status, completed: state.completedTasks, total: state.totalTasks },
        'State changed'
      );
    });

    const canvasState: CanvasSnapshot = {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      timestamp: Date.now(),
    };

    // Complex intent - full orchestration path
    const result = orchestrator.processIntent(
      'Create a pricing page with three pricing cards (Basic, Pro, Enterprise) arranged horizontally. Each card should have a title, price, feature list, and a CTA button.',
      canvasState
    );

    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.analysis.useFastPath).toBe(false);
    expect(result.decomposition.graph.stages.length).toBeGreaterThan(1);

    logger.info(
      {
        category: result.analysis.category,
        complexity: result.analysis.complexity,
        useFastPath: result.analysis.useFastPath,
        stageCount: result.decomposition.graph.stages.length,
        taskCount: result.decomposition.graph.tasks.size,
        stages: result.decomposition.graph.stages.map((s) => s.name),
      },
      'Complex intent analysis completed'
    );

    orchestrator.dispose();
  }, 30000);
});

// ============================================================================
// Stress Tests (Optional - Long Running)
// ============================================================================

describeWithApi('Orchestrator Stress Tests (API Required)', () => {
  // Only run if explicitly enabled
  const runStressTests = process.env.RUN_STRESS_TESTS === 'true';
  const stressTest = runStressTests ? test : test.skip;

  stressTest(
    'Multiple agents can execute concurrently',
    async () => {
      const agents = [
        createLayoutAgent('stress-layout-1'),
        createComponentAgent('stress-component-1'),
        createStyleAgent('stress-style-1'),
      ];

      const emptyContext = {
        relevantNodes: [],
        relevantEdges: [],
        constraints: [],
        siblingOutputs: new Map<string, TaskOutput>(),
      };

      const results = await Promise.all(
        agents.map((agent, i) =>
          agent.execute(
            {
              id: `stress-task-${String(i)}`,
              type: agent.type,
              agentId: agent.id,
              prompt: `Describe a ${agent.type} concept briefly in one sentence.`,
              dependencies: [],
              status: 'running',
              assignedNodeIds: [],
            },
            emptyContext
          )
        )
      );

      expect(results.every((r) => r.success)).toBe(true);

      logger.info(
        { results: results.map((r) => ({ success: r.success, changes: r.changes.length })) },
        'Concurrent execution completed'
      );

      agents.forEach((a) => {
        a.dispose();
      });
    },
    120000
  );
});
