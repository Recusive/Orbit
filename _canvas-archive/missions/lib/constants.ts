/**
 * Missions Layout Constants
 *
 * Constants for missions mode sidebar dimensions.
 * Single source of truth for sidebar constraints to prevent drift between
 * components and stores.
 */

export const MISSIONS_SIDEBAR = {
  left: {
    default: 280,
    min: 200,
    max: 400,
  },
  right: {
    default: 320,
    min: 280,
    max: 500,
  },
} as const;
