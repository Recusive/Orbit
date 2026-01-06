/**
 * Canvas Tools - Code-First Tool Definitions
 * Tools for the AI agent to manipulate SandpackNodes (live React code components)
 *
 * Ported from Orbit's canvasTools.ts
 */

import type { CanvasNode, CanvasTool } from '../types/types.js';

/**
 * Canvas tool definitions for Claude Agent SDK - Code-First Version
 *
 * These tools enable natural language → code workflow:
 * User: "Create a login form"
 * Agent: Uses create_component with actual React code
 *
 * User: "Make the button green"
 * Agent: Uses update_component to modify the code
 */
export const canvasTools: CanvasTool[] = [
  {
    name: 'create_component',
    description:
      'Create a new React component on the canvas. The component must be a complete, self-contained React component that exports a default function App(). Use Tailwind CSS for styling. The component will be rendered live in Sandpack.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Human-readable name for the component (e.g., "Login Form", "Product Card", "Navigation Menu"). This appears as the node label.',
        },
        code: {
          type: 'string',
          description:
            'Complete React component code. Must export default function App() and use Tailwind CSS classes for styling. React is available globally (use React.useState, React.useEffect). Example: export default function App() { return <button className="px-4 py-2 bg-blue-500">Click</button>; }',
        },
        position: {
          type: 'object',
          properties: {
            x: {
              type: 'number',
              description: 'X coordinate on canvas (pixels from left)',
            },
            y: {
              type: 'number',
              description: 'Y coordinate on canvas (pixels from top)',
            },
          },
          description:
            'Position on canvas. Optional - if not provided, will be placed intelligently based on existing nodes.',
        },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'update_component',
    description:
      'Update the code of an existing component on the canvas. Provide the complete new code - it will fully replace the existing code. Use this to modify styling, add features, fix bugs, or change behavior.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description:
            'ID of the component to update. Find this in the canvas state provided with each message.',
        },
        code: {
          type: 'string',
          description:
            'Complete new React component code. Must export default function App(). This replaces all existing code.',
        },
        name: {
          type: 'string',
          description:
            'Optional: New name for the component label. Only provide if the component name should change.',
        },
      },
      required: ['node_id', 'code'],
    },
  },
  {
    name: 'delete_component',
    description:
      'Delete a component from the canvas. This also removes all edges connected to this component.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to delete from the canvas.',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'connect_components',
    description:
      'Create an import/composition relationship between two components. The source component imports and uses the target component. This creates a visual edge on the canvas representing the dependency.',
    input_schema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'ID of the parent component that will import the child.',
        },
        target_id: {
          type: 'string',
          description: 'ID of the child component being imported.',
        },
      },
      required: ['source_id', 'target_id'],
    },
  },
  {
    name: 'get_canvas_state',
    description:
      'Get current state of all components on the canvas, including their code. Use this to understand the current design before making modifications. The state includes node IDs, names, positions, and full code.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'move_component',
    description:
      'Move a component to a new position on the canvas. Use this to reorganize the layout.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to move.',
        },
        position: {
          type: 'object',
          properties: {
            x: {
              type: 'number',
              description: 'New X coordinate on canvas (pixels)',
            },
            y: {
              type: 'number',
              description: 'New Y coordinate on canvas (pixels)',
            },
          },
          required: ['x', 'y'],
          description: 'New position for the component.',
        },
      },
      required: ['node_id', 'position'],
    },
  },

  // === Perception Tools ===
  // These tools enable the AI agent to perceive the rendered output of components
  // for verification, debugging, and intelligent visual editing

  {
    name: 'get_aria_snapshot',
    description:
      'Get the ARIA accessibility tree of a rendered component. Returns a token-efficient serialization of the semantic structure including roles, labels, and states. Use this to understand the structural hierarchy and verify accessibility.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to analyze.',
        },
        include_hidden: {
          type: 'boolean',
          description: 'Include elements with aria-hidden="true" or display:none. Default: false.',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'get_computed_styles',
    description:
      'Get computed CSS styles for a specific element in a rendered component. Returns both raw values and semantic interpretations mapped to design tokens (e.g., "16px" → "text-base", "#3b82f6" → "blue-500"). Use this to understand current styling and make informed modifications.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component containing the element.',
        },
        selector: {
          type: 'string',
          description:
            'CSS selector to target specific element (e.g., "button", ".card-title", "[data-source-loc=\\"1:5\\"]"). If not provided, returns styles for the root element.',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific CSS properties to retrieve (e.g., ["color", "font-size", "padding"]). If not provided, returns common layout and typography properties.',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'get_element_bounds',
    description:
      'Get bounding rectangles for elements in a rendered component. Returns position and size information useful for understanding layout and spatial relationships. Can target multiple elements to understand layout structure.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to analyze.',
        },
        selector: {
          type: 'string',
          description:
            'CSS selector to target elements. Use "*" for all elements, or specific selectors like "button", "div > p". Default: root element.',
        },
        include_children: {
          type: 'boolean',
          description: 'Include bounds for all child elements recursively. Default: false.',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'verify_component',
    description:
      'Verify a component renders correctly after modification. Captures ARIA snapshot, computed styles summary, and any runtime errors. Use this after create_component or update_component to confirm the change worked as expected.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to verify.',
        },
        expected_elements: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of elements expected to exist (e.g., ["button", "input[type=email]", ".error-message"]). Verification will report which are present/missing.',
        },
      },
      required: ['node_id'],
    },
  },

  // === Page Composition Tools ===
  // These tools enable composing multiple components into full pages

  {
    name: 'create_page',
    description:
      'Create a new page composition container that can hold multiple components arranged with a layout system. Pages support flex, grid, or absolute positioning layouts.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the page (e.g., "Landing Page", "Dashboard", "Settings").',
        },
        layout: {
          type: 'string',
          enum: ['flex', 'grid', 'absolute'],
          description:
            'Layout type: "flex" for flexible box layout (default), "grid" for CSS grid, "absolute" for free-form positioning.',
        },
        layout_options: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['row', 'column'],
              description: 'Flex direction (for flex layout). Default: "column".',
            },
            gap: {
              type: 'string',
              description: 'Gap between items (e.g., "16px", "1rem"). Default: "16px".',
            },
            padding: {
              type: 'string',
              description: 'Page padding (e.g., "24px", "2rem"). Default: "24px".',
            },
            grid_columns: {
              type: 'string',
              description: 'Grid template columns (for grid layout, e.g., "1fr 1fr", "280px 1fr").',
            },
            grid_rows: {
              type: 'string',
              description: 'Grid template rows (for grid layout, e.g., "auto 1fr auto").',
            },
            align_items: {
              type: 'string',
              description: 'Align items (e.g., "stretch", "center", "flex-start").',
            },
            justify_content: {
              type: 'string',
              description: 'Justify content (e.g., "flex-start", "center", "space-between").',
            },
          },
          description: 'Optional layout configuration options.',
        },
        viewport: {
          type: 'string',
          enum: ['mobile', 'tablet', 'desktop'],
          description: 'Target viewport size. Default: "desktop".',
        },
        background: {
          type: 'object',
          properties: {
            color: {
              type: 'string',
              description: 'Background color (e.g., "#ffffff", "rgb(255, 255, 255)").',
            },
            gradient: {
              type: 'string',
              description: 'CSS gradient (e.g., "linear-gradient(to bottom, #fff, #f0f0f0)").',
            },
          },
          description: 'Optional page background configuration.',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate on canvas' },
            y: { type: 'number', description: 'Y coordinate on canvas' },
          },
          description: 'Optional position on canvas.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_to_page',
    description:
      'Add an existing component to a page composition. The component will be placed according to the page layout. For absolute layouts, you can specify exact position.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page to add the component to.',
        },
        component_id: {
          type: 'string',
          description: 'ID of the component (SandpackNode) to add.',
        },
        position: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['flow', 'absolute'],
              description:
                'Positioning mode. "flow" follows layout, "absolute" uses x/y coordinates.',
            },
            grid_area: {
              type: 'string',
              description: 'Grid area name (for grid layouts with named areas).',
            },
            flex_grow: {
              type: 'number',
              description: 'Flex grow factor (for flex layouts).',
            },
            x: {
              type: 'number',
              description: 'X position (for absolute mode, pixels).',
            },
            y: {
              type: 'number',
              description: 'Y position (for absolute mode, pixels).',
            },
            width: {
              type: 'number',
              description: 'Width (for absolute mode, pixels).',
            },
            height: {
              type: 'number',
              description: 'Height (for absolute mode, pixels).',
            },
          },
          description: 'Position configuration within the page.',
        },
        z_index: {
          type: 'number',
          description: 'Z-index for stacking order. Higher values appear on top.',
        },
      },
      required: ['page_id', 'component_id'],
    },
  },
  {
    name: 'remove_from_page',
    description:
      'Remove a component from a page composition. The component itself is not deleted, just removed from the page.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page to remove the component from.',
        },
        slot_id: {
          type: 'string',
          description: 'ID of the slot (component placement) to remove.',
        },
      },
      required: ['page_id', 'slot_id'],
    },
  },
  {
    name: 'reorder_layers',
    description:
      'Change the order of layers (components) within a page. Affects visual stacking and flow order.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page containing the layers.',
        },
        slot_id: {
          type: 'string',
          description: 'ID of the slot to reorder.',
        },
        new_index: {
          type: 'number',
          description: 'New position index (0-based). 0 = first/bottom, higher = later/top.',
        },
        z_index: {
          type: 'number',
          description: 'Optional: Explicitly set z-index instead of computing from order.',
        },
      },
      required: ['page_id', 'slot_id', 'new_index'],
    },
  },
  {
    name: 'update_layout',
    description:
      'Update the layout configuration of a page. Change layout type, spacing, alignment, or other layout properties.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page to update.',
        },
        layout: {
          type: 'string',
          enum: ['flex', 'grid', 'absolute'],
          description: 'New layout type.',
        },
        layout_options: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['row', 'column'],
              description: 'Flex direction.',
            },
            gap: {
              type: 'string',
              description: 'Gap between items.',
            },
            padding: {
              type: 'string',
              description: 'Page padding.',
            },
            grid_columns: {
              type: 'string',
              description: 'Grid template columns.',
            },
            grid_rows: {
              type: 'string',
              description: 'Grid template rows.',
            },
            grid_areas: {
              type: 'string',
              description: 'Grid template areas (e.g., "header header" "sidebar main").',
            },
            align_items: {
              type: 'string',
              description: 'Align items.',
            },
            justify_content: {
              type: 'string',
              description: 'Justify content.',
            },
            wrap: {
              type: 'boolean',
              description: 'Enable flex wrap.',
            },
          },
          description: 'Layout options to update.',
        },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'update_page_slot',
    description: 'Update position or properties of a component slot within a page.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'ID of the page containing the slot.',
        },
        slot_id: {
          type: 'string',
          description: 'ID of the slot to update.',
        },
        position: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['flow', 'absolute'],
            },
            grid_area: { type: 'string' },
            flex_grow: { type: 'number' },
            flex_shrink: { type: 'number' },
            flex_basis: { type: 'string' },
            align_self: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: 'New position configuration.',
        },
        z_index: {
          type: 'number',
          description: 'New z-index value.',
        },
        visible: {
          type: 'boolean',
          description: 'Whether the slot is visible.',
        },
      },
      required: ['page_id', 'slot_id'],
    },
  },

  // === AI Design Generation Tools ===
  // High-level tools for rapid design exploration

  {
    name: 'generate_variants',
    description:
      'Generate 3 distinct design variants of a UI concept. Creates 3 separate, fully complete React components positioned side-by-side on the canvas. Each variant has a different visual approach (minimal vs bold vs creative). User can pick their favorite, edit any, combine elements, or iterate further. Use this when the user asks to "design", "create", or "build" something without specifying exact requirements.',
    input_schema: {
      type: 'object',
      properties: {
        concept: {
          type: 'string',
          description:
            'What to design (e.g., "pricing card", "login form", "navigation header", "testimonial section", "hero section", "feature grid").',
        },
        context: {
          type: 'string',
          description:
            'Optional context about the product, brand, or use case (e.g., "for a SaaS analytics dashboard", "dark theme", "playful brand for kids").',
        },
        styles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: 3 style directions to explore. If not provided, AI chooses diverse approaches. Examples: ["minimal", "bold", "gradient"], ["light", "dark", "colorful"], ["simple", "detailed", "animated"].',
        },
        base_position: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Starting X position for first variant' },
            y: { type: 'number', description: 'Y position for all variants' },
          },
          description:
            'Optional starting position. Variants will be placed 420px apart horizontally.',
        },
      },
      required: ['concept'],
    },
  },
  {
    name: 'iterate_design',
    description:
      'Create an improved version of an existing component based on natural language feedback. Takes a component and modification instructions, creates a NEW component with the changes (preserves original). Use for requests like "make it pop", "more modern", "add more contrast", "simplify it".',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'ID of the component to iterate on.',
        },
        instruction: {
          type: 'string',
          description:
            'Natural language instruction for improvement (e.g., "make it more vibrant", "add hover animations", "use a dark theme", "make it feel more premium").',
        },
        create_new: {
          type: 'boolean',
          description:
            'If true (default), creates a new component next to the original. If false, updates the original in-place.',
        },
      },
      required: ['node_id', 'instruction'],
    },
  },
  {
    name: 'create_layout',
    description:
      'Create a complete page layout with multiple components at once. Generates a cohesive set of components (e.g., header, hero, features, footer) that work together visually. Use for requests like "create a landing page", "build a dashboard layout", "design a settings page".',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'landing',
            'dashboard',
            'auth',
            'settings',
            'profile',
            'pricing',
            'blog',
            'custom',
          ],
          description: 'Type of layout to create.',
        },
        sections: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Sections to include. For "landing": ["header", "hero", "features", "testimonials", "cta", "footer"]. For "dashboard": ["sidebar", "topnav", "stats", "chart", "table"]. For "custom": specify your own sections.',
        },
        style: {
          type: 'string',
          description:
            'Overall style direction (e.g., "minimal and clean", "bold and colorful", "dark mode", "enterprise").',
        },
        context: {
          type: 'string',
          description:
            'Context about the product/brand (e.g., "AI writing assistant", "fitness app", "B2B SaaS").',
        },
      },
      required: ['type'],
    },
  },
];

