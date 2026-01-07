/**
 * Canvas Schemas - Strict Zod Schemas for Structured Outputs
 *
 * These schemas are used with the Claude Agent SDK's structured output feature
 * to ensure validated, type-safe JSON responses from the canvas agent.
 *
 * Pattern:
 * 1. Define Zod schema with .strict() and .describe()
 * 2. Convert to JSON Schema: z.toJSONSchema(schema)
 * 3. Pass to SDK: outputFormat: { type: 'json_schema', schema }
 * 4. Validate result: schema.safeParse(structured_output)
 */

import { z } from 'zod';

// =============================================================================
// POSITION SCHEMAS
// =============================================================================

/**
 * Canvas position schema
 */
export const CanvasPositionSchema = z
  .object({
    x: z.number().describe('X coordinate on canvas (pixels from left)'),
    y: z.number().describe('Y coordinate on canvas (pixels from top)'),
  })
  .strict()
  .describe('Position on the canvas');

// =============================================================================
// COMPONENT TOOL RESULT SCHEMAS
// =============================================================================

/**
 * Result from create_component tool
 */
export const CreateComponentResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was created successfully'),
    nodeId: z.string().describe('Unique ID of the created component node'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of creating a new component on the canvas');

export type CreateComponentResult = z.infer<typeof CreateComponentResultSchema>;

/**
 * Result from update_component tool
 */
export const UpdateComponentResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was updated successfully'),
    nodeId: z.string().describe('ID of the updated component node'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of updating an existing component');

export type UpdateComponentResult = z.infer<typeof UpdateComponentResultSchema>;

/**
 * Result from delete_component tool
 */
export const DeleteComponentResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was deleted successfully'),
    nodeId: z.string().describe('ID of the deleted component node'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of deleting a component from the canvas');

export type DeleteComponentResult = z.infer<typeof DeleteComponentResultSchema>;

/**
 * Result from connect_components tool
 */
export const ConnectComponentsResultSchema = z
  .object({
    success: z.boolean().describe('Whether the components were connected successfully'),
    edgeId: z.string().describe('Unique ID of the created edge'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of connecting two components with an edge');

export type ConnectComponentsResult = z.infer<typeof ConnectComponentsResultSchema>;

/**
 * Result from move_component tool
 */
export const MoveComponentResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was moved successfully'),
    nodeId: z.string().describe('ID of the moved component node'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of moving a component to a new position');

export type MoveComponentResult = z.infer<typeof MoveComponentResultSchema>;

// =============================================================================
// CANVAS STATE SCHEMA
// =============================================================================

/**
 * Component info in canvas state response
 */
export const ComponentInfoSchema = z
  .object({
    id: z.string().describe('Unique node ID'),
    name: z.string().describe('Human-readable component name'),
    position: CanvasPositionSchema,
    code: z.string().describe('React component source code'),
  })
  .strict()
  .describe('Component information in canvas state');

/**
 * Edge info in canvas state response
 */
export const EdgeInfoSchema = z
  .object({
    id: z.string().describe('Unique edge ID'),
    source: z.string().describe('Source node ID'),
    target: z.string().describe('Target node ID'),
  })
  .strict()
  .describe('Edge information in canvas state');

/**
 * Slot info in page state
 */
export const SlotInfoSchema = z
  .object({
    id: z.string().describe('Unique slot ID'),
    componentId: z.string().describe('ID of the component in this slot'),
    zIndex: z.number().describe('Z-index for stacking order'),
  })
  .strict()
  .describe('Slot information within a page');

/**
 * Layout info in page state
 */
export const LayoutInfoSchema = z
  .object({
    type: z.enum(['flex', 'grid', 'absolute']).describe('Layout type'),
    direction: z.enum(['row', 'column']).optional().describe('Flex direction'),
    gap: z.string().optional().describe('Gap between items'),
    padding: z.string().optional().describe('Page padding'),
  })
  .strict()
  .describe('Layout configuration for a page');

/**
 * Page info in canvas state response
 */
export const PageInfoSchema = z
  .object({
    id: z.string().describe('Unique page ID'),
    name: z.string().describe('Human-readable page name'),
    position: CanvasPositionSchema,
    layout: LayoutInfoSchema,
    viewport: z.enum(['mobile', 'tablet', 'desktop']).describe('Target viewport size'),
    slots: z.array(SlotInfoSchema).describe('Components placed in this page'),
  })
  .strict()
  .describe('Page information in canvas state');

/**
 * Result from get_canvas_state tool
 */
export const GetCanvasStateResultSchema = z
  .object({
    nodes: z.array(ComponentInfoSchema).describe('All component nodes on the canvas'),
    edges: z.array(EdgeInfoSchema).describe('All edges connecting components'),
    pages: z.array(PageInfoSchema).describe('All page containers on the canvas'),
  })
  .strict()
  .describe('Current state of all components, edges, and pages on the canvas');

export type GetCanvasStateResult = z.infer<typeof GetCanvasStateResultSchema>;

// =============================================================================
// PERCEPTION TOOL RESULT SCHEMAS
// =============================================================================

/**
 * ARIA tree node for accessibility snapshots
 */
export const AriaNodeSchema: z.ZodType<{
  role: string;
  name?: string;
  description?: string;
  value?: string;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  level?: number;
  children?: z.infer<typeof AriaNodeSchema>[];
}> = z.lazy(() =>
  z
    .object({
      role: z.string().describe('ARIA role (e.g., "button", "heading", "textbox")'),
      name: z.string().optional().describe('Accessible name'),
      description: z.string().optional().describe('Accessible description'),
      value: z.string().optional().describe('Current value for inputs'),
      checked: z
        .union([z.boolean(), z.literal('mixed')])
        .optional()
        .describe('Checked state for checkboxes'),
      selected: z.boolean().optional().describe('Selected state'),
      expanded: z.boolean().optional().describe('Expanded state for expandable elements'),
      disabled: z.boolean().optional().describe('Disabled state'),
      required: z.boolean().optional().describe('Required state for form fields'),
      level: z.number().optional().describe('Heading level (1-6)'),
      children: z.array(AriaNodeSchema).optional().describe('Child ARIA nodes'),
    })
    .strict()
);

/**
 * Result from get_aria_snapshot tool
 */
export const GetAriaSnapshotResultSchema = z
  .object({
    success: z.boolean().describe('Whether the snapshot was captured successfully'),
    nodeId: z.string().describe('ID of the analyzed component'),
    ariaTree: AriaNodeSchema.describe('Root of the ARIA accessibility tree'),
    textRepresentation: z.string().describe('Token-efficient text serialization of the ARIA tree'),
    elementCount: z.number().describe('Total count of accessible elements'),
  })
  .strict()
  .describe('ARIA accessibility tree snapshot of a rendered component');

export type GetAriaSnapshotResult = z.infer<typeof GetAriaSnapshotResultSchema>;

/**
 * Computed style value with semantic mapping
 */
export const ComputedStyleValueSchema = z
  .object({
    raw: z.string().describe('Raw CSS value (e.g., "16px", "#3b82f6")'),
    token: z.string().optional().describe('Tailwind token equivalent (e.g., "text-base")'),
    semantic: z
      .string()
      .optional()
      .describe('Semantic interpretation (e.g., "small text", "primary color")'),
  })
  .strict()
  .describe('Computed style value with Tailwind token mapping');

/**
 * Result from get_computed_styles tool
 */
export const GetComputedStylesResultSchema = z
  .object({
    success: z.boolean().describe('Whether styles were retrieved successfully'),
    nodeId: z.string().describe('ID of the component containing the element'),
    selector: z.string().describe('CSS selector used to target the element'),
    matchCount: z.number().describe('Number of elements matched by selector'),
    styles: z
      .record(z.string(), ComputedStyleValueSchema)
      .describe('Map of CSS property to computed value'),
    suggestedClasses: z
      .array(z.string())
      .optional()
      .describe('Suggested Tailwind classes based on computed styles'),
  })
  .strict()
  .describe('Computed CSS styles for elements in a rendered component');

export type GetComputedStylesResult = z.infer<typeof GetComputedStylesResultSchema>;

/**
 * Bounding rectangle for an element
 */
export const RectSchema = z
  .object({
    x: z.number().describe('X position relative to viewport'),
    y: z.number().describe('Y position relative to viewport'),
    width: z.number().describe('Element width in pixels'),
    height: z.number().describe('Element height in pixels'),
    top: z.number().describe('Distance from top of viewport'),
    right: z.number().describe('Distance from left to right edge'),
    bottom: z.number().describe('Distance from top to bottom edge'),
    left: z.number().describe('Distance from left of viewport'),
  })
  .strict()
  .describe('Bounding rectangle dimensions');

/**
 * Element bounds information
 */
export const ElementBoundsSchema = z
  .object({
    selector: z.string().describe('CSS selector that matched this element'),
    tagName: z.string().describe('HTML tag name (e.g., "div", "button")'),
    id: z.string().optional().describe('Element ID attribute'),
    className: z.string().optional().describe('Element class names'),
    rect: RectSchema.describe('Bounding rectangle'),
    sourceLoc: z.string().optional().describe('Source location from data-source-loc attribute'),
  })
  .strict()
  .describe('Bounds information for a DOM element');

/**
 * Result from get_element_bounds tool
 */
export const GetElementBoundsResultSchema = z
  .object({
    success: z.boolean().describe('Whether bounds were retrieved successfully'),
    nodeId: z.string().describe('ID of the analyzed component'),
    elements: z.array(ElementBoundsSchema).describe('Bounds for matched elements'),
    viewport: z
      .object({
        width: z.number().describe('Viewport width in pixels'),
        height: z.number().describe('Viewport height in pixels'),
      })
      .strict()
      .describe('Viewport dimensions'),
  })
  .strict()
  .describe('Bounding rectangles for elements in a rendered component');

export type GetElementBoundsResult = z.infer<typeof GetElementBoundsResultSchema>;

/**
 * Result from verify_component tool
 */
export const VerifyComponentResultSchema = z
  .object({
    success: z.boolean().describe('Whether verification completed successfully'),
    nodeId: z.string().describe('ID of the verified component'),
    rendered: z.boolean().describe('Whether the component rendered without errors'),
    errors: z.array(z.string()).optional().describe('Runtime errors if any'),
    ariaSummary: z.string().describe('ARIA summary for quick verification'),
    foundElements: z.array(z.string()).optional().describe('Expected elements that were found'),
    missingElements: z
      .array(z.string())
      .optional()
      .describe('Expected elements that were not found'),
    dimensions: z
      .object({
        width: z.number().describe('Rendered width in pixels'),
        height: z.number().describe('Rendered height in pixels'),
      })
      .strict()
      .optional()
      .describe('Component dimensions after render'),
  })
  .strict()
  .describe('Verification result for a rendered component');

export type VerifyComponentResult = z.infer<typeof VerifyComponentResultSchema>;

// =============================================================================
// PAGE COMPOSITION TOOL RESULT SCHEMAS
// =============================================================================

/**
 * Result from create_page tool
 */
export const CreatePageResultSchema = z
  .object({
    success: z.boolean().describe('Whether the page was created successfully'),
    pageId: z.string().describe('Unique ID of the created page'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of creating a new page container');

export type CreatePageResult = z.infer<typeof CreatePageResultSchema>;

/**
 * Result from add_to_page tool
 */
export const AddToPageResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was added successfully'),
    pageId: z.string().describe('ID of the page'),
    slotId: z.string().describe('ID of the created slot'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of adding a component to a page');

export type AddToPageResult = z.infer<typeof AddToPageResultSchema>;

/**
 * Result from remove_from_page tool
 */
export const RemoveFromPageResultSchema = z
  .object({
    success: z.boolean().describe('Whether the component was removed successfully'),
    pageId: z.string().describe('ID of the page'),
    slotId: z.string().describe('ID of the removed slot'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of removing a component from a page');

export type RemoveFromPageResult = z.infer<typeof RemoveFromPageResultSchema>;

/**
 * Result from reorder_layers tool
 */
export const ReorderLayersResultSchema = z
  .object({
    success: z.boolean().describe('Whether the layers were reordered successfully'),
    pageId: z.string().describe('ID of the page'),
    slotId: z.string().describe('ID of the reordered slot'),
    newIndex: z.number().describe('New position index'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of reordering layers within a page');

export type ReorderLayersResult = z.infer<typeof ReorderLayersResultSchema>;

/**
 * Result from update_layout tool
 */
export const UpdateLayoutResultSchema = z
  .object({
    success: z.boolean().describe('Whether the layout was updated successfully'),
    pageId: z.string().describe('ID of the updated page'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of updating page layout configuration');

export type UpdateLayoutResult = z.infer<typeof UpdateLayoutResultSchema>;

/**
 * Result from update_page_slot tool
 */
export const UpdatePageSlotResultSchema = z
  .object({
    success: z.boolean().describe('Whether the slot was updated successfully'),
    pageId: z.string().describe('ID of the page'),
    slotId: z.string().describe('ID of the updated slot'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of updating a slot within a page');

export type UpdatePageSlotResult = z.infer<typeof UpdatePageSlotResultSchema>;

// =============================================================================
// AI DESIGN GENERATION TOOL RESULT SCHEMAS
// =============================================================================

/**
 * Result from generate_variants tool
 */
export const GenerateVariantsResultSchema = z
  .object({
    success: z.boolean().describe('Whether variants were generated successfully'),
    nodeIds: z
      .tuple([z.string(), z.string(), z.string()])
      .describe('IDs of the 3 created variant components'),
    names: z.tuple([z.string(), z.string(), z.string()]).describe('Names of the 3 variants'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of generating 3 design variants');

export type GenerateVariantsResult = z.infer<typeof GenerateVariantsResultSchema>;

/**
 * Result from iterate_design tool
 */
export const IterateDesignResultSchema = z
  .object({
    success: z.boolean().describe('Whether the iteration was successful'),
    nodeId: z.string().describe('ID of the new/updated component'),
    createdNew: z
      .boolean()
      .describe('Whether a new component was created (true) or original was updated (false)'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of iterating on a design');

export type IterateDesignResult = z.infer<typeof IterateDesignResultSchema>;

/**
 * Result from create_layout tool
 */
export const CreateLayoutResultSchema = z
  .object({
    success: z.boolean().describe('Whether the layout was created successfully'),
    nodeIds: z.array(z.string()).describe('IDs of all created section components'),
    pageId: z.string().optional().describe('ID of the page container (if created)'),
    sections: z.array(z.string()).describe('Names of the sections created'),
    message: z.string().describe('Human-readable result message'),
  })
  .strict()
  .describe('Result of creating a complete page layout');

export type CreateLayoutResult = z.infer<typeof CreateLayoutResultSchema>;

// =============================================================================
// UNION TYPE FOR ALL TOOL RESULTS
// =============================================================================

/**
 * Discriminated union of all canvas tool results
 */
export const CanvasToolResultSchema = z.union([
  CreateComponentResultSchema,
  UpdateComponentResultSchema,
  DeleteComponentResultSchema,
  ConnectComponentsResultSchema,
  MoveComponentResultSchema,
  GetCanvasStateResultSchema,
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
]);

export type CanvasToolResult = z.infer<typeof CanvasToolResultSchema>;

// =============================================================================
// HELPER FOR CONVERTING TO JSON SCHEMA
// =============================================================================

/**
 * Get JSON Schema for a canvas tool result schema.
 * Use this with SDK's outputFormat option.
 *
 * @example
 * const outputFormat = {
 *   type: 'json_schema' as const,
 *   schema: getJsonSchema(CreateComponentResultSchema),
 * };
 */
export function getJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
