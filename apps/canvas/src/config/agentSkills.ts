/**
 * Agent Skills Configuration
 * Defines the specialized prompts and behaviors for the Layer Agent Toolbar
 */

export interface AgentSkill {
  id: string;
  name: string;
  icon: string; // Emoji or icon name
  description: string;
  prompt: string;
  color: string; // Tailwind-style color for theming
}

/**
 * The 4 core agent skills for layer-specific actions
 */
export const AGENT_SKILLS: AgentSkill[] = [
  {
    id: 'refine',
    name: 'Refine',
    icon: '✨',
    description: 'Polish visuals & aesthetics',
    color: '#8b5cf6', // Purple
    prompt: `Analyze this component against the design principles.
Focus on:
- Visual hierarchy improvements
- Spacing and whitespace optimization
- Shadow depth and color matching
- Border radius consistency
- Typography refinement (weights, sizes, colors)

Apply the improvements directly to the code. Make it look more polished and professional.`,
  },
  {
    id: 'accessibility',
    name: 'Fix A11y',
    icon: '♿',
    description: 'Improve accessibility',
    color: '#22c55e', // Green
    prompt: `Review this component for accessibility issues.
Check and fix:
- Color contrast ratios (WCAG AA minimum)
- Missing aria-labels on interactive elements
- Semantic HTML tags (use button, not div with onClick)
- Focus states for keyboard navigation
- Screen reader friendly text alternatives

Apply fixes directly. Explain what you changed and why.`,
  },
  {
    id: 'interactive',
    name: 'Animate',
    icon: '⚡',
    description: 'Add interactions & states',
    color: '#f59e0b', // Amber
    prompt: `Make this component feel alive and interactive.
Add:
- Hover states (scale, shadow, color shifts)
- Active/pressed states (scale down slightly)
- Focus-visible rings for keyboard users
- Smooth transitions (transition-all duration-200)
- Cursor pointers on clickable elements
- Subtle micro-interactions where appropriate

Use Tailwind classes. Make buttons feel "clickable" and cards feel "liftable".`,
  },
  {
    id: 'variations',
    name: 'Variations',
    icon: '🔀',
    description: 'Generate style variants',
    color: '#06b6d4', // Cyan
    prompt: `Generate 3 distinct visual variations of this component.
Create:
1. **Minimal** - Clean, lots of whitespace, subtle borders
2. **Bold** - Strong colors, prominent shadows, larger text
3. **Glass** - Glassmorphism with backdrop-blur, translucent backgrounds

Present each variation as a separate code block with a brief description.
The user can then choose which style they prefer.`,
  },
];

/**
 * Get a skill by its ID
 */
export function getSkillById(id: string): AgentSkill | undefined {
  return AGENT_SKILLS.find((skill) => skill.id === id);
}

/**
 * Build a contextual prompt for a skill, injecting node-specific context
 */
export function buildSkillPrompt(
  skill: AgentSkill,
  nodeContext: {
    nodeId: string;
    label: string;
    code: string;
  }
): string {
  return `
## Task: ${skill.name}
${skill.description}

## Target Component
- **Node ID:** ${nodeContext.nodeId}
- **Name:** ${nodeContext.label}

## Current Code
\`\`\`tsx
${nodeContext.code}
\`\`\`

## Instructions
${skill.prompt}
`;
}
