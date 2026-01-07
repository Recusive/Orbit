# Sub-Agent Orchestrator Architecture

## Technical Report for Orbit Canvas

**Version:** 0.1.0  
**Date:** December 2024  
**Status:** Research & Design Phase

---

## Executive Summary

This report evaluates sub-agent orchestration patterns for Orbit Canvas, where multiple specialized AI agents collaborate to transform user intent into visual designs. The goal: faster, higher-quality design generation through parallelism and specialization.

**Key Findings:**

- Hybrid orchestration (sequential → parallel → merge) offers best trade-off
- Region-based locking prevents most merge conflicts
- Estimated 40-60% latency reduction for complex designs
- Significant implementation complexity; recommend phased rollout

---

## 1. Problem Statement

### Current State: Single Agent

```
User Intent → [Single Agent] → Canvas Output
                    │
                    ├── Parse intent
                    ├── Plan layout
                    ├── Generate components
                    ├── Apply styles
                    ├── Handle interactions
                    └── Emit code
```

**Limitations:**

- Sequential processing bottleneck
- Single model handles all domains (layout, styling, components)
- No specialization = jack of all trades, master of none
- Long wait times for complex designs (10-30s)

### Desired State: Orchestrated Sub-Agents

```
User Intent → [Orchestrator] → Task Graph
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              [Layout]      [Component]      [Style]
                    │              │              │
                    └──────────────┼──────────────┘
                                   ▼
                            [Merge & Emit]
```

**Goals:**

- Reduce latency through parallelism
- Improve quality through specialization
- Enable incremental rendering (show progress)
- Scale capabilities by adding agents

---

## 2. Architecture Patterns

### 2.1 Pattern A: Pure Orchestrator

```
┌─────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Task Decomposition Engine               │    │
│  │  • Parse user intent                                 │    │
│  │  • Identify required capabilities                    │    │
│  │  • Build dependency graph                            │    │
│  │  • Allocate to sub-agents                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │  Layout   │   │ Component │   │   Style   │
   │   Agent   │   │   Agent   │   │   Agent   │
   ├───────────┤   ├───────────┤   ├───────────┤
   │ • Grid    │   │ • Buttons │   │ • Colors  │
   │ • Flexbox │   │ • Cards   │   │ • Fonts   │
   │ • Spacing │   │ • Forms   │   │ • Shadows │
   │ • Regions │   │ • Tables  │   │ • Borders │
   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
              ┌─────────────────────┐
              │   Conflict Resolver │
              │   & State Merger    │
              └─────────────────────┘
```

**Orchestrator Responsibilities:**

1. Intent parsing and capability mapping
2. Task graph construction
3. Dependency resolution
4. Sub-agent dispatch
5. Result aggregation
6. Conflict resolution

**Sub-Agent Contract:**

```typescript
interface SubAgent {
  id: string;
  capabilities: Capability[];

  // What context does this agent need?
  contextRequirements(): ContextSpec;

  // What will this agent produce?
  outputSpec(): OutputSpec;

  // Execute task with provided context
  execute(task: Task, context: Context): Promise<AgentOutput>;

  // Estimated tokens/time for task
  estimate(task: Task): ResourceEstimate;
}

interface Capability {
  domain: 'layout' | 'component' | 'style' | 'interaction' | 'accessibility';
  operations: string[]; // e.g., ['create-grid', 'adjust-spacing']
}
```

**Pros:**

- Maximum parallelism potential
- Clean separation of concerns
- Easy to add new agents
- Agents can be different models (cheap for simple tasks)

**Cons:**

- Complex coordination logic
- Merge conflicts between agents
- Context duplication across agents
- Orchestrator becomes bottleneck/single point of failure

---

### 2.2 Pattern B: Pipeline

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Layout  │──▶│Component │──▶│  Style   │──▶│Interaction│
│  Agent   │   │  Agent   │   │  Agent   │   │  Agent   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
  Layout         + Components   + Styles      + Events
  Structure        placed        applied       bound
```

**Stage Contract:**

```typescript
interface PipelineStage {
  order: number;
  agent: SubAgent;

  // Transform input state to output state
  process(state: CanvasState): Promise<CanvasState>;

