/**
 * Platform-specific prompt generator for Orbit Canvas
 * Generates AI prompts optimized for different coding platforms
 */

export type Platform = 'cursor' | 'windsurf' | 'claude-code' | 'lovable' | 'bolt';

export interface PlatformConfig {
  name: string;
  icon: string;
  description: string;
  suffix: string;
}

// Platform configurations with optimized prompt suffixes
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  cursor: {
    name: 'Cursor',
    icon: '>',
    description: 'AI-powered code editor',
    suffix: `Above is the design implementation. Please use this as a reference to create a similar React component.

Requirements:
- Use TypeScript for type safety
- Follow React best practices with functional components
- Use Tailwind CSS for styling
- Make the component reusable and well-documented
- Include proper accessibility attributes`,
  },

  windsurf: {
    name: 'Windsurf',
    icon: 'W',
    description: 'AI coding assistant',
    suffix: `Above is the design implementation. Please analyze this design and create a similar UI component.

Technical requirements:
- Modern React with hooks
- Tailwind CSS for styling
- TypeScript for type definitions
- Clean, maintainable code structure
- Responsive design considerations`,
  },

  'claude-code': {
    name: 'Claude Code',
    icon: 'C',
    description: 'Anthropic Claude in VS Code',
    suffix: `Above is the design implementation. Please use this as a reference to create a similar component.

Focus on:
- Clean, maintainable code structure
- TypeScript with proper types
- Tailwind CSS styling
- React best practices
- Accessibility (ARIA attributes, keyboard navigation)`,
  },

  lovable: {
    name: 'Lovable',
    icon: 'L',
    description: 'AI app builder',
    suffix: `Above is the design implementation. Please recreate this design as a responsive React component.

Key points:
- Use modern React patterns
- Implement with Tailwind CSS
- Ensure mobile-first responsive design
- Add smooth transitions and animations
- Keep the code production-ready`,
  },

  bolt: {
    name: 'Bolt',
    icon: 'B',
    description: 'AI web app generator',
    suffix: `Above is the design implementation. Please create a similar UI using this as reference.

Make it production-ready with:
- Proper TypeScript types
- Tailwind CSS styling
- Responsive breakpoints
- Clean component structure
- Error handling where appropriate`,
  },
};

export const DEFAULT_PLATFORM: Platform = 'claude-code';

/**
 * Generate a complete prompt for a specific platform
 */
export function generatePrompt(code: string, platform: Platform): string {
  const config = PLATFORM_CONFIGS[platform];
  return `\`\`\`tsx
${code}
\`\`\`

${config.suffix}`;
}

/**
 * Generate a prompt for iterating on a design with feedback
 */
export function generateIterationPrompt(
  code: string,
  feedback: string,
  platform: Platform
): string {
  const config = PLATFORM_CONFIGS[platform];
  return `\`\`\`tsx
${code}
\`\`\`

Please iterate on this design based on the following feedback:

${feedback}

${config.suffix}`;
}

/**
 * Generate a prompt for creating variations of a design
 */
export function generateVariationsPrompt(
  code: string,
  variationType: 'style' | 'layout' | 'color' | 'all',
  platform: Platform
): string {
  const config = PLATFORM_CONFIGS[platform];

  const variationInstructions: Record<string, string> = {
    style: 'Create variations with different visual styles (modern, minimal, bold, playful)',
    layout: 'Create variations with different layout arrangements',
    color: 'Create variations with different color schemes',
    all: 'Create variations exploring different styles, layouts, and color schemes',
  };

  return `\`\`\`tsx
${code}
\`\`\`

${variationInstructions[variationType] ?? ''}

Please provide 3 distinct variations of this design, each with its own unique take while maintaining the core functionality.

${config.suffix}`;
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Modern clipboard API
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Error handled - no console.error needed for this utility function
    // This happens in very old browsers or insecure contexts
    return false;
  }
}

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): Platform[] {
  return Object.keys(PLATFORM_CONFIGS) as Platform[];
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: Platform): string {
  return PLATFORM_CONFIGS[platform].name;
}

/**
 * Get platform icon
 */
export function getPlatformIcon(platform: Platform): string {
  return PLATFORM_CONFIGS[platform].icon;
}
