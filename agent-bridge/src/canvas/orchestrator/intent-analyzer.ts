/*---------------------------------------------------------------------------------------------
 *  IntentAnalyzer - Analyzes user prompts to determine routing
 *
 *  Routes requests to either:
 *  - Fast Path: Simple requests go directly to a single agent
 *  - Full Orchestration: Complex requests go through TaskDecomposer
 *--------------------------------------------------------------------------------------------*/

import { createLogger } from '../../logger.js';

import type {
  AgentType,
  CanvasSnapshot,
  IntentAnalysis,
  IntentCategory,
  IntentComplexity,
} from './types.js';

const logger = createLogger('IntentAnalyzer');

/**
 * Keywords and patterns for intent classification
 */
const INTENT_PATTERNS = {
  // Single component creation patterns
  createComponent: [
    /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:component|button|card|form|input|nav|header|footer|sidebar|modal|dialog)\b/i,
    /\badd\s+(?:a\s+)?(?:new\s+)?(?:component|button|card|form|input)\b/i,
    /\bmake\s+(?:a\s+)?(?:component|button|card)\b/i,
  ],

  // Modification patterns
  modifyComponent: [
    /\bchange\s+(?:the\s+)?(?:color|text|size|style|background|border|padding|margin)\b/i,
    /\bupdate\s+(?:the\s+)?(?:component|button|card|text)\b/i,
    /\bmodify\s+(?:the\s+)?\b/i,
    /\bedit\s+(?:the\s+)?\b/i,
    /\bfix\s+(?:the\s+)?\b/i,
  ],

  // Style-only changes
  styleChange: [
    /\b(?:make|change)\s+(?:it\s+)?(?:bigger|smaller|larger|wider|narrower|taller|shorter)\b/i,
    /\b(?:change|update|set)\s+(?:the\s+)?(?:color|background|font|border|shadow|opacity)\b/i,
    /\bstyle\s+(?:the\s+)?/i,
    /\b(?:add|remove)\s+(?:a\s+)?(?:shadow|border|gradient|animation)\b/i,
    /\bdark\s+(?:mode|theme)\b/i,
    /\blight\s+(?:mode|theme)\b/i,
  ],

  // Layout changes
  layoutChange: [
    /\b(?:create|make|add)\s+(?:a\s+)?(?:layout|grid|flex|row|column|container)\b/i,
    /\barrange\s+(?:the\s+)?(?:components|items|elements)\b/i,
    /\b(?:move|position|align|center)\s+(?:the\s+)?\b/i,
    /\b(?:two|three|2|3)\s*(?:-|\s)?(?:column|col|row)\s*(?:layout)?\b/i,
  ],

  // Multi-component indicators
  multiComponent: [
    /\bmultiple\s+(?:components|buttons|cards|items)\b/i,
    /\b(?:several|many|all|each)\s+(?:components|buttons|cards)\b/i,
    /\band\s+(?:a|an|the)\s+\b/i, // "a button and a form"
    /\bwith\s+(?:a|an|the)\s+\b/i, // "header with a nav"
    /\b(?:list|grid|gallery)\s+of\s+\b/i,
  ],

  // Full page/app creation
  fullPage: [
    /\b(?:create|build|make)\s+(?:a\s+)?(?:full\s+)?(?:page|app|application|website|dashboard|landing)\b/i,
    /\b(?:design|implement)\s+(?:a\s+)?(?:complete|full|entire)\b/i,
    /\blanding\s+page\b/i,
    /\bdashboard\b/i,
    /\be-?commerce\b/i,
    /\bwebsite\b/i,
  ],
};

/**
 * Complexity indicators (each match increases complexity score)
 */
const COMPLEXITY_INDICATORS = {
  // Increases complexity
  high: [
    /\bmultiple\b/i,
    /\bseveral\b/i,
    /\bresponsive\b/i,
    /\banimated?\b/i,
    /\binteractive\b/i,
    /\bdynamic\b/i,
    /\bcomplex\b/i,
    /\bfull\b/i,
    /\bcomplete\b/i,
    /\bentire\b/i,
    /\ball\s+the\b/i,
  ],

  // Decreases complexity (simple tasks)
  low: [
    /\bjust\b/i,
    /\bonly\b/i,
    /\bsimple\b/i,
    /\bbasic\b/i,
    /\bquick\b/i,
    /\bsmall\b/i,
    /\bminor\b/i,
    /\bsingle\b/i,
    /\bone\b/i,
  ],
};