  // Can this stage run given current state?
  canProcess(state: CanvasState): boolean;
}
```

**Pros:**

- No merge conflicts (sequential)
- Each stage has full context from previous
- Simple mental model
- Easy to debug (trace through stages)

**Cons:**

- Zero parallelism
- Total latency = sum of all stages
- Error in early stage blocks everything
- Can't do styling until components exist

---

### 2.3 Pattern C: Hybrid (Recommended)

```
                    ┌──────────────────┐
                    │   Orchestrator   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       ┌─────────────┐              ┌─────────────┐
       │   PHASE 1   │              │   PHASE 1   │
       │  Sequential │              │  (parallel  │
       │   Layout    │              │   if multi- │
       │             │              │   region)   │
       └──────┬──────┘              └──────┬──────┘
              │                            │
              └──────────────┬─────────────┘
                             ▼
              ┌──────────────────────────────┐
              │          PHASE 2             │
              │    Parallel Refinement       │
              │  ┌─────────┐  ┌─────────┐   │
              │  │Component│  │  Style  │   │
              │  │  Agent  │  │  Agent  │   │
              │  └─────────┘  └─────────┘   │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │          PHASE 3             │
              │   Sequential Integration     │
              │  ┌─────────────────────────┐ │
              │  │   Integration Agent     │ │
              │  │   • Resolve conflicts   │ │
              │  │   • Ensure consistency  │ │
              │  │   • Final code gen      │ │
              │  └─────────────────────────┘ │
              └──────────────────────────────┘
```

**Phase Definitions:**

| Phase           | Purpose                     | Parallelism                        | Output                             |
| --------------- | --------------------------- | ---------------------------------- | ---------------------------------- |
| 1 - Layout      | Establish spatial structure | Sequential (or parallel by region) | Container hierarchy, grid, spacing |
| 2 - Refinement  | Fill in details             | Parallel                           | Components + styles (separate)     |
| 3 - Integration | Merge and finalize          | Sequential                         | Final coherent canvas state        |

**Why This Works:**

1. Layout must come first (creates spatial context for everything else)
2. Components and styles are independent concerns (can parallelize)
3. Integration catches conflicts and ensures coherence
4. Streaming possible: show layout → show components appearing → show styling applied

---

## 3. Coordination Mechanisms

### 3.1 Canvas State Locking

Prevent conflicts by giving agents exclusive access to regions:

```typescript
interface CanvasLockManager {
  locks: Map<string, Lock>;

  // Request exclusive access to region
  acquireLock(agentId: string, region: BoundingBox, timeout?: number): Promise<LockToken | null>;

  // Release lock
  releaseLock(token: LockToken): void;

  // Check if region is available
  isAvailable(region: BoundingBox): boolean;

  // Wait for region to become available
  waitForRegion(region: BoundingBox): Promise<void>;
}

interface Lock {
  agentId: string;
  region: BoundingBox;
  acquiredAt: number;
  expiresAt: number;
}

interface LockToken {
  id: string;
  agentId: string;
  region: BoundingBox;
}
```

**Locking Strategies:**

| Strategy       | Description                         | Use Case                                   |
| -------------- | ----------------------------------- | ------------------------------------------ |
| Region-based   | Lock rectangular canvas areas       | Parallel layout of separate sections       |
| Node-based     | Lock specific node IDs              | Parallel styling of different components   |
| Property-based | Lock specific properties            | One agent sets layout, another sets colors |
| Optimistic     | No locks, detect conflicts at merge | Low-conflict scenarios                     |

### 3.2 Dependency Graph

Model task dependencies explicitly:

```typescript
interface TaskGraph {
  tasks: Map<string, Task>;
  edges: Edge[]; // dependency relationships

  // Get tasks ready to execute (all deps satisfied)
  getReadyTasks(): Task[];

  // Mark task complete, unlock dependents
  complete(taskId: string, output: TaskOutput): void;

  // Get critical path (longest dependency chain)
  getCriticalPath(): Task[];
}

interface Task {
  id: string;
  agent: SubAgent;
  input: TaskInput;
  dependencies: string[]; // task IDs this depends on
  status: 'pending' | 'running' | 'complete' | 'failed';
}

