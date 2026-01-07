/**
 * Blackboard Integration Tests
 *
 * Tests real orchestration scenarios with the Blackboard shared state manager.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import { createBlackboard } from '../canvas/orchestrator/blackboard.js';

import type { Blackboard } from '../canvas/orchestrator/blackboard.js';
import type { CanvasSnapshot, CanvasChange, TaskOutput } from '../canvas/orchestrator/types.js';

describe('Blackboard Integration - Multi-Agent Orchestration', () => {
  let blackboard: Blackboard;

  // Realistic canvas state representing a dashboard UI
  const dashboardState: CanvasSnapshot = {
    nodes: [
      // Root page
      {
        id: 'dashboard-page',
        type: 'page',
        position: { x: 0, y: 0 },
        data: { name: 'Dashboard', layout: 'grid' },
      },

      // Header section
      {
        id: 'header',
        type: 'sandpack',
        position: { x: 0, y: 0 },
        data: { name: 'Header', parentId: 'dashboard-page', code: '<header>Dashboard</header>' },
      },

      // Sidebar navigation
      {
        id: 'sidebar',
        type: 'sandpack',
        position: { x: 0, y: 60 },
        data: { name: 'Sidebar', parentId: 'dashboard-page', code: '<nav>Menu</nav>' },
      },

      // Main content area with nested components
      {
        id: 'main-content',
        type: 'sandpack',
        position: { x: 200, y: 60 },
        data: { name: 'MainContent', parentId: 'dashboard-page', code: '<main></main>' },
      },
      {
        id: 'stats-widget',
        type: 'sandpack',
        position: { x: 220, y: 80 },
        data: {
          name: 'StatsWidget',
          parentId: 'main-content',
          code: '<div class="stats">Stats</div>',
        },
      },
      {
        id: 'chart-widget',
        type: 'sandpack',
        position: { x: 220, y: 200 },
        data: {
          name: 'ChartWidget',
          parentId: 'main-content',
          code: '<div class="chart">Chart</div>',
        },
      },
      {
        id: 'table-widget',
        type: 'sandpack',
        position: { x: 220, y: 400 },
        data: { name: 'TableWidget', parentId: 'main-content', code: '<table></table>' },
      },

      // Footer
      {
        id: 'footer',
        type: 'sandpack',
        position: { x: 0, y: 600 },
        data: { name: 'Footer', parentId: 'dashboard-page', code: '<footer>© 2024</footer>' },
      },

      // Unrelated component (different page)
      {
        id: 'settings-page',
        type: 'page',
        position: { x: 1000, y: 0 },
        data: { name: 'Settings' },
      },
      {
        id: 'settings-form',
        type: 'sandpack',
        position: { x: 1000, y: 60 },
        data: { name: 'SettingsForm', parentId: 'settings-page', code: '<form></form>' },
      },
    ],
    edges: [
      // Data flow edges
      { id: 'header-to-sidebar', source: 'header', target: 'sidebar' },
      { id: 'sidebar-to-main', source: 'sidebar', target: 'main-content' },
      { id: 'stats-to-chart', source: 'stats-widget', target: 'chart-widget' },
      { id: 'chart-to-table', source: 'chart-widget', target: 'table-widget' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    timestamp: Date.now(),
    selectedNodeId: 'main-content',
  };

  beforeEach(() => {
    blackboard = createBlackboard();
    blackboard.setCanvasState(dashboardState);
  });

  describe('Real Orchestration: Layout Agent Workflow', () => {
    it('should provide correct context slice for layout agent working on main content', () => {
      // Layout agent needs to restructure the main content area
      // It should see: main-content, its children (stats, chart, table), parent (dashboard-page), and connected nodes

      const slice = blackboard.getSlice(['main-content'], {
        includeAncestors: true,
        includeDescendants: true,
        includeConnected: true,
        maxDepth: 3,
      });

      const nodeIds = slice.relevantNodes.map((n) => n.id);

      // Should include the target node
      expect(nodeIds).toContain('main-content');

      // Should include parent (dashboard-page)
      expect(nodeIds).toContain('dashboard-page');

      // Should include children
      expect(nodeIds).toContain('stats-widget');
      expect(nodeIds).toContain('chart-widget');
      expect(nodeIds).toContain('table-widget');

      // Should include connected via edges (sidebar connects to main-content)
      expect(nodeIds).toContain('sidebar');

      // Should NOT include unrelated components
      expect(nodeIds).not.toContain('settings-page');
      expect(nodeIds).not.toContain('settings-form');

      // Edges should only include those with both endpoints in slice
      expect(slice.relevantEdges.length).toBeGreaterThan(0);
      const edgeIds = slice.relevantEdges.map((e) => e.id);
      expect(edgeIds).toContain('sidebar-to-main');
      expect(edgeIds).toContain('stats-to-chart');
    });

    it('should track layout changes and commit them atomically', () => {
      const layoutTaskId = 'layout-task-001';

      // Layout agent proposes changes
      const layoutChanges: CanvasChange[] = [
        {
          type: 'move',
          nodeId: 'stats-widget',
          before: { x: 220, y: 80 },
          after: { x: 200, y: 100 },
        },
        {
          type: 'move',
          nodeId: 'chart-widget',
          before: { x: 220, y: 200 },
          after: { x: 400, y: 100 },
        },
        {
          type: 'move',
          nodeId: 'table-widget',
          before: { x: 220, y: 400 },
          after: { x: 200, y: 300 },
        },
        {
          type: 'update',
          nodeId: 'main-content',
          property: 'layout',
          before: undefined,
          after: 'grid-2x2',
        },
      ];

      blackboard.addPendingChanges(layoutTaskId, layoutChanges);

      // Verify changes are pending
      const pending = blackboard.getPendingChanges(layoutTaskId);
      expect(pending.length).toBe(4);

      // Original state should be unchanged
      const stateBefore = blackboard.getCanvasState();
      const statsWidget = stateBefore?.nodes.find((n) => n.id === 'stats-widget');
      expect(statsWidget?.position).toEqual({ x: 220, y: 80 });

      // Commit changes
      const committed = blackboard.commitChanges(layoutTaskId);
      expect(committed.length).toBe(4);

      // Verify state is updated
      const stateAfter = blackboard.getCanvasState();
      const statsWidgetAfter = stateAfter?.nodes.find((n) => n.id === 'stats-widget');
      expect(statsWidgetAfter?.position).toEqual({ x: 200, y: 100 });

      // Pending should be cleared
      expect(blackboard.getPendingChanges(layoutTaskId).length).toBe(0);
    });
  });

  describe('Real Orchestration: Component Agent Workflow', () => {
    it('should create new components and track ownership', () => {
      const componentTaskId = 'component-task-001';

      // Component agent creates a new notification widget
      const createChanges: CanvasChange[] = [
        {
          type: 'create',
          nodeId: 'notification-widget',
          after: {
            name: 'NotificationWidget',
            parentId: 'main-content',
            code: '<div class="notifications"><span class="badge">3</span></div>',
          },
        },
      ];

      blackboard.addPendingChanges(componentTaskId, createChanges);

      // Verify ownership
      expect(blackboard.getNodeOwner('notification-widget')).toBe(componentTaskId);
      expect(blackboard.isOwnedBy('notification-widget', componentTaskId)).toBe(true);
      expect(blackboard.isOwnedBy('notification-widget', 'other-task')).toBe(false);

      // Commit and verify node was added
      blackboard.commitChanges(componentTaskId);

      const state = blackboard.getCanvasState();
      const newNode = state?.nodes.find((n) => n.id === 'notification-widget');
      expect(newNode).toBeDefined();
      expect(newNode?.data.name).toBe('NotificationWidget');
    });

    it('should discard changes and clear ownership on failure', () => {
      const componentTaskId = 'component-task-002';

      blackboard.addPendingChanges(componentTaskId, [{ type: 'create', nodeId: 'failed-widget' }]);

      expect(blackboard.getNodeOwner('failed-widget')).toBe(componentTaskId);

      // Simulate task failure - discard changes
      blackboard.discardChanges(componentTaskId);

      // Ownership should be cleared
      expect(blackboard.getNodeOwner('failed-widget')).toBeUndefined();

      // Node should not exist in state
      const state = blackboard.getCanvasState();
      expect(state?.nodes.find((n) => n.id === 'failed-widget')).toBeUndefined();
    });
  });

  describe('Real Orchestration: Style Agent Workflow', () => {
    it('should apply style changes to existing components', () => {
      const styleTaskId = 'style-task-001';

      // Style agent updates the visual appearance
      const styleChanges: CanvasChange[] = [
        { type: 'style', nodeId: 'header', property: 'backgroundColor', after: '#1a1a2e' },
        { type: 'style', nodeId: 'header', property: 'color', after: '#ffffff' },
        { type: 'style', nodeId: 'sidebar', property: 'backgroundColor', after: '#16213e' },
        { type: 'style', nodeId: 'main-content', property: 'backgroundColor', after: '#0f3460' },
      ];

      blackboard.addPendingChanges(styleTaskId, styleChanges);
      blackboard.commitChanges(styleTaskId);

      const state = blackboard.getCanvasState();
      const header = state?.nodes.find((n) => n.id === 'header');
      const headerStyle = header?.data.style as Record<string, unknown> | undefined;

      expect(headerStyle?.backgroundColor).toBe('#1a1a2e');
      expect(headerStyle?.color).toBe('#ffffff');
    });
  });

  describe('Real Orchestration: Multi-Agent Coordination', () => {
    it('should share task outputs between sibling agents', () => {
      // Layout agent completes first
      const layoutOutput: TaskOutput = {
        success: true,
        changes: [{ type: 'move', nodeId: 'stats-widget', after: { x: 200, y: 100 } }],
        nodeIds: ['stats-widget', 'chart-widget', 'table-widget'],
        suggestions: ['Consider adding spacing between widgets'],
      };
      blackboard.setTaskOutput('layout-task', layoutOutput);

      // Component agent completes
      const componentOutput: TaskOutput = {
        success: true,
        changes: [{ type: 'create', nodeId: 'new-widget' }],
        nodeIds: ['new-widget'],
        code: '<div class="new-widget">New</div>',
      };
      blackboard.setTaskOutput('component-task', componentOutput);

      // Style agent gets context and should see sibling outputs
      const slice = blackboard.getSlice(['stats-widget'], {
        includeAncestors: true,
        includeDescendants: false,
        includeConnected: true,
      });

      // Should see layout task output (it modified stats-widget)
      expect(slice.siblingOutputs.has('layout-task')).toBe(true);
      expect(slice.siblingOutputs.get('layout-task')?.suggestions?.[0]).toBe(
        'Consider adding spacing between widgets'
      );
    });

    it('should handle parallel pending changes from multiple agents', () => {
      // Multiple agents working in parallel
      blackboard.addPendingChanges('layout-agent', [
        { type: 'move', nodeId: 'header', after: { x: 0, y: 0 } },
      ]);

      blackboard.addPendingChanges('style-agent', [
        { type: 'style', nodeId: 'header', property: 'padding', after: '16px' },
      ]);

      blackboard.addPendingChanges('component-agent', [
        { type: 'create', nodeId: 'logo', after: { name: 'Logo', parentId: 'header' } },
      ]);

      // All pending changes should be tracked separately
      const allPending = blackboard.getAllPendingChanges();
      expect(allPending.size).toBe(3);

      // Commit in order (simulating stage completion)
      blackboard.commitChanges('layout-agent');
      blackboard.commitChanges('style-agent');
      blackboard.commitChanges('component-agent');

      // All changes should be applied
      const state = blackboard.getCanvasState();
      expect(state?.nodes.find((n) => n.id === 'logo')).toBeDefined();

      const header = state?.nodes.find((n) => n.id === 'header');
      expect((header?.data.style as Record<string, unknown> | undefined)?.padding).toBe('16px');
    });
  });

  describe('Real Orchestration: Constraint Management', () => {
    it('should manage user, agent, and system constraints', () => {
      // User specifies constraints
      blackboard.addConstraint({
        type: 'style',
        source: 'user',
        property: 'theme',
        value: 'dark',
        priority: 10, // High priority
      });

      blackboard.addConstraint({
        type: 'accessibility',
        source: 'user',
        property: 'contrast',
        value: 'high',
        priority: 10,
      });

      // System adds responsive constraints
      blackboard.addConstraint({
        type: 'size',
        source: 'system',
        property: 'minWidth',
        value: 320,
        priority: 5,
      });

      // Agent suggests additional constraints
      blackboard.addConstraint({
        type: 'position',
        source: 'agent',
        property: 'gridGap',
        value: '16px',
        priority: 3,
      });

      // Get all constraints
      const allConstraints = blackboard.getConstraints();
      expect(allConstraints.length).toBe(4);

      // Filter by type
      const styleConstraints = blackboard.getConstraintsByType('style');
      expect(styleConstraints.length).toBe(1);
      expect(styleConstraints[0]?.value).toBe('dark');

      // Accessibility constraints should always be included in slices
      const accessibilityConstraints = blackboard.getConstraintsByType('accessibility');
      expect(accessibilityConstraints.length).toBe(1);

      // Clear agent constraints (e.g., for retry)
      blackboard.clearConstraints('agent');
      expect(blackboard.getConstraints().length).toBe(3);

      // User constraints should remain
      const remaining = blackboard.getConstraints();
      expect(remaining.some((c) => c.source === 'user')).toBe(true);
      expect(remaining.some((c) => c.source === 'agent')).toBe(false);
    });

    it('should include constraints in context slices', () => {
      blackboard.addConstraint({
        type: 'accessibility',
        source: 'user',
        property: 'ariaLabels',
        value: true,
        priority: 10,
      });

      const slice = blackboard.getSlice(['stats-widget']);

      // Accessibility constraints should always be included
      expect(slice.constraints.length).toBeGreaterThan(0);
      expect(slice.constraints.some((c) => c.type === 'accessibility')).toBe(true);
    });
  });

  describe('Real Orchestration: Full Workflow Reset', () => {
    it('should reset all state for new orchestration run', () => {
      // Simulate a complete orchestration run
      blackboard.addPendingChanges('task-1', [{ type: 'create', nodeId: 'temp-node' }]);
      blackboard.setTaskOutput('task-1', { success: true, changes: [], nodeIds: ['temp-node'] });
      blackboard.addConstraint({
        type: 'style',
        source: 'user',
        property: 'theme',
        value: 'dark',
        priority: 1,
      });

      // Reset for new run
      blackboard.reset();

      // All state should be cleared
      expect(blackboard.getCanvasState()).toBeNull();
      expect(blackboard.getPendingChanges('task-1').length).toBe(0);
      expect(blackboard.getTaskOutput('task-1')).toBeUndefined();
      expect(blackboard.getConstraints().length).toBe(0);
      expect(blackboard.getNodeOwner('temp-node')).toBeUndefined();

      // Full slice should be empty
      const slice = blackboard.getFullSlice();
      expect(slice.relevantNodes.length).toBe(0);
      expect(slice.relevantEdges.length).toBe(0);
    });
  });

  describe('Real Orchestration: Delete Operations', () => {
    it('should properly delete nodes and associated edges', () => {
      const deleteTaskId = 'delete-task-001';

      // Delete chart-widget (has edges to stats and table)
      blackboard.addPendingChanges(deleteTaskId, [{ type: 'delete', nodeId: 'chart-widget' }]);

      blackboard.commitChanges(deleteTaskId);

      const state = blackboard.getCanvasState();

      // Node should be gone
      expect(state?.nodes.find((n) => n.id === 'chart-widget')).toBeUndefined();

      // Edges involving deleted node should be removed
      const remainingEdges = state?.edges.filter(
        (e) => e.source === 'chart-widget' || e.target === 'chart-widget'
      );
      expect(remainingEdges?.length).toBe(0);

      // Other edges should remain
      expect(state?.edges.find((e) => e.id === 'header-to-sidebar')).toBeDefined();
    });
  });
});