/**
 * IntentAnalyzer - Determines routing for user requests
 */
export class IntentAnalyzer {
  constructor() {
    logger.info('IntentAnalyzer initialized');
  }

  /**
   * Analyze a user prompt to determine routing
   */
  analyze(prompt: string, canvasState?: CanvasSnapshot): IntentAnalysis {
    logger.debug({ prompt: prompt.substring(0, 100) }, 'Analyzing intent');

    const category = this.detectCategory(prompt);
    const complexity = this.assessComplexity(prompt, category);
    const referencedNodeIds = this.extractNodeReferences(prompt, canvasState);

    // Determine if we should use fast path
    const { useFastPath, fastPathAgent } = this.determineRouting(
      category,
      complexity,
      referencedNodeIds.length
    );

    const estimatedTaskCount = this.estimateTaskCount(category, complexity);
    const confidence = this.calculateConfidence(prompt, category, complexity);

    const analysis: IntentAnalysis = {
      userIntent: prompt,
      complexity,
      category,
      useFastPath,
      fastPathAgent,
      referencedNodeIds,
      estimatedTaskCount,
      confidence,
      reasoning: this.buildReasoning(category, complexity, useFastPath, fastPathAgent),
    };

    logger.info(
      {
        category,
        complexity,
        useFastPath,
        fastPathAgent,
        confidence: confidence.toFixed(2),
      },
      'Intent analysis complete'
    );

    return analysis;
  }

