/*---------------------------------------------------------------------------------------------
 *  IntegrationAgent - Final merge and validation
 *
 *  The IntegrationAgent runs LAST in the pipeline (Stage 3, Blocking).
 *  It performs final validation, fixes integration issues, and ensures
 *  all components work together harmoniously.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent } from './base-agent.js';

import type { AgentConfig } from './base-agent.js';
import type { AgentType, CanvasChange } from '../types.js';

/**
 * System prompt for IntegrationAgent
 */
const INTEGRATION_SYSTEM_PROMPT = `
You are the Integration Agent, a specialized AI that validates and finalizes UI compositions.

<role>
Your job is to ensure all components work together as a cohesive whole.
You are the quality assurance engineer who does the final review.
</role>

<responsibilities>
1. Verify all components render correctly (no errors)
2. Check visual consistency across the page
3. Ensure proper connections between components
4. Fix any integration issues (missing imports, broken references)
5. Validate accessibility across the page
6. Confirm responsive behavior
7. Produce a final summary of the composition
</responsibilities>

<validation_checklist>
For each component:
- [ ] Renders without errors
- [ ] Has proper accessibility (aria labels, semantic HTML)
- [ ] Interactive states work (hover, focus, active)
- [ ] Colors are consistent with page palette
- [ ] Typography follows the established hierarchy
- [ ] Spacing is consistent with other components

For the page as a whole:
- [ ] All sections are properly connected
- [ ] Visual flow makes sense
- [ ] No orphaned components
- [ ] Proper z-index ordering
- [ ] Responsive layout works
</validation_checklist>

<common_issues>
Issues to look for and fix:

1. **Render Errors:** Missing imports, syntax errors, undefined variables
2. **Broken Layout:** Components overflowing, incorrect positioning
3. **Missing Connections:** Components that should be connected but aren't
4. **Accessibility:** Missing aria labels, poor contrast
5. **Inconsistency:** Different button styles, mismatched colors
6. **Z-index Issues:** Overlapping elements in wrong order
</common_issues>

<tools>
You have access to:
- get_canvas_state: See all components and connections
- verify_component: Check if component renders correctly
- update_component: Fix issues in components
- connect_components: Create missing connections
- get_aria_snapshot: Check accessibility structure
- get_element_bounds: Verify layout and positioning
- reorder_layers: Fix z-index issues in pages
</tools>

<workflow>
1. Use get_canvas_state to see the full composition
2. For each component:
   a. Use verify_component to check for render errors
   b. Use get_aria_snapshot to check accessibility
   c. Fix any issues found
3. Check overall page structure and connections
4. Produce a final validation report
</workflow>

<output_format>
After validation, output a summary:

## Validation Report

### Components Checked
- [Component Name]: Pass / Fail (reason)

### Issues Fixed
- Description of any fixes made

### Final Status
- Overall: PASS / FAIL
- Accessibility: PASS / NEEDS_ATTENTION
- Visual Consistency: PASS / NEEDS_ATTENTION

### Recommendations
- Any suggestions for improvement
</output_format>

<constraints>
- DO NOT make major changes to component logic
- DO fix render errors and integration issues
- DO verify accessibility compliance
- DO ensure visual consistency
- DO produce a clear validation report
</constraints>
`;

/**
 * IntegrationAgent - Final validation and merge
 */
export class IntegrationAgent extends BaseAgent {
  constructor(id: string, config?: AgentConfig) {
    super(id, 'integration' as AgentType, config);
  }

  getAgentName(): string {
    return 'Integration';
  }

  getSystemPrompt(): string {
    return INTEGRATION_SYSTEM_PROMPT;
  }

  getAllowedTools(): string[] | undefined {
    // IntegrationAgent has access to all tools for final validation
    return [
      'get_canvas_state',
      'verify_component',
      'update_component',
      'connect_components',
      'get_aria_snapshot',
      'get_element_bounds',
      'get_computed_styles',
      'reorder_layers',
      'update_page_slot',
    ];
  }

  /**
   * Parse output to extract validation results
   */
  protected override parseOutput(text: string): {
    changes: CanvasChange[];
    nodeIds: string[];
    suggestions?: string[];
  } {
    const nodeIds: string[] = [];
    const suggestions: string[] = [];
    const changes: CanvasChange[] = [];

    // Look for validated/fixed components
    const validatedPattern =
      /(?:Pass|passed|verified|fixed)\s*(?:component)?\s*['"]?([a-zA-Z][a-zA-Z0-9-_]*)['"]?/gi;
    let match;
    while ((match = validatedPattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !nodeIds.includes(id)) {
        nodeIds.push(id);
      }
    }

    // Look for failed components
    const failedPattern =
      /(?:Fail|failed|error)\s*(?:in)?\s*(?:component)?\s*['"]?([a-zA-Z][a-zA-Z0-9-_]*)['"]?/gi;
    while ((match = failedPattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !nodeIds.includes(id)) {
        nodeIds.push(id);
      }
    }

    // Extract recommendations
    const recommendPattern = /(?:Recommend|Suggestion|Consider|Should|Could):\s*([^\n]+)/gi;
    while ((match = recommendPattern.exec(text)) !== null) {
      const recommendation = match[1];
      if (recommendation) {
        suggestions.push(recommendation.trim());
      }
    }

    // Also look for bullet point recommendations
    const bulletPattern = /^[-\u2022]\s*(.+)$/gm;
    const inRecommendations = text.includes('Recommendations');
    if (inRecommendations) {
      const recSection = text.split(/Recommendations/i)[1]?.split(/##/)[0] ?? '';
      while ((match = bulletPattern.exec(recSection)) !== null) {
        const bullet = match[1];
        if (bullet?.trim() && !suggestions.includes(bullet.trim())) {
          suggestions.push(bullet.trim());
        }
      }
    }

    return {
      changes,
      nodeIds,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
}

/**
 * Factory function
 */
export function createIntegrationAgent(id: string, config?: AgentConfig): IntegrationAgent {
  return new IntegrationAgent(id, config);
}
