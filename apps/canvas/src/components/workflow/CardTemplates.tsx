/**
 * Card Templates
 * Predefined templates for common card types
 */

import React, { useState, useCallback } from 'react';

import { radii, fontWeight, shadows, spacing } from '../../lib/designTokens';

import type { CardType } from '../../types/workflowTypes';

// ============================================================================
// Template Types
// ============================================================================

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  type: CardType;
  content: string;
  tags: string[];
  icon: string;
}

// ============================================================================
// Template Definitions
// ============================================================================

export const CARD_TEMPLATES: CardTemplate[] = [
  // Prompt Templates
  {
    id: 'feature-request',
    name: 'Feature Request',
    description: 'Describe a new feature requirement',
    type: 'prompt',
    icon: 'lightbulb',
    tags: ['feature', 'planning'],
    content: `# Feature: [Name]

## Problem Statement
What problem does this feature solve?

## Proposed Solution
Describe the proposed solution...

## User Stories
- As a [user type], I want to [action] so that [benefit]

## Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3

## Questions
- Question 1?
- Question 2?
`,
  },
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Document a bug with reproduction steps',
    type: 'prompt',
    icon: 'bug',
    tags: ['bug', 'issue'],
    content: `# Bug: [Title]

## Description
Brief description of the bug...

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen...

## Actual Behavior
What actually happens...

## Environment
- OS:
- Browser/Version:
- App Version:

## Screenshots
[Add screenshots if applicable]

## Additional Context
Any other relevant information...
`,
  },
  {
    id: 'research-question',
    name: 'Research Question',
    description: 'Frame a research or exploration question',
    type: 'prompt',
    icon: 'search',
    tags: ['research', 'exploration'],
    content: `# Research: [Topic]

## Question
What are we trying to understand?

## Context
Why is this important?

## Scope
- In scope:
- Out of scope:

## Approach
How will we investigate this?

## Success Criteria
How will we know when we have an answer?

## Resources
- Resource 1
- Resource 2
`,
  },

  // Response Templates
  {
    id: 'technical-analysis',
    name: 'Technical Analysis',
    description: 'Document technical analysis and recommendations',
    type: 'response',
    icon: 'analyze',
    tags: ['analysis', 'technical'],
    content: `# Technical Analysis: [Topic]

## Summary
Brief summary of findings...

## Analysis

### Option 1: [Name]
**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

### Option 2: [Name]
**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

## Recommendation
Based on the analysis, we recommend...

## Implementation Notes
Key considerations for implementation...

## References
- Reference 1
- Reference 2
`,
  },
  {
    id: 'implementation-plan',
    name: 'Implementation Plan',
    description: 'Detailed implementation steps',
    type: 'response',
    icon: 'checklist',
    tags: ['implementation', 'plan'],
    content: `# Implementation Plan: [Feature]

## Overview
Brief overview of what will be implemented...

## Prerequisites
- [ ] Prerequisite 1
- [ ] Prerequisite 2

## Implementation Steps

### Phase 1: [Name]
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### Phase 2: [Name]
- [ ] Task 1
- [ ] Task 2

## Testing Strategy
- Unit tests for...
- Integration tests for...
- E2E tests for...

## Rollout Plan
1. Stage 1: ...
2. Stage 2: ...

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Risk 1 | Mitigation 1 |
`,
  },

  // Decision Templates
  {
    id: 'adr',
    name: 'Architecture Decision Record',
    description: 'Document an architecture decision',
    type: 'decision',
    icon: 'architecture',
    tags: ['adr', 'architecture', 'decision'],
    content: `# ADR: [Title]

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences

### Positive
- Consequence 1
- Consequence 2

### Negative
- Consequence 1
- Consequence 2

### Neutral
- Consequence 1

## Alternatives Considered
1. Alternative 1: Why rejected
2. Alternative 2: Why rejected

## References
- Reference 1
- Reference 2
`,
  },
  {
    id: 'decision-matrix',
    name: 'Decision Matrix',
    description: 'Compare options with weighted criteria',
    type: 'decision',
    icon: 'table',
    tags: ['decision', 'comparison'],
    content: `# Decision: [Topic]

## Options
1. Option A
2. Option B
3. Option C

## Criteria (Weight 1-5)

| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| Cost | 4 | 3 | 4 | 2 |
| Speed | 3 | 4 | 2 | 5 |
| Quality | 5 | 4 | 5 | 3 |
| Risk | 4 | 3 | 4 | 2 |
| **Total** | | **56** | **62** | **48** |

## Decision
Based on the weighted scoring, we choose **Option B**.

## Rationale
Additional context for the decision...
`,
  },

  // Code Snippet Templates
  {
    id: 'api-endpoint',
    name: 'API Endpoint',
    description: 'Document an API endpoint',
    type: 'code-snippet',
    icon: 'api',
    tags: ['api', 'endpoint'],
    content: `# API: [Endpoint Name]

## Endpoint
\`\`\`
[METHOD] /api/v1/resource
\`\`\`

## Description
What this endpoint does...

## Request

### Headers
\`\`\`
Authorization: Bearer <token>
Content-Type: application/json
\`\`\`

### Body
\`\`\`json
{
  "field1": "value1",
  "field2": "value2"
}
\`\`\`

## Response

### Success (200)
\`\`\`json
{
  "id": "123",
  "status": "success",
  "data": {}
}
\`\`\`

### Error (400)
\`\`\`json
{
  "error": "Bad Request",
  "message": "Invalid input"
}
\`\`\`

## Examples
\`\`\`bash
curl -X POST https://api.example.com/api/v1/resource \\
  -H "Authorization: Bearer token" \\
  -d '{"field1": "value1"}'
\`\`\`
`,
  },
  {
    id: 'data-model',
    name: 'Data Model',
    description: 'Define a data model or schema',
    type: 'code-snippet',
    icon: 'database',
    tags: ['data', 'schema', 'model'],
    content: `# Data Model: [Name]

## Schema

\`\`\`typescript
interface EntityName {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  // Core fields
  name: string;
  description?: string;

  // Relationships
  parentId?: string;
  children: string[];

  // Status
  status: 'active' | 'inactive' | 'deleted';
}
\`\`\`

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| name | string | Yes | Display name |
| status | enum | Yes | Current status |

## Relationships
- Belongs to: [Parent Entity]
- Has many: [Child Entities]

## Indexes
- Primary: id
- Unique: [field]
- Composite: [field1, field2]

## Validation Rules
- name: 1-100 characters
- description: max 500 characters
`,
  },

  // Diagram Templates
  {
    id: 'flow-diagram',
    name: 'Flow Diagram',
    description: 'Create a process flow diagram',
    type: 'diagram',
    icon: 'flow',
    tags: ['diagram', 'flow', 'process'],
    content: `# Flow: [Process Name]

## Description
Overview of the process...

## Diagram

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Process 1]
    B -->|No| D[Process 2]
    C --> E[End]
    D --> E
\`\`\`

## Steps
1. **Start**: Initial trigger
2. **Decision**: Check condition
3. **Process 1**: If yes...
4. **Process 2**: If no...
5. **End**: Completion

## Notes
- Note 1
- Note 2
`,
  },
  {
    id: 'sequence-diagram',
    name: 'Sequence Diagram',
    description: 'Document component interactions',
    type: 'diagram',
    icon: 'sequence',
    tags: ['diagram', 'sequence', 'interaction'],
    content: `# Sequence: [Interaction Name]

## Description
Overview of the interaction...

## Diagram

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant D as Database

    U->>C: Action
    C->>S: Request
    S->>D: Query
    D-->>S: Result
    S-->>C: Response
    C-->>U: Display
\`\`\`

## Steps
1. User initiates action
2. Client sends request to server
3. Server queries database
4. Database returns result
5. Server sends response
6. Client displays to user

## Error Handling
- Error scenario 1: ...
- Error scenario 2: ...
`,
  },
  {
    id: 'entity-relationship',
    name: 'Entity Relationship',
    description: 'Document data relationships',
    type: 'diagram',
    icon: 'relationship',
    tags: ['diagram', 'er', 'database'],
    content: `# ER Diagram: [Domain]

## Description
Overview of the data model...

## Diagram

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string name
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        string id PK
        string userId FK
        date createdAt
    }
    ORDER_ITEM {
        string id PK
        string orderId FK
        string productId FK
        int quantity
    }
    PRODUCT ||--o{ ORDER_ITEM : included_in
    PRODUCT {
        string id PK
        string name
        decimal price
    }
\`\`\`

## Entities
- **User**: System users
- **Order**: Purchase orders
- **OrderItem**: Items in an order
- **Product**: Available products

## Relationships
- User places many Orders (1:N)
- Order contains many OrderItems (1:N)
- Product included in many OrderItems (1:N)
`,
  },
];

