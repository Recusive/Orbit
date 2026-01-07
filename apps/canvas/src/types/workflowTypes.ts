/**
 * Workflow Mode Types
 * Types for the AI-assisted planning canvas with connected markdown cards
 */

// ============================================================================
// Card Types
// ============================================================================

/**
 * The five card types with distinct visual styling
 */
export type CardType = 'prompt' | 'response' | 'decision' | 'diagram' | 'code-snippet' | 'document';

/**
 * Card type configuration for styling and display
 */
export interface CardTypeConfig {
  type: CardType;
  label: string;
  icon: string;
  accentColor: string;
  description: string;
}

export const CARD_TYPE_CONFIGS: Record<CardType, CardTypeConfig> = {
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    icon: 'question',
    accentColor: 'var(--blue-500)',
    description: 'A question or prompt for AI assistance',
  },
  response: {
    type: 'response',
    label: 'Response',
    icon: 'ai',
    accentColor: 'var(--green-500)',
    description: 'AI-generated response or content',
  },
  decision: {
    type: 'decision',
    label: 'Decision',
    icon: 'branch',
    accentColor: 'var(--yellow-500)',
    description: 'A decision point or choice to be made',
  },
  diagram: {
    type: 'diagram',
    label: 'Diagram',
    icon: 'flow',
    accentColor: 'var(--purple-500)',
    description: 'Visual diagram or flowchart (Mermaid)',
  },
  'code-snippet': {
    type: 'code-snippet',
    label: 'Code',
    icon: 'code',
    accentColor: 'var(--gray-500)',
    description: 'Code snippet or implementation details',
  },
  document: {
    type: 'document',
    label: 'Document',
    icon: 'markdown',
    accentColor: 'var(--brand-olive)',
    description: 'Markdown document or notes',
  },
};

// ============================================================================
// Line Selection & Ranges
// ============================================================================

/**
 * Represents a range of lines within a card
 */
export interface LineRange {
  start: number;
  end: number;
}

// ============================================================================
// AI Agent Assignment
// ============================================================================

/**
 * Supported AI agent types
 */
export type AgentType = 'claude' | 'codex' | 'gemini';

/**
 * Scope of AI assignment - entire card or specific lines
 */
export type AssignmentScope = 'card' | 'lines';

/**
 * Configuration for assigning a card or lines to an AI agent
 */
export interface AgentAssignment {
  id: string;
  agentType: AgentType;
  scope: AssignmentScope;
  lineRanges?: LineRange[];
  prompt?: string;
  createdAt: number;
}

// ============================================================================
// Cross-References (Design/Code Tab Links)
// ============================================================================

/**
 * Type of element being referenced
 */
export type ElementType = 'design' | 'code';

/**
 * Reference to an element in Design or Code tabs
 */
export interface ElementReference {
  id: string;
  type: ElementType;
  elementId: string;
  elementName: string;
  nodeType?: string;
}

// ============================================================================
// File Sync (Markdown File Integration)
// ============================================================================

/**
 * File synchronization mode for cards linked to markdown files
 */
export type FileSyncMode = 'none' | 'read' | 'write' | 'bidirectional';

/**
 * Represents a conflict between card content and file content
 */
export interface FileConflict {
  diskContent: string;
  detectedAt: number;
}

// ============================================================================
// Card History (Undo/Redo)
// ============================================================================

/**
 * A snapshot of card state for history
 */
export interface CardState {
  content: string;
  name: string;
  type: CardType;
  timestamp: number;
}

// ============================================================================
// Markdown Card
// ============================================================================

/**
 * The main markdown card node data structure
 */
export interface MarkdownCard {
  id: string;
  name: string;
  content: string;
  type: CardType;
  tags: string[];

  // History (local undo/redo)
  history: CardState[];
  historyIndex: number;

  // UI State
  collapsed: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  locked: boolean;

  // Selection
  selectedRanges: LineRange[];

  // AI Assignment
  agentAssignments: AgentAssignment[];
  inheritContext: boolean;

  // Cross-references to Design/Code elements
  linkedElements: ElementReference[];

  // File Integration (link card to markdown file on disk)
  filePath?: string;
  fileSync: FileSyncMode;
  lastFileSyncAt?: number;
  fileConflict?: FileConflict;

  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/**
 * Default values for creating a new card
 */
export const DEFAULT_CARD: Omit<MarkdownCard, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
  name: 'New Card',
  content: '# New Card\n\nStart writing your content here...',
  type: 'prompt',
  tags: [],
  history: [],
  historyIndex: -1,
  collapsed: true,
  position: { x: 0, y: 0 },
  size: { width: 320, height: 200 },
  locked: false,
  selectedRanges: [],
  agentAssignments: [],
  inheritContext: true,
  linkedElements: [],
  fileSync: 'none',
};

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Direction of data/context flow
 */
export type ConnectionDirection = 'unidirectional' | 'bidirectional';

/**
 * How context should flow through this connection
 */
export type ContextFlowType = 'full' | 'summary' | 'none';

/**
 * Visual style for connection edges
 */
export interface ConnectionStyle {
  color?: string;
  strokeWidth?: number;
  animated?: boolean;
  dashed?: boolean;
}

/**
 * Connection between two cards
 */
export interface WorkflowConnection {
  id: string;
  sourceCardId: string;
  targetCardId: string;

  // Handle IDs for which side of the card to connect
  sourceHandle?: string;
  targetHandle?: string;

  // User-defined label and description
  label: string;
  description?: string;
  direction: ConnectionDirection;

  // AI Context settings
  contextFlow: ContextFlowType;
  priority: number;