  /**
   * Detect the primary category of the intent
   */
  private detectCategory(prompt: string): IntentCategory {
    // Check patterns in order of specificity (most specific first)

    // Full page/app creation (most complex)
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.fullPage)) {
      return 'full-page';
    }

    // Multi-component indicators
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.multiComponent)) {
      return 'multi-component';
    }

    // Layout changes
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.layoutChange)) {
      return 'layout-change';
    }

    // Style-only changes
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.styleChange)) {
      return 'style-change';
    }

    // Modify existing component
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.modifyComponent)) {
      return 'modify-component';
    }

    // Create new component
    if (this.matchesPatterns(prompt, INTENT_PATTERNS.createComponent)) {
      return 'create-component';
    }

    return 'unknown';
  }

  /**
   * Assess complexity based on prompt content
   */
  private assessComplexity(prompt: string, category: IntentCategory): IntentComplexity {
    let score = 0;

    // Category-based baseline
    switch (category) {
      case 'full-page':
        score += 3;
        break;
      case 'multi-component':
        score += 2;
        break;
      case 'layout-change':
        score += 1;
        break;
      case 'unknown':
      case 'create-component':
      case 'modify-component':
      case 'style-change':
        // These categories have baseline score of 0
        break;
    }

    // High complexity indicators
    for (const pattern of COMPLEXITY_INDICATORS.high) {
      if (pattern.test(prompt)) {
        score += 1;
      }
    }

    // Low complexity indicators (reduce score)
    for (const pattern of COMPLEXITY_INDICATORS.low) {
      if (pattern.test(prompt)) {
        score -= 1;
      }
    }

    // Word count factor (longer prompts tend to be more complex)
    const wordCount = prompt.split(/\s+/).length;
    if (wordCount > 50) {
      score += 2;
    } else if (wordCount > 25) {
      score += 1;
    }

    // Clamp and convert to complexity level
    if (score >= 3) {
      return 'complex';
    } else if (score >= 1) {
      return 'moderate';
    }
    return 'simple';
  }

  /**
   * Determine routing: Fast Path vs Full Orchestration
   */
  private determineRouting(
    category: IntentCategory,
    complexity: IntentComplexity,
    nodeReferenceCount: number
  ): { useFastPath: boolean; fastPathAgent?: AgentType } {
    // Full page and multi-component always use orchestration
    if (category === 'full-page' || category === 'multi-component') {
      return { useFastPath: false };
    }

    // Complex tasks use orchestration
    if (complexity === 'complex') {
      return { useFastPath: false };
    }

    // Multiple node references suggest orchestration needed
    if (nodeReferenceCount > 1) {
      return { useFastPath: false };
    }

    // Map categories to fast path agents
    const fastPathMapping: Record<IntentCategory, AgentType | undefined> = {
      'create-component': 'component',
      'modify-component': 'component',
      'style-change': 'style',
      'layout-change': 'layout',
      'multi-component': undefined,
      'full-page': undefined,
      unknown: 'component', // Default to component agent
    };

    const agent = fastPathMapping[category];
    if (agent && complexity === 'simple') {
      return { useFastPath: true, fastPathAgent: agent };
    }

    // Moderate complexity: use fast path for certain categories
    if (complexity === 'moderate') {
      if (category === 'style-change') {
        return { useFastPath: true, fastPathAgent: 'style' };
      }
      if (category === 'modify-component') {
        return { useFastPath: true, fastPathAgent: 'component' };
      }
    }

    return { useFastPath: false };
  }

  /**
   * Extract node references from the prompt
   */
  private extractNodeReferences(prompt: string, canvasState?: CanvasSnapshot): string[] {
    const nodeIds: string[] = [];

    if (!canvasState) {
      return nodeIds;
    }

    // Look for explicit node ID references
    const idPattern = /\b(node[-_]?[a-zA-Z0-9]+)\b/gi;
    let match;
    while ((match = idPattern.exec(prompt)) !== null) {
      const id = match[1];
      if (id && canvasState.nodes.some((n) => n.id === id)) {
        nodeIds.push(id);
      }
    }

    // Look for component name references
    const lowerPrompt = prompt.toLowerCase();
    for (const node of canvasState.nodes) {
      const label = (node.data.label as string | undefined)?.toLowerCase();
      const name = (node.data.name as string | undefined)?.toLowerCase();

      if (label && lowerPrompt.includes(label)) {
        if (!nodeIds.includes(node.id)) {
          nodeIds.push(node.id);
        }
      }
      if (name && lowerPrompt.includes(name)) {
        if (!nodeIds.includes(node.id)) {
          nodeIds.push(node.id);
        }
      }
    }

    // Check for "selected" or "this" references
    if (/\b(?:selected|this|current)\b/i.test(prompt)) {
      // Canvas will handle providing the selected node context
      // Mark as having a reference but don't add specific ID
    }

    return nodeIds;
  }

  /**
   * Estimate number of tasks based on category and complexity
   */
  private estimateTaskCount(category: IntentCategory, complexity: IntentComplexity): number {
    const baseCount: Record<IntentCategory, number> = {
      'create-component': 1,
      'modify-component': 1,
      'style-change': 1,
      'layout-change': 2,
      'multi-component': 3,
      'full-page': 5,
      unknown: 1,
    };

    const multiplier: Record<IntentComplexity, number> = {
      simple: 1,
      moderate: 1.5,
      complex: 2,
    };

    return Math.ceil(baseCount[category] * multiplier[complexity]);
  }

  /**
   * Calculate confidence score for the analysis
   */
  private calculateConfidence(
    prompt: string,
    category: IntentCategory,
    complexity: IntentComplexity
  ): number {
    let confidence = 0.5; // Base confidence

    // Category detection confidence
    if (category !== 'unknown') {
      confidence += 0.2;
    }

    // Explicit keywords increase confidence
    const explicitKeywords = /\b(?:create|make|add|update|change|modify|build)\b/i;
    if (explicitKeywords.test(prompt)) {
      confidence += 0.15;
    }

    // Very short prompts are harder to analyze
    const wordCount = prompt.split(/\s+/).length;
    if (wordCount < 5) {
      confidence -= 0.1;
    } else if (wordCount > 10) {
      confidence += 0.1;
    }

    // Complex prompts have lower confidence (more room for misinterpretation)
    if (complexity === 'complex') {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Build human-readable reasoning for the analysis
   */
  private buildReasoning(
    category: IntentCategory,
    complexity: IntentComplexity,
    useFastPath: boolean,
    fastPathAgent?: AgentType
  ): string {
    const parts: string[] = [];

    parts.push(`Detected as ${category} with ${complexity} complexity.`);

    if (useFastPath && fastPathAgent) {
      parts.push(`Using fast path with ${fastPathAgent} agent for direct execution.`);
    } else {
      parts.push('Using full orchestration with task decomposition.');
    }

    return parts.join(' ');
  }

  /**
   * Check if prompt matches any of the given patterns
   */
  private matchesPatterns(prompt: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(prompt));
  }
}

/**
 * Singleton instance for reuse
 */
let analyzerInstance: IntentAnalyzer | null = null;

/**
 * Get or create the IntentAnalyzer singleton
 */
export function getIntentAnalyzer(): IntentAnalyzer {
  analyzerInstance ??= new IntentAnalyzer();
  return analyzerInstance;
}

/**
 * Create a fresh IntentAnalyzer (for testing or isolation)
 */
export function createIntentAnalyzer(): IntentAnalyzer {
  return new IntentAnalyzer();
}
