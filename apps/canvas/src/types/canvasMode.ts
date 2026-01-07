/**
 * Canvas rendering mode types
 * Supports tri-mode canvas with design view, code view, and workflow view
 */

export type CanvasMode = 'design' | 'code' | 'workflow';

export interface CanvasModeConfig {
  mode: CanvasMode;
}

export const DEFAULT_CANVAS_MODE: CanvasModeConfig = {
  mode: 'code', // Start with code mode (current behavior)
};

export const CANVAS_MODE_LABELS: Record<CanvasMode, string> = {
  design: 'Design',
  code: 'Code',
  workflow: 'Workflow',
};

export const CANVAS_MODE_DESCRIPTIONS: Record<CanvasMode, string> = {
  design: 'Visual design with frames, shapes, and direct manipulation',
  code: 'Live React components with Sandpack preview',
  workflow: 'AI-assisted planning with connected markdown cards',
};
