/**
 * Workflow Templates
 * Predefined workflow patterns for common use cases
 */

import React, { useState, useCallback } from 'react';

import { radii, fontWeight, shadows, spacing } from '../../lib/design/designTokens';
import { createMarkdownCard, createWorkflowConnection } from '../../types/workflowTypes';

import type { MarkdownCard, WorkflowConnection } from '../../types/workflowTypes';

// ============================================================================
// Template Types
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  cards: Omit<
    MarkdownCard,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'createdBy'
    | 'history'
    | 'historyIndex'
    | 'agentAssignments'
    | 'linkedElements'
  >[];
  connections: {
    sourceIndex: number;
    targetIndex: number;
    label: string;
  }[];
}

// ============================================================================
// Template Definitions
// ============================================================================

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'feature-development',
    name: 'Feature Development',
    description: 'Plan and implement a new feature from requirements to deployment',
    icon: 'rocket',
    cards: [
      {
        name: 'Feature Requirements',
        type: 'prompt',
        content: `# Feature: [Name]

## Problem Statement
What problem does this feature solve?

## User Stories
- As a [user type], I want to [action] so that [benefit]

## Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3`,
        tags: ['requirements', 'planning'],
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Technical Design',
        type: 'response',
        content: `# Technical Design

## Architecture Overview
High-level design...

## Components
1. Component A
2. Component B

## Data Flow
Describe how data flows through the system...

## API Changes
List any API changes needed...`,
        tags: ['design', 'technical'],
        collapsed: false,
        position: { x: 500, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Implementation Decision',
        type: 'decision',
        content: `# Implementation Approach

## Decision
We will implement using [approach]...

## Rationale
- Reason 1
- Reason 2

## Trade-offs
- Trade-off 1
- Trade-off 2`,
        tags: ['decision'],
        collapsed: false,
        position: { x: 300, y: 350 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Implementation Tasks',
        type: 'code-snippet',
        content: `# Implementation Tasks

## Phase 1: Core
- [ ] Task 1
- [ ] Task 2

## Phase 2: Integration
- [ ] Task 3
- [ ] Task 4

## Phase 3: Testing
- [ ] Unit tests
- [ ] Integration tests`,
        tags: ['implementation', 'tasks'],
        collapsed: false,
        position: { x: 100, y: 550 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Architecture Diagram',
        type: 'diagram',
        content: `# Architecture

\`\`\`mermaid
flowchart TD
    A[Client] --> B[API Gateway]
    B --> C[Service]
    C --> D[Database]
\`\`\``,
        tags: ['diagram', 'architecture'],
        collapsed: false,
        position: { x: 500, y: 550 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
    ],
    connections: [
      { sourceIndex: 0, targetIndex: 1, label: 'analyzed by' },
      { sourceIndex: 1, targetIndex: 2, label: 'leads to' },
      { sourceIndex: 2, targetIndex: 3, label: 'implements' },
      { sourceIndex: 2, targetIndex: 4, label: 'documented in' },
    ],
  },
  {
    id: 'bug-investigation',
    name: 'Bug Investigation',
    description: 'Investigate and fix a bug systematically',
    icon: 'bug',
    cards: [
      {
        name: 'Bug Report',
        type: 'prompt',
        content: `# Bug: [Title]

## Description
Brief description...

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected vs Actual
- Expected: ...
- Actual: ...`,
        tags: ['bug', 'report'],
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Root Cause Analysis',
        type: 'response',
        content: `# Root Cause Analysis

## Investigation
Steps taken to investigate...

## Findings
1. Finding 1
2. Finding 2

## Root Cause
The bug is caused by...`,
        tags: ['analysis', 'rca'],
        collapsed: false,
        position: { x: 500, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Fix Decision',
        type: 'decision',
        content: `# Fix Approach

## Options
1. Option A: Quick fix
2. Option B: Proper refactor

## Decision
We will go with...

## Rationale
Because...`,
        tags: ['decision', 'fix'],
        collapsed: false,
        position: { x: 300, y: 350 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Fix Implementation',
        type: 'code-snippet',
        content: `# Fix Implementation

## Changes
\`\`\`typescript
// Before
oldCode();

// After
newCode();
\`\`\`

## Testing
- [ ] Unit test added
- [ ] Regression test passed`,
        tags: ['fix', 'code'],
        collapsed: false,
        position: { x: 300, y: 550 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
    ],
    connections: [
      { sourceIndex: 0, targetIndex: 1, label: 'investigated in' },
      { sourceIndex: 1, targetIndex: 2, label: 'leads to' },
      { sourceIndex: 2, targetIndex: 3, label: 'implements' },
    ],
  },
  {
    id: 'api-design',
    name: 'API Design',
    description: 'Design a new API endpoint or service',
    icon: 'api',
    cards: [
      {
        name: 'API Requirements',
        type: 'prompt',
        content: `# API: [Name]

## Purpose
What does this API do?

## Use Cases
1. Use case 1
2. Use case 2

## Consumers
- Consumer 1
- Consumer 2`,
        tags: ['api', 'requirements'],
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'API Specification',
        type: 'code-snippet',
        content: `# API Specification

## Endpoint
\`\`\`
POST /api/v1/resource
\`\`\`

## Request
\`\`\`json
{
  "field": "value"
}
\`\`\`

## Response
\`\`\`json
{
  "id": "123",
  "status": "success"
}
\`\`\``,
        tags: ['api', 'spec'],
        collapsed: false,
        position: { x: 500, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Data Model',
        type: 'code-snippet',
        content: `# Data Model

\`\`\`typescript
interface Resource {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
\`\`\``,
        tags: ['data', 'model'],
        collapsed: false,
        position: { x: 100, y: 350 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Sequence Diagram',
        type: 'diagram',
        content: `# API Flow

\`\`\`mermaid
sequenceDiagram
    Client->>API: POST /resource
    API->>DB: Insert
    DB-->>API: Result
    API-->>Client: 201 Created
\`\`\``,
        tags: ['diagram', 'sequence'],
        collapsed: false,
        position: { x: 500, y: 350 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
    ],
    connections: [
      { sourceIndex: 0, targetIndex: 1, label: 'specifies' },
      { sourceIndex: 1, targetIndex: 2, label: 'uses' },
      { sourceIndex: 1, targetIndex: 3, label: 'documented in' },
    ],
  },
  {
    id: 'research-spike',
    name: 'Research Spike',
    description: 'Explore a technical question or unknown',
    icon: 'search',
    cards: [
      {
        name: 'Research Question',
        type: 'prompt',
        content: `# Research: [Topic]

## Question
What are we trying to learn?

## Context
Why is this important?

## Success Criteria
How will we know we have an answer?`,
        tags: ['research', 'question'],
        collapsed: false,
        position: { x: 100, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Findings',
        type: 'response',
        content: `# Research Findings

## Summary
Key findings...

## Details
1. Finding 1
2. Finding 2
3. Finding 3

## Resources
- Resource 1
- Resource 2`,
        tags: ['research', 'findings'],
        collapsed: false,
        position: { x: 500, y: 100 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
      {
        name: 'Recommendation',
        type: 'decision',
        content: `# Recommendation

## Conclusion
Based on research, we recommend...

## Next Steps
1. Step 1
2. Step 2

## Open Questions
- Question 1?`,
        tags: ['recommendation'],
        collapsed: false,
        position: { x: 300, y: 350 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
    ],
    connections: [
      { sourceIndex: 0, targetIndex: 1, label: 'researched in' },
      { sourceIndex: 1, targetIndex: 2, label: 'leads to' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Workflow',
    description: 'Start with a single empty card',
    icon: 'plus',
    cards: [
      {
        name: 'New Card',
        type: 'prompt',
        content: `# Getting Started

Start writing your content here...

## Tips
- Double-click canvas to add more cards
- Drag between cards to connect them
- Right-click for more options`,
        tags: [],
        collapsed: false,
        position: { x: 300, y: 200 },
        size: { width: 320, height: 200 },
        locked: false,
        selectedRanges: [],
        inheritContext: true,
        fileSync: 'none',
      },
    ],
    connections: [],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function createWorkflowFromTemplate(
  template: WorkflowTemplate,
  userId: string
): { cards: MarkdownCard[]; connections: WorkflowConnection[] } {
  const now = Date.now();
  const cards: MarkdownCard[] = [];
  const connections: WorkflowConnection[] = [];

  // Create cards
  for (let i = 0; i < template.cards.length; i++) {
    const templateCard = template.cards[i];
    if (templateCard === undefined) continue;

    const card = createMarkdownCard({
      id: `card-${String(now)}-${String(i)}`,
      createdBy: userId,
      ...templateCard,
    });
    cards.push(card);
  }

  // Create connections
  for (let i = 0; i < template.connections.length; i++) {
    const conn = template.connections[i];
    if (conn === undefined) continue;

    const sourceCard = cards[conn.sourceIndex];
    const targetCard = cards[conn.targetIndex];
    if (sourceCard === undefined || targetCard === undefined) continue;

    const connection = createWorkflowConnection({
      id: `edge-${String(now)}-${String(i)}`,
      sourceCardId: sourceCard.id,
      targetCardId: targetCard.id,
      createdBy: userId,
      label: conn.label,
    });
    connections.push(connection);
  }

  return { cards, connections };
}

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const WorkflowIcon = (): React.JSX.Element => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="6" height="6" rx="1"></rect>
    <rect x="15" y="3" width="6" height="6" rx="1"></rect>
    <rect x="9" y="15" width="6" height="6" rx="1"></rect>
    <line x1="9" y1="6" x2="15" y2="6"></line>
    <line x1="12" y1="6" x2="12" y2="15"></line>
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  dialog: {
    backgroundColor: 'var(--card)',
    borderRadius: radii.lg,
    border: '1px solid var(--border)',
    boxShadow: shadows.xl,
    width: 560,
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: spacing.md,
  },
  templateList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  templateCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  templateCardHover: {
    borderColor: 'var(--primary)',
    backgroundColor: 'var(--accent)',
  },
  templateIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    color: 'var(--muted-foreground)',
    flexShrink: 0,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 12,
    color: 'var(--muted-foreground)',
    lineHeight: 1.4,
  },
  templateMeta: {
    display: 'flex',
    gap: spacing.md,
    marginTop: spacing.sm,
    fontSize: 11,
    color: 'var(--muted-foreground)',
  },
};

// ============================================================================
// Props
// ============================================================================

interface WorkflowTemplatePickerProps {
  onSelect: (template: WorkflowTemplate) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowTemplatePicker({
  onSelect,
  onClose,
}: WorkflowTemplatePickerProps): React.JSX.Element {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);

  const handleSelect = useCallback(
    (template: WorkflowTemplate): void => {
      onSelect(template);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <WorkflowIcon />
            <span>Choose a Workflow Template</span>
          </div>
          <button
            style={{
              ...styles.closeButton,
              ...(closeHovered
                ? { backgroundColor: 'var(--accent)', color: 'var(--foreground)' }
                : {}),
            }}
            onClick={onClose}
            onMouseEnter={() => {
              setCloseHovered(true);
            }}
            onMouseLeave={() => {
              setCloseHovered(false);
            }}
            title="Close (Escape)"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <div style={styles.templateList}>
            {WORKFLOW_TEMPLATES.map((template) => (
              <div
                key={template.id}
                style={{
                  ...styles.templateCard,
                  ...(hoveredTemplate === template.id ? styles.templateCardHover : {}),
                }}
                onClick={() => {
                  handleSelect(template);
                }}
                onMouseEnter={() => {
                  setHoveredTemplate(template.id);
                }}
                onMouseLeave={() => {
                  setHoveredTemplate(null);
                }}
              >
                <div style={styles.templateIcon}>
                  <WorkflowIcon />
                </div>
                <div style={styles.templateInfo}>
                  <div style={styles.templateName}>{template.name}</div>
                  <div style={styles.templateDescription}>{template.description}</div>
                  <div style={styles.templateMeta}>
                    <span>{template.cards.length} cards</span>
                    <span>{template.connections.length} connections</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
