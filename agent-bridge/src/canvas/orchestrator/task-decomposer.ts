/*---------------------------------------------------------------------------------------------
 *  TaskDecomposer - Builds dependency graphs using the Skeleton Strategy
 *
 *  Hierarchical Pipelining:
 *  Stage 1 (Blocking): LayoutAgent creates skeleton with stable node IDs
 *  Stage 2 (Parallel): ComponentAgents fill disjoint tree branches
 *  Stage 3 (Parallel): StyleAgent polishes CSS after components stable
 *  Stage 4 (Blocking): IntegrationAgent merges and validates
 *--------------------------------------------------------------------------------------------*/

import { createLogger } from '../../logger.js';

import type {
  AgentType,
  CanvasSnapshot,
  DecompositionResult,
  IntentAnalysis,
  Task,
  TaskGraph,
  TaskStage,
} from './types.js';

const logger = createLogger('TaskDecomposer');

/**
 * Generate a unique task ID
 */
function generateTaskId(type: AgentType, index: number): string {
  return `task-${type}-${String(index)}-${Date.now().toString(36)}`;
}

/**
 * Generate a unique graph ID
 */
function generateGraphId(): string {
  return `graph-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Stage definitions for the hierarchical pipeline
 */
const STAGE_DEFINITIONS = {
  layout: {
    id: 0,
    name: 'Layout',
    blocking: true,
  },
  components: {
    id: 1,
    name: 'Components',
    blocking: false, // Parallel execution
  },
  style: {
    id: 2,
    name: 'Style',
    blocking: false, // Parallel execution
  },
  integration: {
    id: 3,
    name: 'Integration',
    blocking: true,
  },
} as const;

/**
 * Component extraction from user intent
 */
interface ExtractedComponent {
  name: string;
  description: string;
  type: 'button' | 'card' | 'form' | 'nav' | 'header' | 'footer' | 'sidebar' | 'modal' | 'custom';
}

/**
 * Layout extraction from user intent
 */
interface ExtractedLayout {
  type: 'flex' | 'grid' | 'stack';
  columns?: number;
  areas?: string[];
  description: string;
}

/**
 * TaskDecomposer - Builds task graphs from user intent
 */
export class TaskDecomposer {
  constructor() {
    logger.info('TaskDecomposer initialized');
  }

  /**
   * Decompose an analyzed intent into a task graph
   */
  decompose(analysis: IntentAnalysis, canvasState?: CanvasSnapshot): DecompositionResult {
    logger.info(
      { category: analysis.category, complexity: analysis.complexity },
      'Decomposing intent into task graph'
    );

    // Fast path: single task, no graph needed
    if (analysis.useFastPath && analysis.fastPathAgent) {
      return this.createFastPathGraph(analysis);
    }

    // Full orchestration: build multi-stage graph
    return this.createFullGraph(analysis, canvasState);
  }

  /**
   * Create a simple single-task graph for fast path
   */
  private createFastPathGraph(analysis: IntentAnalysis): DecompositionResult {
    const agentType = analysis.fastPathAgent ?? 'component';
    const taskId = generateTaskId(agentType, 0);

    const task: Task = {
      id: taskId,
      type: agentType,
      agentId: `${agentType}-agent-0`,
      prompt: analysis.userIntent,
      dependencies: [],
      status: 'pending',
      assignedNodeIds: analysis.referencedNodeIds,
    };

    const stage: TaskStage = {
      id: 0,
      name: this.getAgentStageName(agentType),
      taskIds: [taskId],
      blocking: true,
      status: 'pending',
    };

    const graph: TaskGraph = {
      id: generateGraphId(),
      userIntent: analysis.userIntent,
      tasks: new Map([[taskId, task]]),
      stages: [stage],
      createdAt: Date.now(),
    };

    logger.info({ taskId, agentType }, 'Created fast path graph');

    return {
      graph,
      analysis,
      estimatedDuration: 5000, // ~5s for single task
    };
  }

  /**
   * Create a full multi-stage task graph
   */
  private createFullGraph(
    analysis: IntentAnalysis,
    canvasState?: CanvasSnapshot
  ): DecompositionResult {
    const tasks = new Map<string, Task>();
    const stages: TaskStage[] = [];

    // Extract what needs to be built
    const layout = this.extractLayoutRequirements(analysis.userIntent);
    const components = this.extractComponentRequirements(analysis.userIntent);
    const hasStyleChanges = this.hasStyleRequirements(analysis.userIntent);

    // Stage 0: Layout (Blocking)
    const layoutTasks = this.createLayoutTasks(analysis, layout, canvasState);
    const layoutTaskIds = layoutTasks.map((t) => t.id);

    for (const task of layoutTasks) {
      tasks.set(task.id, task);
    }

    if (layoutTaskIds.length > 0) {
      stages.push({
        id: STAGE_DEFINITIONS.layout.id,
        name: STAGE_DEFINITIONS.layout.name,
        taskIds: layoutTaskIds,
        blocking: true,
        status: 'pending',
      });
    }

    // Stage 1: Components (Parallel)
    const componentTasks = this.createComponentTasks(analysis, components, layoutTaskIds);
    const componentTaskIds = componentTasks.map((t) => t.id);

    for (const task of componentTasks) {
      tasks.set(task.id, task);
    }

    if (componentTaskIds.length > 0) {
      stages.push({
        id: STAGE_DEFINITIONS.components.id,
        name: STAGE_DEFINITIONS.components.name,
        taskIds: componentTaskIds,
        blocking: false, // Parallel execution
        status: 'pending',
      });
    }

    // Stage 2: Style (Parallel, after components)
    if (hasStyleChanges) {
      const styleTasks = this.createStyleTasks(analysis, componentTaskIds);

      for (const task of styleTasks) {
        tasks.set(task.id, task);
      }

      stages.push({
        id: STAGE_DEFINITIONS.style.id,
        name: STAGE_DEFINITIONS.style.name,
        taskIds: styleTasks.map((t) => t.id),
        blocking: false,
        status: 'pending',
      });
    }

    // Stage 3: Integration (Blocking, final)
    const allPreviousTaskIds = [...tasks.keys()];
    const integrationTasks = this.createIntegrationTasks(analysis, allPreviousTaskIds);

    for (const task of integrationTasks) {
      tasks.set(task.id, task);
    }

    if (integrationTasks.length > 0) {
      stages.push({
        id: STAGE_DEFINITIONS.integration.id,
        name: STAGE_DEFINITIONS.integration.name,
        taskIds: integrationTasks.map((t) => t.id),
        blocking: true,
        status: 'pending',
      });
    }

    const graph: TaskGraph = {
      id: generateGraphId(),
      userIntent: analysis.userIntent,
      tasks,
      stages,
      createdAt: Date.now(),
    };

    logger.info(
      {
        graphId: graph.id,
        taskCount: tasks.size,
        stageCount: stages.length,
      },
      'Created full orchestration graph'
    );

    return {
      graph,
      analysis,
      estimatedDuration: this.estimateDuration(tasks.size, stages.length),
    };
  }

  /**
   * Extract layout requirements from the prompt
   */
  private extractLayoutRequirements(prompt: string): ExtractedLayout | null {
    const lowerPrompt = prompt.toLowerCase();

    // Check for grid layouts
    const gridMatch = /(\d+)\s*(?:x\s*(\d+))?\s*(?:column|col|grid)/.exec(lowerPrompt);
    if (gridMatch?.[1]) {
      const cols = parseInt(gridMatch[1], 10);
      return {
        type: 'grid',
        columns: cols,
        description: `${String(cols)}-column grid layout`,
      };
    }

    // Check for flex layouts
    if (/\b(?:flex|row|horizontal)\b/.test(lowerPrompt)) {
      return {
        type: 'flex',
        description: 'Flex row layout',
      };
    }

    if (/\b(?:stack|vertical|column)\b/.test(lowerPrompt)) {
      return {
        type: 'stack',
        description: 'Vertical stack layout',
      };
    }

    // Full page layouts
    if (/\b(?:page|dashboard|landing|app)\b/.test(lowerPrompt)) {
      return {
        type: 'grid',
        areas: ['header', 'sidebar', 'main', 'footer'],
        description: 'Full page layout with header, sidebar, main, and footer',
      };
    }

    return null;
  }

  /**
   * Extract component requirements from the prompt
   */
  private extractComponentRequirements(prompt: string): ExtractedComponent[] {
    const components: ExtractedComponent[] = [];
    const lowerPrompt = prompt.toLowerCase();

    const componentPatterns: {
      pattern: RegExp;
      type: ExtractedComponent['type'];
    }[] = [
      { pattern: /\bbutton\b/g, type: 'button' },
      { pattern: /\bcard\b/g, type: 'card' },
      { pattern: /\bform\b/g, type: 'form' },
      { pattern: /\bnav(?:igation|bar)?\b/g, type: 'nav' },
      { pattern: /\bheader\b/g, type: 'header' },
      { pattern: /\bfooter\b/g, type: 'footer' },
      { pattern: /\bsidebar\b/g, type: 'sidebar' },
      { pattern: /\bmodal\b/g, type: 'modal' },
    ];

    for (const { pattern, type } of componentPatterns) {
      const matches = lowerPrompt.match(pattern);
      if (matches) {
        // Add one component per match
        for (let i = 0; i < matches.length; i++) {
          components.push({
            name: `${type}${i > 0 ? String(i + 1) : ''}`,
            description: `Create ${type} component`,
            type,
          });
        }
      }
    }

    // If no specific components found but full page, add defaults
    if (components.length === 0 && /\b(?:page|dashboard|landing)\b/.test(lowerPrompt)) {
      components.push(
        { name: 'header', description: 'Create header component', type: 'header' },
        { name: 'main', description: 'Create main content component', type: 'custom' },
        { name: 'footer', description: 'Create footer component', type: 'footer' }
      );
    }

    return components;
  }

  /**
   * Check if the prompt includes style requirements
   */
  private hasStyleRequirements(prompt: string): boolean {
    const stylePatterns = [
      /\bstyle[sd]?\b/i,
      /\btheme\b/i,
      /\bdark\s*mode\b/i,
      /\bcolor\b/i,
      /\banimation\b/i,
      /\bbeautiful\b/i,
      /\bmodern\b/i,
      /\bclean\b/i,
      /\bminimal(?:ist)?\b/i,
    ];

    return stylePatterns.some((p) => p.test(prompt));
  }

  /**
   * Create layout tasks (Stage 0)
   */
  private createLayoutTasks(
    analysis: IntentAnalysis,
    layout: ExtractedLayout | null,
    _canvasState?: CanvasSnapshot
  ): Task[] {
    void _canvasState; // Reserved for future use
    // Skip layout stage if not needed
    if (!layout && analysis.category !== 'layout-change' && analysis.category !== 'full-page') {
      return [];
    }

    const taskId = generateTaskId('layout', 0);
    const layoutDescription = layout?.description ?? 'Create layout structure';

    const task: Task = {
      id: taskId,
      type: 'layout',
      agentId: 'layout-agent-0',
      prompt: `${layoutDescription}\n\nContext: ${analysis.userIntent}`,
      dependencies: [],
      status: 'pending',
      assignedNodeIds: [],
    };

    return [task];
  }

  /**
   * Create component tasks (Stage 1)
   */
  private createComponentTasks(
    analysis: IntentAnalysis,
    components: ExtractedComponent[],
    layoutDependencies: string[]
  ): Task[] {
    // If no specific components but it's a component creation task
    if (components.length === 0 && analysis.category === 'create-component') {
      const taskId = generateTaskId('component', 0);
      return [
        {
          id: taskId,
          type: 'component',
          agentId: 'component-agent-0',
          prompt: analysis.userIntent,
          dependencies: layoutDependencies,
          status: 'pending',
          assignedNodeIds: [],
        },
      ];
    }

    // Create a task for each component
    return components.map((component, index) => {
      const taskId = generateTaskId('component', index);
      return {
        id: taskId,
        type: 'component' as AgentType,
        agentId: `component-agent-${String(index)}`,
        prompt: `${component.description} (${component.name})\n\nContext: ${analysis.userIntent}`,
        dependencies: layoutDependencies,
        status: 'pending' as const,
        assignedNodeIds: [],
      };
    });
  }

  /**
   * Create style tasks (Stage 2)
   */
  private createStyleTasks(analysis: IntentAnalysis, componentDependencies: string[]): Task[] {
    const taskId = generateTaskId('style', 0);

    return [
      {
        id: taskId,
        type: 'style',
        agentId: 'style-agent-0',
        prompt: `Apply styling and polish to the components.\n\nContext: ${analysis.userIntent}`,
        dependencies: componentDependencies,
        status: 'pending',
        assignedNodeIds: [],
      },
    ];
  }

  /**
   * Create integration tasks (Stage 3)
   */
  private createIntegrationTasks(analysis: IntentAnalysis, allDependencies: string[]): Task[] {
    // Only create integration task for complex orchestrations
    if (allDependencies.length <= 1) {
      return [];
    }

    const taskId = generateTaskId('integration', 0);

    return [
      {
        id: taskId,
        type: 'integration',
        agentId: 'integration-agent-0',
        prompt: `Merge and validate all components. Ensure consistency and proper connections.\n\nContext: ${analysis.userIntent}`,
        dependencies: allDependencies,
        status: 'pending',
        assignedNodeIds: [],
      },
    ];
  }

  /**
   * Get stage name for an agent type
   */
  private getAgentStageName(type: AgentType): string {
    const names: Record<AgentType, string> = {
      layout: 'Layout',
      component: 'Component',
      style: 'Style',
      integration: 'Integration',
    };
    return names[type];
  }

  /**
   * Estimate total duration based on task count and stages
   */
  private estimateDuration(taskCount: number, stageCount: number): number {
    // Base: ~3s per task, but parallel tasks reduce time
    const basePerTask = 3000;
    const parallelReduction = 0.5;

    // Rough estimate: sequential stages + parallel benefit
    return Math.ceil(basePerTask * taskCount * parallelReduction * stageCount * 0.5);
  }
}

/**
 * Singleton instance
 */
let decomposerInstance: TaskDecomposer | null = null;

/**
 * Get or create the TaskDecomposer singleton
 */
export function getTaskDecomposer(): TaskDecomposer {
  decomposerInstance ??= new TaskDecomposer();
  return decomposerInstance;
}

/**
 * Create a fresh TaskDecomposer (for testing or isolation)
 */
export function createTaskDecomposer(): TaskDecomposer {
  return new TaskDecomposer();
}