// Example task graph for "Create dashboard with header and charts"
const graph: TaskGraph = {
  tasks: {
    'layout-main': { agent: layoutAgent, dependencies: [] },
    'layout-header': { agent: layoutAgent, dependencies: ['layout-main'] },
    'layout-charts': { agent: layoutAgent, dependencies: ['layout-main'] },
    'component-nav': { agent: componentAgent, dependencies: ['layout-header'] },
    'component-chart1': { agent: componentAgent, dependencies: ['layout-charts'] },
    'component-chart2': { agent: componentAgent, dependencies: ['layout-charts'] },
    'style-all': {
      agent: styleAgent,
      dependencies: ['component-nav', 'component-chart1', 'component-chart2'],
    },
    integrate: { agent: integrationAgent, dependencies: ['style-all'] },
  },
};
```

**Visualization:**

```
layout-main
    │
    ├── layout-header ── component-nav ──┐
    │                                     │
    └── layout-charts ─┬─ component-chart1 ├── style-all ── integrate
                       │                   │
                       └─ component-chart2 ┘
```

### 3.3 Context Passing

Agents need shared context without duplication overhead:

```typescript
interface ContextManager {
  // Base context all agents receive
  baseContext: BaseContext;

  // Agent-specific context derivation
  deriveContext(agent: SubAgent, task: Task): AgentContext;

  // Incremental context updates
  broadcastUpdate(update: ContextUpdate): void;
}

interface BaseContext {
  // Canvas state snapshot
  canvasState: CanvasSnapshot;

  // User's original intent
  userIntent: string;

  // Design system / theme tokens
  designTokens: DesignTokens;

  // Component library reference
  componentLibrary: ComponentLibrary;

  // Conversation history (relevant excerpts)
  conversationContext: Message[];
}

interface AgentContext extends BaseContext {
  // Agent's assigned task
  task: Task;

  // Outputs from dependency tasks
  dependencyOutputs: Map<string, TaskOutput>;

  // Region this agent is responsible for
  assignedRegion?: BoundingBox;

  // Constraints from other agents
  constraints: Constraint[];
}
```

**Context Scoping Strategies:**

| Strategy     | Description                    | Trade-off                            |
| ------------ | ------------------------------ | ------------------------------------ |
| Full context | Every agent gets everything    | Accurate but expensive (token usage) |
| Task-scoped  | Only relevant parts            | Efficient but may miss connections   |
| Hierarchical | Parent context + task-specific | Balanced approach                    |
| Delta-based  | Base + incremental updates     | Efficient for long-running tasks     |

### 3.4 Conflict Resolution

When parallel agents produce incompatible outputs:

```typescript
interface ConflictResolver {
  // Detect conflicts between agent outputs
  detectConflicts(outputs: AgentOutput[]): Conflict[];

  // Resolve conflicts using strategy
  resolve(conflict: Conflict, strategy: ResolutionStrategy): Resolution;

  // Merge resolved outputs into single state
  merge(outputs: AgentOutput[], resolutions: Resolution[]): CanvasState;
}

interface Conflict {
  type: 'position' | 'style' | 'hierarchy' | 'constraint';
  agents: string[];
  property: string;
  values: any[]; // conflicting values from each agent
  severity: 'critical' | 'warning' | 'info';
}

type ResolutionStrategy =
  | 'first-wins' // First agent's value
  | 'last-wins' // Last agent's value
  | 'priority-based' // Higher-priority agent wins
  | 'merge' // Combine values (e.g., merge styles)
  | 'ai-arbitrate' // Ask AI to decide
  | 'user-prompt'; // Ask user to decide
