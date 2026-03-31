/**
 * Skill category color system.
 *
 * Maps skill names to domain categories, each with a distinct hex color.
 * Applied via inline style (not Tailwind classes) so colors are always
 * present regardless of JIT scanning.
 *
 * Usage:
 *   import { getSkillColor } from '@/lib/utils/skill-colors';
 *   <div style={{ backgroundColor: getSkillColor(skill.name) }} />
 */

// ── Category definitions ──────────────────────────────────────

type SkillCategory =
  | 'frontend'
  | 'backend'
  | 'design'
  | 'testing'
  | 'devops'
  | 'database'
  | 'security'
  | 'accessibility'
  | 'performance'
  | 'ai'
  | 'strategy'
  | 'docs'
  | 'general';

/**
 * Keyword → category mapping. First match wins.
 * Order matters: more specific keywords should come first.
 */
const CATEGORY_KEYWORDS: readonly (readonly [SkillCategory, readonly string[]])[] = [
  [
    'frontend',
    [
      'react',
      'frontend',
      'css',
      'tailwind',
      'component',
      'animation',
      'web-design',
      'web-animation',
      'ui',
      'interface',
      'emil',
      'impeccable',
      'bolder',
      'quieter',
      'colorize',
      'polish',
      'distill',
      'delight',
      'onboard',
      'adapt',
      'clarify',
    ],
  ],
  ['backend', ['backend', 'rust', 'server', 'api', 'tauri', 'bridge', 'protocol']],
  ['design', ['design', 'figma', 'pencil', 'brand', 'website', 'messaging', 'landing']],
  ['testing', ['test', 'stress', 'mosaic', 'vitest', 'coverage', 'verify']],
  ['devops', ['deploy', 'ci', 'docker', 'infra', 'schedule', 'loop', 'config']],
  ['database', ['db', 'database', 'sql', 'migration', 'schema', 'data']],
  ['security', ['security', 'auth', 'rbac', 'permission', 'csp', 'vault', 'encrypt']],
  ['accessibility', ['a11y', 'accessibility', 'aria', 'screen-reader', 'wcag']],
  ['performance', ['perf', 'performance', 'optimize', 'speed', 'cache', 'bundle']],
  ['ai', ['ai', 'claude', 'agent', 'sdk', 'prompt', 'skill-creator', 'skill-refiner', 'complete']],
  [
    'strategy',
    [
      'strategy',
      'gtm',
      'pricing',
      'audience',
      'competitor',
      'metric',
      'seo',
      'social',
      'proof',
      'objection',
      'x-content',
    ],
  ],
  ['docs', ['doc', 'changelog', 'readme', 'plan', 'spec', 'blueprint', 'pattern']],
  ['general', []],
];

/**
 * CSS gradient per category. Applied as `backgroundImage`.
 * Each gradient blends two related hues at 135° for depth.
 */
const CATEGORY_COLORS: Record<SkillCategory, string> = {
  frontend: 'linear-gradient(135deg, #3b82f6, #06b6d4)', // blue → cyan
  backend: 'linear-gradient(135deg, #f97316, #ef4444)', // orange → red
  design: 'linear-gradient(135deg, #ec4899, #a855f7)', // pink → purple
  testing: 'linear-gradient(135deg, #10b981, #06b6d4)', // emerald → cyan
  devops: 'linear-gradient(135deg, #14b8a6, #3b82f6)', // teal → blue
  database: 'linear-gradient(135deg, #f59e0b, #f97316)', // amber → orange
  security: 'linear-gradient(135deg, #ef4444, #ec4899)', // red → pink
  accessibility: 'linear-gradient(135deg, #a855f7, #3b82f6)', // purple → blue
  performance: 'linear-gradient(135deg, #eab308, #f97316)', // yellow → orange
  ai: 'linear-gradient(135deg, #8b5cf6, #ec4899)', // violet → pink
  strategy: 'linear-gradient(135deg, #06b6d4, #10b981)', // cyan → emerald
  docs: 'linear-gradient(135deg, #64748b, #3b82f6)', // slate → blue
  general: 'linear-gradient(135deg, #6366f1, #8b5cf6)', // indigo → violet
};

// ── Public API ────────────────────────────────────────────────

/** Simple string hash → positive integer. */
function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** All colorful categories (excludes general/docs grey fallbacks). */
const COLORFUL_CATEGORIES: readonly SkillCategory[] = [
  'frontend',
  'backend',
  'design',
  'testing',
  'devops',
  'database',
  'security',
  'accessibility',
  'performance',
  'ai',
  'strategy',
];

/** Determine category from skill name + description by keyword matching. */
function categorizeSkill(name: string, description?: string): SkillCategory {
  const text = `${name} ${description ?? ''}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }
  // No keyword match → pick a colorful category from the name hash
  return COLORFUL_CATEGORIES[hashName(name) % COLORFUL_CATEGORIES.length] ?? 'general';
}

/** Get the hex color for a skill's facehash avatar. Pass description for better matching. */
export function getSkillColor(name: string, description?: string): string {
  return CATEGORY_COLORS[categorizeSkill(name, description)];
}

/** Get the category name (for debugging / tooltips). */
export function getSkillCategory(name: string, description?: string): SkillCategory {
  return categorizeSkill(name, description);
}