// =============================================================================
// Tool Result Types (Re-exported from Zod schemas for strict typing)
// =============================================================================

export type {
  CreateComponentResult,
  UpdateComponentResult,
  DeleteComponentResult,
  ConnectComponentsResult,
  GetCanvasStateResult,
  MoveComponentResult,
  GetAriaSnapshotResult,
  GetComputedStylesResult,
  GetElementBoundsResult,
  VerifyComponentResult,
  CreatePageResult,
  AddToPageResult,
  RemoveFromPageResult,
  ReorderLayersResult,
  UpdateLayoutResult,
  UpdatePageSlotResult,
  GenerateVariantsResult,
  IterateDesignResult,
  CreateLayoutResult,
  CanvasToolResult,
} from '../types/schemas.js';

// Re-export schemas for structured output validation
export {
  CreateComponentResultSchema,
  UpdateComponentResultSchema,
  DeleteComponentResultSchema,
  ConnectComponentsResultSchema,
  GetCanvasStateResultSchema,
  MoveComponentResultSchema,
  GetAriaSnapshotResultSchema,
  GetComputedStylesResultSchema,
  GetElementBoundsResultSchema,
  VerifyComponentResultSchema,
  CreatePageResultSchema,
  AddToPageResultSchema,
  RemoveFromPageResultSchema,
  ReorderLayersResultSchema,
  UpdateLayoutResultSchema,
  UpdatePageSlotResultSchema,
  GenerateVariantsResultSchema,
  IterateDesignResultSchema,
  CreateLayoutResultSchema,
  CanvasToolResultSchema,
  getJsonSchema,
} from '../types/schemas.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique node ID
 */