```

**Common Conflict Types:**

| Conflict        | Example                                            | Resolution                                     |
| --------------- | -------------------------------------------------- | ---------------------------------------------- |
| Position        | Layout says (100,200), Component assumes (150,250) | Use Layout agent's position (higher authority) |
| Style override  | Component sets blue, Style sets green              | Style agent wins (specialization)              |
| Size constraint | Component needs 300px, Layout allocated 250px      | AI arbitrate or expand layout                  |
| Z-index         | Two elements claim same layer                      | Priority-based (later in flow = higher)        |

---

## 4. Sub-Agent Specifications

### 4.1 Layout Agent

**Purpose:** Establish spatial structure and hierarchy

**Capabilities:**

- Grid system creation (CSS Grid, Flexbox)
- Spacing and alignment
- Responsive breakpoints
- Container hierarchy
- Region allocation for other agents

**Input:**

```typescript
interface LayoutTask {
  intent: string; // "dashboard with sidebar and main content"
  constraints: {
    viewport: { width: number; height: number };
    existingElements?: CanvasNode[]; // things to work around
    responsive: boolean;
  };
}
```

**Output:**

```typescript
interface LayoutOutput {
  // Hierarchical container structure
  containers: Container[];

  // CSS/Tailwind for layout
  layoutCode: string;

  // Regions available for other agents
  allocatedRegions: Map<string, BoundingBox>;

  // Constraints for child elements
  childConstraints: Constraint[];
}

interface Container {
  id: string;
  type: 'grid' | 'flex' | 'absolute';
  bounds: BoundingBox;
  children: string[]; // container or slot IDs
  styles: LayoutStyles;
}
```

**Model Requirements:**

- Strong spatial reasoning
- CSS Grid/Flexbox expertise
- Responsive design patterns
- Can be smaller model (layout is constrained domain)

---

### 4.2 Component Agent

**Purpose:** Generate UI components to fill layout slots

**Capabilities:**

- Component selection from library
- Custom component generation
- Component composition
- Props and state setup
- Accessibility attributes

**Input:**

```typescript
interface ComponentTask {
  intent: string; // "user profile card with avatar"
  slot: {
    id: string;
    bounds: BoundingBox;
    constraints: Constraint[];
  };
  designTokens: DesignTokens;
  componentLibrary: ComponentLibrary;
}
```

**Output:**

```typescript
interface ComponentOutput {
  // Component tree for this slot
  component: ComponentNode;

  // React/JSX code
  code: string;

  // Required imports
  imports: Import[];

  // Props interface
  propsInterface?: string;

  // Accessibility annotations
  a11y: A11yAnnotation[];
}

interface ComponentNode {
  type: string; // 'Card', 'Button', 'Avatar'
  props: Record<string, any>;
  children: ComponentNode[];
  sourceLibrary?: string; // 'shadcn', 'custom', etc.
}
```

**Model Requirements:**

- Component library knowledge
- React/JSX generation
- Accessibility awareness
- Can leverage fine-tuned model on component patterns

---

### 4.3 Style Agent

**Purpose:** Apply visual styling consistently

**Capabilities:**

- Color application (from tokens or generated)
- Typography settings
- Effects (shadows, borders, gradients)
- Animations and transitions
- Theme consistency enforcement

**Input:**

```typescript
interface StyleTask {
  intent: string; // "modern, clean, with purple accents"
  targets: ComponentNode[]; // what to style
  designTokens: DesignTokens;
  existingStyles?: StyleMap; // styles already applied
}
```

**Output:**

```typescript
interface StyleOutput {
  // Style assignments per element
  styles: Map<string, Styles>;

  // Tailwind classes or CSS
  code: string;

  // Updated design tokens (if generated new colors)
  tokenUpdates?: Partial<DesignTokens>;

  // Animation definitions
  animations?: Animation[];
}
```

**Model Requirements:**

- Color theory understanding
- Typography expertise
- Design trend awareness
- Consistency enforcement
- Can be specialized/fine-tuned model

---

### 4.4 Integration Agent

**Purpose:** Merge outputs and ensure coherence

**Capabilities:**

- Conflict detection and resolution
- Code merging
- Consistency validation
- Final optimization
- Export preparation

**Input:**

```typescript
interface IntegrationTask {
  layoutOutput: LayoutOutput;
  componentOutputs: ComponentOutput[];
  styleOutput: StyleOutput;
  conflicts: Conflict[];
}
```

**Output:**

```typescript
interface IntegrationOutput {
  // Final merged canvas state
  canvasState: CanvasState;

  // Complete React code
  code: string;

  // Validation results
  validation: ValidationResult;

