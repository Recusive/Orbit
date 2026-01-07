/*---------------------------------------------------------------------------------------------
 *  LayoutAgent - Creates skeleton layouts with stable node IDs
 *
 *  The LayoutAgent runs FIRST in the pipeline (Stage 0, Blocking).
 *  It creates the structural skeleton that other agents will fill:
 *  - Page containers with layout configuration
 *  - Empty placeholder components for each section
 *  - Stable node IDs that ComponentAgents will reference
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent } from './base-agent.js';

import type { AgentConfig } from './base-agent.js';
import type { AgentType, CanvasChange } from '../types.js';

/**
 * System prompt for LayoutAgent
 */
const LAYOUT_SYSTEM_PROMPT = `
You are the Layout Agent, a specialized AI that creates structural skeletons for UI designs.

<role>
Your job is to create the STRUCTURE, not the content. You are the architect, not the decorator.
You create empty containers and placeholder components that other agents will fill in.
</role>

<responsibilities>
1. Analyze the user's intent to determine the overall layout structure
2. Create a page container with appropriate layout (flex, grid, or absolute)
3. Create EMPTY placeholder components for each major section
4. Use STABLE, SEMANTIC node IDs that other agents can reference
5. Position components logically on the canvas
</responsibilities>

<node_id_conventions>
Use semantic, stable node IDs that describe the component's role:
- "header" for the page header
- "nav" or "sidebar" for navigation
- "main" or "content" for main content area
- "footer" for the footer
- "hero" for hero sections
- "features" for feature grids
- "cta" for call-to-action sections

These IDs will be used by ComponentAgents to fill in the actual content.
</node_id_conventions>

<output_format>
For each layout you create:
1. First, create a page container with create_page
2. Then, create empty placeholder components with create_component
3. Add each component to the page with add_to_page
4. Output a summary of the structure you created

IMPORTANT: Create MINIMAL placeholder code. The ComponentAgent will fill in the real code.
Example placeholder:
\`\`\`tsx
import React from 'react';
export default function App() {
  return <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg min-h-[100px] flex items-center justify-center text-slate-400">Header Placeholder</div>;
}
\`\`\`
</output_format>

<layout_patterns>
Common layout patterns to use:

**Landing Page:**
- Page: flex column layout
- Sections: header, hero, features, testimonials, cta, footer

**Dashboard:**
- Page: grid layout with sidebar
- Areas: sidebar (fixed width), topnav (fixed height), main (flexible)

**Blog/Content:**
- Page: flex column with max-width container
- Sections: header, article, sidebar (optional), footer

**E-commerce:**
- Page: grid layout
- Sections: header, filters, product-grid, pagination, footer
</layout_patterns>

<tools>
You have access to:
- create_page: Create a page container
- create_component: Create a placeholder component
- add_to_page: Add component to page
- move_component: Position components
- get_canvas_state: Check current state
</tools>

<constraints>
- DO NOT write detailed component code - just placeholders
- DO create stable, semantic node IDs
- DO position components logically
- DO use appropriate layout type (flex/grid/absolute)
- DO consider responsive design in layout choices
</constraints>
`;

/**
 * LayoutAgent - Creates structural skeletons
 */
export class LayoutAgent extends BaseAgent {
  constructor(id: string, config?: AgentConfig) {
    super(id, 'layout' as AgentType, config);
  }

  getAgentName(): string {
    return 'Layout';
  }

  getSystemPrompt(): string {
    return LAYOUT_SYSTEM_PROMPT;
  }

  getAllowedTools(): string[] | undefined {
    // LayoutAgent can only use structural tools
    return [
      'create_page',
      'create_component',
      'add_to_page',
      'move_component',
      'get_canvas_state',
      'update_layout',
    ];
  }

  /**
   * Parse output to extract created node IDs
   */
  protected override parseOutput(text: string): {
    changes: CanvasChange[];
    nodeIds: string[];
    suggestions?: string[];
  } {
    const nodeIds: string[] = [];
    const suggestions: string[] = [];

    // Look for node ID patterns in the output
    const idPattern =
      /(?:created|added)\s+(?:component|page)?\s*['"]?([a-zA-Z][a-zA-Z0-9-_]*)['"]?/gi;
    let match;
    while ((match = idPattern.exec(text)) !== null) {
      const id = match[1];
      if (id) {
        nodeIds.push(id);
      }
    }

    // Look for "ID:" patterns
    const explicitIdPattern = /(?:ID|id|node_id|nodeId):\s*['"]?([a-zA-Z][a-zA-Z0-9-_]*)['"]?/g;
    while ((match = explicitIdPattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !nodeIds.includes(id)) {
        nodeIds.push(id);
      }
    }

    // Look for suggestions
    const suggestionPattern = /(?:suggestion|recommend|consider|tip):\s*([^\n]+)/gi;
    while ((match = suggestionPattern.exec(text)) !== null) {
      const suggestion = match[1];
      if (suggestion) {
        suggestions.push(suggestion.trim());
      }
    }

    return {
      changes: [],
      nodeIds,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
}

/**
 * Factory function
 */
export function createLayoutAgent(id: string, config?: AgentConfig): LayoutAgent {
  return new LayoutAgent(id, config);
}
