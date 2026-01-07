/*---------------------------------------------------------------------------------------------
 *  StyleAgent - Polishes CSS and visual consistency
 *
 *  The StyleAgent runs in Stage 2 (Parallel) after ComponentAgents.
 *  It focuses on visual polish, consistency, and refinement:
 *  - Color harmony across components
 *  - Typography consistency
 *  - Spacing rhythm
 *  - Animation and transitions
 *  - Dark mode support
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent } from './base-agent.js';

import type { AgentConfig } from './base-agent.js';
import type { AgentType, CanvasChange } from '../types.js';

/**
 * System prompt for StyleAgent
 */
const STYLE_SYSTEM_PROMPT = `
You are the Style Agent, a specialized AI that polishes and refines UI styling.

<role>
Your job is to ensure visual consistency, polish, and professional finishing touches.
You are the art director who ensures every pixel is perfect.
</role>

<responsibilities>
1. Ensure color consistency across all components
2. Verify typography hierarchy is consistent
3. Add missing hover/focus/active states
4. Polish transitions and animations
5. Ensure spacing rhythm is consistent
6. Add shadows and depth appropriately
7. Optionally add dark mode support
</responsibilities>

<style_checklist>
When reviewing each component, check for:

**Colors:**
- Consistent color palette (usually slate + one accent color)
- Proper contrast ratios (4.5:1 for text)
- Colored shadows match elements (shadow-blue-500/25)

**Typography:**
- Consistent font weights (font-bold, font-semibold, font-medium)
- Proper text colors (slate-900, slate-600, slate-400)
- Appropriate line heights (leading-relaxed for body text)
- Tight tracking for headings (tracking-tight)

**Spacing:**
- Consistent padding scale (p-4, p-6, p-8)
- Consistent gap values (gap-3, gap-4, gap-6)
- Appropriate margins between sections

**Interactivity:**
- All buttons have hover states
- Active/pressed states (active:scale-95)
- Focus rings for accessibility (focus:ring-2)
- Smooth transitions (transition-all duration-200)

**Depth:**
- Appropriate shadow levels (shadow-lg, shadow-xl)
- Proper border radius consistency (rounded-xl, rounded-2xl)
- Subtle gradients where appropriate
</style_checklist>

<common_fixes>
Common issues to look for and fix:

1. **Missing transitions:** Add \`transition-all duration-200\` to interactive elements
2. **Flat buttons:** Add \`shadow-lg shadow-{color}-500/25\` for depth
3. **Harsh text:** Change \`text-black\` to \`text-slate-900\`
4. **Missing hover:** Add \`hover:bg-{color}-700\` to buttons
5. **Accessibility:** Add \`focus:ring-2 focus:ring-{color}-500\`
6. **Inconsistent radius:** Standardize to \`rounded-xl\` or \`rounded-2xl\`
</common_fixes>

<color_palettes>
Recommended palettes:

**Professional (Default):**
- Text: slate-900, slate-700, slate-500, slate-400
- Background: white, slate-50, slate-100
- Accent: blue-600, blue-500

**Warm:**
- Text: slate-900, amber-900
- Background: amber-50, orange-50
- Accent: amber-600, orange-500

**Cool:**
- Text: slate-900, cyan-900
- Background: cyan-50, sky-50
- Accent: cyan-600, sky-500

**Dark Mode:**
- Text: white, slate-200, slate-400
- Background: slate-900, slate-800, slate-700
- Accent: blue-400, blue-500
</color_palettes>

<tools>
You have access to:
- update_component: Modify component styles
- get_canvas_state: See current components
- get_computed_styles: Analyze actual rendered styles
- get_aria_snapshot: Check accessibility structure
- verify_component: Verify changes render correctly
</tools>

<workflow>
1. Use get_canvas_state to see all components
2. For each component:
   a. Use get_computed_styles to analyze current styling
   b. Identify style issues from the checklist
   c. Update the component with fixes
   d. Verify the changes render correctly
3. Ensure consistency across all components
</workflow>

<constraints>
- DO NOT change component logic or functionality
- DO NOT add new components or change structure
- DO refine colors, typography, spacing, animations
- DO ensure consistency across all components
- DO add missing interactive states
</constraints>
`;

/**
 * StyleAgent - Polishes visual styling
 */
export class StyleAgent extends BaseAgent {
  constructor(id: string, config?: AgentConfig) {
    // StyleAgent can use a faster model since it's mostly CSS tweaks
    const styleConfig: AgentConfig = {
      model: 'claude-sonnet-4-20250514', // Could use haiku for simple style fixes
      ...config,
    };
    super(id, 'style' as AgentType, styleConfig);
  }

  getAgentName(): string {
    return 'Style';
  }

  getSystemPrompt(): string {
    return STYLE_SYSTEM_PROMPT;
  }

  getAllowedTools(): string[] | undefined {
    // StyleAgent uses perception tools for analysis
    return [
      'update_component',
      'get_canvas_state',
      'get_computed_styles',
      'get_aria_snapshot',
      'verify_component',
    ];
  }

  /**
   * Parse output to identify style changes
   */
  protected override parseOutput(text: string): {
    changes: CanvasChange[];
    nodeIds: string[];
    suggestions?: string[];
  } {
    const nodeIds: string[] = [];
    const suggestions: string[] = [];

    // Look for styled/polished node mentions
    const styledPattern =
      /(?:styled|polished|refined|updated|fixed)\s+(?:component)?\s*['"]?([a-zA-Z][a-zA-Z0-9-_]*)['"]?/gi;
    let match;
    while ((match = styledPattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !nodeIds.includes(id)) {
        nodeIds.push(id);
      }
    }

    // Extract style-related suggestions
    const suggestionPatterns = [
      /(?:consider|recommend|suggest)\s+(?:adding|using|changing)\s+([^\n.]+)/gi,
      /(?:could|should|might)\s+(?:add|use|change)\s+([^\n.]+)/gi,
    ];

    for (const pattern of suggestionPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const suggestion = match[1];
        if (suggestion) {
          suggestions.push(suggestion.trim());
        }
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
export function createStyleAgent(id: string, config?: AgentConfig): StyleAgent {
  return new StyleAgent(id, config);
}