// ============================================================================
// Template Categories
// ============================================================================

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  templates: CardTemplate[];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'prompts',
    name: 'Prompts & Questions',
    icon: 'question',
    templates: CARD_TEMPLATES.filter((t) => t.type === 'prompt'),
  },
  {
    id: 'responses',
    name: 'Analysis & Plans',
    icon: 'document',
    templates: CARD_TEMPLATES.filter((t) => t.type === 'response'),
  },
  {
    id: 'decisions',
    name: 'Decisions',
    icon: 'branch',
    templates: CARD_TEMPLATES.filter((t) => t.type === 'decision'),
  },
  {
    id: 'code',
    name: 'Code & Data',
    icon: 'code',
    templates: CARD_TEMPLATES.filter((t) => t.type === 'code-snippet'),
  },
  {
    id: 'diagrams',
    name: 'Diagrams',
    icon: 'flow',
    templates: CARD_TEMPLATES.filter((t) => t.type === 'diagram'),
  },
];

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

const TemplateIcon = (): React.JSX.Element => (
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
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
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
    width: 600,
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
  category: {
    marginBottom: spacing.lg,
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: spacing.sm,
  },
  templateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm,
  },
  templateCard: {
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
  templateName: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    lineHeight: 1.4,
  },
  templateTags: {
    display: 'flex',
    gap: 4,
    marginTop: spacing.sm,
    flexWrap: 'wrap' as const,
  },
  templateTag: {
    fontSize: 10,
    padding: '2px 6px',
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    borderRadius: radii.sm,
  },
};

// ============================================================================
// Props
// ============================================================================

interface CardTemplatePickerProps {
  onSelect: (template: CardTemplate) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CardTemplatePicker({
  onSelect,
  onClose,
}: CardTemplatePickerProps): React.JSX.Element {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);

  const handleSelect = useCallback(
    (template: CardTemplate): void => {
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
            <TemplateIcon />
            <span>Choose a Template</span>
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
          {TEMPLATE_CATEGORIES.map((category) => (
            <div key={category.id} style={styles.category}>
              <div style={styles.categoryTitle}>{category.name}</div>
              <div style={styles.templateGrid}>
                {category.templates.map((template) => (
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
                    <div style={styles.templateName}>{template.name}</div>
                    <div style={styles.templateDescription}>{template.description}</div>
                    <div style={styles.templateTags}>
                      {template.tags.map((tag) => (
                        <span key={tag} style={styles.templateTag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Function
// ============================================================================

export function getTemplateById(id: string): CardTemplate | undefined {
  return CARD_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByType(type: CardType): CardTemplate[] {
  return CARD_TEMPLATES.filter((t) => t.type === type);
}
