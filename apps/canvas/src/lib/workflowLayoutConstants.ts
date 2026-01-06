/**
 * Workflow Layout Constants
 *
 * Constants for sidebar dimensions and resize handle styling.
 */

export const WORKFLOW_SIDEBAR = {
  left: {
    default: 380,
    min: 150,
    max: 500,
    collapsed: 35,
  },
  right: {
    default: 280,
    min: 150,
    max: 500,
    collapsed: 40,
  },
} as const;

export const RESIZE_HANDLE = {
  width: 4, // Clickable area width
  visualWidth: 1, // Visible line width
  hoverWidth: 3, // Hover indicator width
} as const;