export function generateNodeId(): string {
  return `sandpack-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate unique edge ID
 */
export function generateEdgeId(): string {
  return `edge-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate unique page ID
 */
export function generatePageId(): string {
  return `page-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate unique slot ID
 */
export function generateSlotId(): string {
  return `slot-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate smart position for new node based on existing nodes
 */
export function calculateSmartPosition(existingNodes: CanvasNode[] = []): { x: number; y: number } {
  // If no nodes exist, start at top-left area
  if (existingNodes.length === 0) {
    return { x: 100, y: 100 };
  }

  // Find the rightmost and bottommost positions
  const maxX = Math.max(...existingNodes.map((n) => n.position.x));
  const maxY = Math.max(...existingNodes.map((n) => n.position.y));
  const minY = Math.min(...existingNodes.map((n) => n.position.y));

  // Grid-like placement: try to fill rows
  const nodeWidth = 320; // Approximate SandpackNode width
  const nodeHeight = 250; // Approximate SandpackNode height
  const gap = 50;

  // If there's room on the current row, place there
  if (maxX < 800) {
    return {
      x: maxX + nodeWidth + gap,
      y: minY,
    };
  }

  // Otherwise, start a new row
  return {
    x: 100,
    y: maxY + nodeHeight + gap,
  };
}

/**
 * Validate that component code is valid (basic checks)
 */
export function validateComponentCode(code: string): { valid: boolean; error?: string } {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Code is required and must be a string' };
  }

  // Check for default export
  if (!code.includes('export default') && !code.includes('function App')) {
    return {
      valid: false,
      error: 'Code must export a default function App component',
    };
  }

  // Check for return statement
  if (!code.includes('return')) {
    return {
      valid: false,
      error: 'Component must have a return statement with JSX',
    };
  }

  return { valid: true };
}