  // Suggestions for improvement
  suggestions?: string[];
}
```

**Model Requirements:**

- Code merging expertise
- Holistic design sense
- Error detection
- Should be capable model (Sonnet/Opus class)

---

## 5. Implementation Plan

### Phase 1: Instrumented Single Agent (2-3 weeks)

**Goal:** Baseline metrics before optimization

**Tasks:**

1. Add timing instrumentation to current agent
2. Log task breakdown (time spent on layout vs components vs styling)
3. Measure user satisfaction per design complexity
4. Identify bottlenecks

**Metrics to Capture:**

```typescript
interface AgentMetrics {
  taskId: string;
  totalLatency: number;

  // Time breakdown
  intentParsing: number;
  layoutGeneration: number;
  componentGeneration: number;
  styleApplication: number;
  codeEmission: number;

  // Quality signals
  userRevisions: number; // how many follow-up prompts
  exportedSuccessfully: boolean;

  // Complexity estimate
  nodeCount: number;
  uniqueComponents: number;
}
```

### Phase 2: Prototype Orchestrator (4-6 weeks)

**Goal:** Validate hybrid pattern on limited scope

**Tasks:**

1. Implement Orchestrator core (task decomposition, dispatch)
2. Build Layout Agent as separate module
3. Build Style Agent as separate module
4. Implement region-based locking
5. Build Integration Agent for merging

**Limited Scope:**

- Only for new "Create dashboard" type requests
- Fall back to single agent for edits/iterations
- A/B test: 10% of users get orchestrator

### Phase 3: Expand and Optimize (6-8 weeks)

**Goal:** Full orchestrator coverage with optimization

**Tasks:**

1. Add Component Agent
2. Implement dependency graph execution
3. Add streaming updates (show progress)
4. Optimize context passing (reduce token usage)
5. Add conflict resolution strategies
6. Implement fallback to single agent on failure

### Phase 4: Advanced Features (8-12 weeks)

**Goal:** Sophisticated coordination

**Tasks:**

1. Learning from conflicts (reduce future occurrences)
2. Agent specialization per project type
3. User preference learning (style agent remembers preferences)
4. Multi-model optimization (cheap models for simple tasks)

---

## 6. Risk Analysis

### 6.1 Technical Risks

| Risk                                        | Probability | Impact | Mitigation                                    |
| ------------------------------------------- | ----------- | ------ | --------------------------------------------- |
| Merge conflicts degrade quality             | Medium      | High   | Robust conflict resolution, extensive testing |
| Coordination overhead negates latency gains | Medium      | High   | Measure early, optimize context passing       |
| Context window limits with multiple agents  | High        | Medium | Context scoping, summarization                |
| Agent outputs incompatible                  | Medium      | Medium | Strict output schemas, validation             |
| Single agent fallback needed frequently     | Low         | Low    | Graceful degradation built-in                 |

### 6.2 Operational Risks

| Risk                                     | Probability | Impact | Mitigation                           |
| ---------------------------------------- | ----------- | ------ | ------------------------------------ |
| Cost increase (more LLM calls)           | High        | Medium | Use smaller models for simple agents |
| Debugging complexity                     | High        | Medium | Comprehensive logging, trace IDs     |
| User confusion from inconsistent results | Medium      | High   | Integration agent ensures coherence  |

### 6.3 Success Criteria

| Metric              | Target                   | Measurement                              |
| ------------------- | ------------------------ | ---------------------------------------- |
| Latency reduction   | 40%+ for complex designs | Time to first render, time to complete   |
| Quality maintenance | No degradation           | User revision count, export success rate |
| Cost efficiency     | <2x single agent cost    | LLM API costs per design                 |
| Reliability         | 99%+ success rate        | Successful completions vs failures       |

---

## 7. Open Questions

### Architecture

1. Should orchestrator be AI-powered or rule-based?
   - AI: More flexible, handles edge cases
   - Rules: Faster, predictable, cheaper
   - Hybrid: Rules for common patterns, AI for complex

2. How to handle iterative edits after initial creation?
   - Re-run full orchestration?
   - Route to single relevant agent?
   - Lightweight "edit agent"?

3. What's the right granularity for sub-agents?
   - Coarse: Layout / Component / Style (3 agents)
   - Fine: Grid / Flexbox / Button / Card / Color / Typography (many agents)
   - Answer likely depends on task complexity

### User Experience

4. How to visualize multi-agent progress?
   - Show which agent is working?
   - Progressive rendering as each completes?
   - Simple spinner until done?

5. How to handle partial failures?
   - Show incomplete result?
   - Retry failed agent?
   - Fall back to single agent?

### Performance

6. What's the optimal parallelism level?
   - Too few: Miss latency gains
   - Too many: Coordination overhead dominates

7. Should we cache agent outputs?
   - "User asked for blue button before, reuse that"
   - Risk: Stale results, over-fitting

---

## 8. Appendix: Sequence Diagrams

### A. Happy Path: Dashboard Creation

```
User          Orchestrator      Layout        Component      Style         Integration
  │                │              │              │              │              │
  │ "Dashboard     │              │              │              │              │
  │  with charts"  │              │              │              │              │
  │───────────────▶│              │              │              │              │
  │                │              │              │              │              │
  │                │ Decompose    │              │              │              │
  │                │─────────────▶│              │              │              │
  │                │              │              │              │              │
  │                │   Task:      │              │              │              │
  │                │   Layout     │              │              │              │
  │                │─────────────▶│              │              │              │
  │                │              │              │              │              │
  │                │              │ Generate     │              │              │
  │                │              │ grid layout  │              │              │
  │                │              │──────────────│              │              │
  │                │              │              │              │              │
  │                │◀─────────────│              │              │              │
  │                │  LayoutOutput│              │              │              │
  │                │              │              │              │              │
  │ [Show layout]  │              │              │              │              │
  │◀───────────────│              │              │              │              │
  │                │              │              │              │              │
  │                │ Parallel dispatch          │              │              │
  │                │─────────────────────────────▶              │              │
  │                │──────────────────────────────────────────▶│              │
  │                │              │              │              │              │
  │                │              │ [Generate    │ [Generate    │              │
  │                │              │  components] │  styles]     │              │
  │                │              │              │              │              │
  │                │◀─────────────────────────────              │              │
  │                │◀──────────────────────────────────────────│              │
  │                │              │              │              │              │
  │ [Show progress]│              │              │              │              │
  │◀───────────────│              │              │              │              │
  │                │              │              │              │              │
  │                │ Merge & Integrate                         │              │
  │                │────────────────────────────────────────────────────────▶│
  │                │              │              │              │              │
  │                │              │              │              │   Resolve    │
  │                │              │              │              │   conflicts  │
  │                │              │              │              │──────────────│
  │                │              │              │              │              │
  │                │◀────────────────────────────────────────────────────────│
  │                │              │              │              │              │
  │ [Final result] │              │              │              │              │
  │◀───────────────│              │              │              │              │
  │                │              │              │              │              │
```

### B. Conflict Resolution Flow

```
ComponentAgent                StyleAgent               Integration
      │                            │                        │
      │ Output: Button at (100,200)│                        │
      │ color: blue                │                        │
      │────────────────────────────────────────────────────▶│
      │                            │                        │
      │                            │ Output: Button style   │
      │                            │ color: green           │
      │                            │───────────────────────▶│
      │                            │                        │
      │                            │                        │ Detect conflict:
      │                            │                        │ color: blue vs green
      │                            │                        │─────────────────────
      │                            │                        │
      │                            │                        │ Apply strategy:
      │                            │                        │ StyleAgent wins
      │                            │                        │ (specialization)
      │                            │                        │─────────────────────
      │                            │                        │
      │                            │                        │ Emit: Button
      │                            │                        │ position: (100,200)
      │                            │                        │ color: green
      │                            │                        │─────────────────────▶
      │                            │                        │
```

---

## 9. References

1. Multi-Agent Systems: A Survey (Wooldridge, 2009)
2. Coordination in Multi-Agent Systems (Malone & Crowston, 1994)
3. Design Patterns for AI Agents (Anthropic Internal, 2024)
4. ReactFlow Documentation - Node-based UI
5. VS Code Extension API - WebView Communication

---