  // Visual styling
  style: ConnectionStyle;

  // Metadata
  createdAt: number;
  createdBy: string;
}

/**
 * Default connection values
 */
export const DEFAULT_CONNECTION: Omit<
  WorkflowConnection,
  'id' | 'sourceCardId' | 'targetCardId' | 'createdAt' | 'createdBy'
> = {
  label: '',
  direction: 'unidirectional',
  contextFlow: 'full',
  priority: 1,
  style: {
    animated: false,
    dashed: false,
  },
};

// ============================================================================
// Collaborator & Permissions
// ============================================================================

/**
 * Visibility levels for workflows
 */
export type WorkflowVisibility = 'private' | 'team' | 'public';

/**
 * Collaborator roles
 */
export type CollaboratorRole = 'viewer' | 'editor' | 'admin';

/**
 * A collaborator on a workflow
 */
export interface Collaborator {
  userId: string;
  userName?: string;
  role: CollaboratorRole;
  addedAt: number;
}

// ============================================================================
// Workflow Snapshots (Version History)
// ============================================================================

/**
 * A saved snapshot of the workflow state
 */
export interface WorkflowSnapshot {
  id: string;
  name: string;
  description?: string;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
  createdAt: number;
  createdBy: string;
}

// ============================================================================
// Workflow Metadata (for listing)
// ============================================================================

/**
 * Lightweight workflow metadata for listing without full content
 */
export interface WorkflowMetadata {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  cardCount: number;
  connectionCount: number;
  snapshotCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Shared card metadata for library listings (without full content)
 */
export interface SharedCardMetadata {
  id: string;
  name: string;
  type: CardType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// ============================================================================
// Workflow
// ============================================================================

/**
 * The main workflow data structure
 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  tags: string[];

  // Content (IDs reference cards and connections in store)
  cardIds: string[];
  connectionIds: string[];

  // Versioning
  snapshots: WorkflowSnapshot[];
  currentSnapshotId: string | null;

  // Permissions
  owner: string;
  visibility: WorkflowVisibility;
  collaborators: Collaborator[];

  // Relationships
  parentWorkflowId?: string;
  linkedWorkflowIds: string[];
  forkOf?: string;
  isTemplate: boolean;

  // Metadata
  createdAt: number;
  updatedAt: number;
}

/**
 * Default workflow values
 */
export const DEFAULT_WORKFLOW: Omit<Workflow, 'id' | 'owner' | 'createdAt' | 'updatedAt'> = {
  name: 'New Workflow',
  tags: [],
  cardIds: [],
  connectionIds: [],
  snapshots: [],
  currentSnapshotId: null,
  visibility: 'private',
  collaborators: [],
  linkedWorkflowIds: [],
  isTemplate: false,
};

// ============================================================================
// ReactFlow Node Data
// ============================================================================

/**
 * Data passed to the MarkdownCardNode ReactFlow component
 */
export interface MarkdownCardNodeData {
  card: MarkdownCard;
  onUpdate?: (cardId: string, updates: Partial<MarkdownCard>) => void;
  onDelete?: (cardId: string) => void;
  onDuplicate?: (cardId: string) => void;
  onToggleCollapse?: (cardId: string) => void;
  onStartEdit?: (cardId: string) => void;
  onLineSelect?: (cardId: string, ranges: LineRange[]) => void;
  onAssignAgent?: (cardId: string, agentType: AgentType) => void;
  onExpand?: (cardId: string) => void;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

/**
 * Data passed to the WorkflowEdge ReactFlow component
 */
export interface WorkflowEdgeData {
  connection: WorkflowConnection;
  onUpdate?: (connectionId: string, updates: Partial<WorkflowConnection>) => void;
  onDelete?: (connectionId: string) => void;
  onEditLabel?: (connectionId: string) => void;
  // Index signature for ReactFlow compatibility
  [key: string]: unknown;
}

// ============================================================================
// UI State
// ============================================================================

/**
 * Selection state for the workflow canvas
 */
export interface WorkflowSelection {
  selectedCardIds: string[];
  selectedConnectionIds: string[];
  focusedCardId: string | null;
  lineSelections: Record<string, LineRange[]>;
}

/**
 * AI Prompt panel state
 */
export interface AIPromptState {
  isOpen: boolean;
  selectedAgent: AgentType;
  prompt: string;
  contextCardIds: string[];
  contextLineRanges: Record<string, LineRange[]>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new markdown card with defaults
 */
export function createMarkdownCard(
  partial: Partial<MarkdownCard> & { id: string; createdBy: string }
): MarkdownCard {
  const now = Date.now();
  return {
    ...DEFAULT_CARD,
    ...partial,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Create a new workflow connection with defaults
 */
export function createWorkflowConnection(
  partial: Partial<WorkflowConnection> & {
    id: string;
    sourceCardId: string;
    targetCardId: string;
    createdBy: string;
  }
): WorkflowConnection {
  return {
    ...DEFAULT_CONNECTION,
    ...partial,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/**
 * Create a new workflow with defaults
 */
export function createWorkflow(
  partial: Partial<Workflow> & { id: string; owner: string }
): Workflow {
  const now = Date.now();
  return {
    ...DEFAULT_WORKFLOW,
    ...partial,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Get display color for card type
 */
export function getCardTypeColor(type: CardType): string {
  return CARD_TYPE_CONFIGS[type].accentColor;
}

/**
 * Get display label for card type
 */
export function getCardTypeLabel(type: CardType): string {
  return CARD_TYPE_CONFIGS[type].label;
}
