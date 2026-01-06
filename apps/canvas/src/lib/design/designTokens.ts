/**
 * Design Tokens for Orbit Canvas
 *
 * IMPORTANT: All colors come from globals.css via CSS variables.
 * This file only contains layout tokens (spacing, radii, typography, motion, component sizes).
 *
 * Color usage in components:
 *   backgroundColor: 'var(--card)'
 *   color: 'var(--foreground)'
 *   borderColor: 'var(--border)'
 *   etc.
 */

// =============================================================================
// SPACING SCALE (4px base unit)
// =============================================================================

export const spacing = {
  xs: 2, // 2px - minimal spacing
  sm: 4, // 4px - tight spacing
  md: 8, // 8px - compact spacing
  lg: 12, // 12px - standard spacing
  xl: 16, // 16px - comfortable spacing
  '2xl': 20, // 20px - loose spacing
  '3xl': 28, // 28px - section spacing
  '4xl': 40, // 40px - large section spacing
} as const;

// =============================================================================
// BORDER RADIUS SCALE
// =============================================================================

export const radii = {
  xs: 2, // subtle rounding
  sm: 4, // inputs, small buttons
  md: 6, // icon containers, buttons
  lg: 8, // cards, panels
  xl: 12, // modals, floating panels
  '2xl': 16, // chat panel expanded
  pill: 9999, // badges, pills
} as const;

// =============================================================================
// TYPOGRAPHY SCALE
// =============================================================================

export const fontSize = {
  xs: 10, // badges, hints
  sm: 11, // labels, descriptions
  base: 13, // body text
  md: 14, // emphasized text
  lg: 16, // inputs, headings
} as const;

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
} as const;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '-0.01em',
  wide: '0.04em',
} as const;

// =============================================================================
// SHADOWS (use CSS variables where possible)
// =============================================================================

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.1)',
  sm: '0 2px 8px rgba(0, 0, 0, 0.15)',
  md: '0 4px 12px rgba(0, 0, 0, 0.2)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.3)',
  xl: '0 24px 48px rgba(0, 0, 0, 0.4), 0 12px 24px rgba(0, 0, 0, 0.2)',
  glow: '0 0 16px var(--selection)',
  glowStrong: '0 4px 20px var(--selection), 0 2px 8px rgba(0, 0, 0, 0.2)',
  inset: '0 0 0 1px var(--border) inset',
  focus: '0 0 0 2px var(--ring)',
  button: '0 2px 4px rgba(0, 0, 0, 0.2)',
  buttonHover: '0 4px 8px rgba(0, 0, 0, 0.25)',
  input: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
} as const;

// =============================================================================
// ANIMATION
// =============================================================================

export const motion = {
  // Durations
  instant: '0.075s',
  fast: '0.1s',
  normal: '0.15s',
  smooth: '0.2s',
  slow: '0.25s',
  slower: '0.3s',

  // Easings
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// =============================================================================
// COMPONENT-SPECIFIC SIZES
// =============================================================================

export const components = {
  toolbar: { height: 35 },
  sidebar: {
    widthExpanded: 380,
    widthCollapsed: 35,
    tabBarHeight: 48,
    minWidth: 360,
    maxWidth: 700,
  },
  previewPanel: {
    widthExpanded: 420,
    widthCollapsed: 35,
    widthMaximized: 640,
  },
  panel: { headerHeight: 40 },
  chatPanel: { widthOpen: 400, heightOpen: 520, heightMinimized: 48 },
  node: { width: 280 },
  icon: { sm: 14, md: 16, lg: 18, xl: 20 },
  button: {
    sm: 28,
    md: 32,
    lg: 36,
    xl: 40,
  },
  input: {
    height: 36,
    heightLg: 40,
  },
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  chatPanel: 100,
  contextMenu: 9999,
} as const;

// =============================================================================
// KEYFRAME ANIMATIONS (as CSS strings)
// =============================================================================

export const keyframes = {
  fadeIn: `
		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
	`,
  fadeInScale: `
		@keyframes fadeInScale {
			from { opacity: 0; transform: scale(0.96); }
			to { opacity: 1; transform: scale(1); }
		}
	`,
  slideUp: `
		@keyframes slideUp {
			from { opacity: 0; transform: translateY(8px) scale(0.98); }
			to { opacity: 1; transform: translateY(0) scale(1); }
		}
	`,
  slideDown: `
		@keyframes slideDown {
			from { opacity: 0; transform: translateY(-8px); }
			to { opacity: 1; transform: translateY(0); }
		}
	`,
  pulse: `
		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.6; }
		}
	`,
  spin: `
		@keyframes spin {
			from { transform: rotate(0deg); }
			to { transform: rotate(360deg); }
		}
	`,
  shimmer: `
		@keyframes shimmer {
			0% { background-position: -200% 0; }
			100% { background-position: 200% 0; }
		}
	`,
} as const;

// =============================================================================
// STYLE HELPERS
// =============================================================================

/** Create a transition string with consistent easing */
export const transition = (properties: string | string[], duration = motion.normal): string => {
  const props = Array.isArray(properties) ? properties : [properties];
  return props.map((p: string): string => `${p} ${duration} ${motion.ease}`).join(', ');
};

/** Create hover lift effect styles */
export const hoverLift = {
  transition: transition(['transform', 'box-shadow']),
  cursor: 'pointer',
} as const;

export const hoverLiftActive = {
  transform: 'translateY(-1px)',
  boxShadow: shadows.sm,
} as const;

/** Create press effect styles */
export const pressEffect = {
  transform: 'scale(0.98)',
} as const;

/** Common input styles - uses CSS variables from globals.css */
export const inputBase = {
  height: components.input.height,
  padding: `0 ${String(spacing.xl)}px`,
  fontSize: fontSize.base,
  fontWeight: fontWeight.normal,
  backgroundColor: 'var(--input)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: radii.md,
  outline: 'none',
  transition: transition(['border-color', 'box-shadow', 'background-color']),
} as const;

/** Focus ring for inputs - uses CSS variables */
export const focusRing = {
  borderColor: 'var(--ring)',
  boxShadow: '0 0 0 1px var(--ring)',
} as const;
