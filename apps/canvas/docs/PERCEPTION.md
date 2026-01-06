# Perception System

The perception system enables the AI agent to "see" the rendered output of Sandpack previews. This is critical for AI-driven design refinement, accessibility verification, and layout inspection.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  AI Agent (via MCP Tools)                                   │
├─────────────────────────────────────────────────────────────┤
│  useMcpToolExecution → usePerception                        │
├─────────────────────────────────────────────────────────────┤
│  Canvas (postMessage to iframes)                            │
├─────────────────────────────────────────────────────────────┤
│  Sandpack Iframe (handles perception requests)              │
│  sandpackConfig.ts                                          │
└─────────────────────────────────────────────────────────────┘
```

## Perception Tools

### 1. get_aria_snapshot

Extracts the accessibility tree from the rendered component.

**Request:**

```typescript
{
  type: 'get-aria-snapshot',
  nodeId: string,
  requestId: string,
  includeHidden?: boolean
}
```

**Response:**

```typescript
{
  type: 'aria-snapshot-result',
  nodeId: string,
  requestId: string,
  payload: {
    ariaTree: AriaNode,
    textRepresentation: string,
    elementCount: number
  }
}
```

**AriaNode structure:**

```typescript
interface AriaNode {
  role: string; // 'button', 'textbox', 'link', etc.
  name?: string; // Accessible name
  children?: AriaNode[];
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  level?: number; // For headings
}
```

### 2. get_computed_styles

Gets computed CSS styles for elements matching a selector.

**Request:**

```typescript
{
  type: 'get-computed-styles',
  nodeId: string,
  requestId: string,
  selector?: string,        // CSS selector (default: root)
  properties?: string[]     // Specific properties to get
}
```

**Response:**

```typescript
{
  type: 'computed-styles-result',
  nodeId: string,
  requestId: string,
  payload: {
    styles: Record<string, { raw: string }>,
    matchCount: number
  }
}
```

### 3. get_element_bounds

Gets bounding rectangles for elements.

**Request:**

```typescript
{
  type: 'get-element-bounds',
  nodeId: string,
  requestId: string,
  selector?: string,
  includeChildren?: boolean
}
```

**Response:**

```typescript
{
  type: 'element-bounds-result',
  nodeId: string,
  requestId: string,
  payload: {
    elements: Array<{
      selector: string,
      bounds: { x: number, y: number, width: number, height: number }
    }>,
    viewport: { width: number, height: number }
  }
}
```

### 4. verify_component

Verifies that expected elements exist and the component rendered successfully.

**Request:**

```typescript
{
  type: 'verify-component',
  nodeId: string,
  requestId: string,
  expectedElements?: string[]  // Selectors to check
}
```

**Response:**

```typescript
{
  type: 'verify-result',
  nodeId: string,
  requestId: string,
  payload: {
    rendered: boolean,
    errors: string[],
    ariaSummary: string,
    foundElements: string[],
    missingElements: string[]
  }
}
```

## Usage in MCP Tools

The AI agent uses perception through MCP tool requests:

```typescript
// In extension: Agent calls MCP tool
{
  type: 'mcp-tool-request',
  requestId: 'req-123',
  tool: 'get_aria_snapshot',
  args: {
    node_id: 'sandpack-456',
    include_hidden: false
  }
}

// Canvas handles via useMcpToolExecution
// → calls usePerception.sendPerceptionRequest()
// → broadcasts to all iframes
// → iframe matching nodeId responds
// → Canvas sends back to extension via mcp-tool-response
```

## Development Testing

In development mode, a test harness is available on `window.__perception`:

```javascript
// In browser console:

// Test ARIA snapshot
window.__perception.testAriaSnapshot('sandpack-123');

// Test computed styles
window.__perception.testComputedStyles('sandpack-123', 'button');

// Test element bounds
window.__perception.testElementBounds('sandpack-123', '.my-element');

// Verify component
window.__perception.testVerify('sandpack-123', ['button', 'input']);

// List pending requests
window.__perception.listPending();
```

To enable the test harness, add to CanvasApp (dev mode only):

```typescript
import { installPerceptionTestHarness } from './hooks';

// In CanvasApp
const { sendPerceptionRequest, pendingRequests } = usePerception({ debug: true });

useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    installPerceptionTestHarness(sendPerceptionRequest, pendingRequests);
  }
}, [sendPerceptionRequest, pendingRequests]);
```

## Error Handling

- **Timeout:** Requests timeout after 5 seconds (configurable via `timeout` option)
- **No iframes:** Error if no iframes exist when request is made
- **Cross-origin:** Cross-origin iframe errors are silently ignored
- **Node ID mismatch:** Responses are validated against the expected nodeId

## Implementation Details

### Canvas Side (`usePerception.ts`)

1. Creates unique requestId for tracking
2. Stores pending request with resolve/reject callbacks
3. Broadcasts to all iframes (they filter by nodeId)
4. Sets timeout for cleanup
5. Listens for matching response message
6. Resolves promise with payload

### Iframe Side (`sandpackConfig.ts`)

1. Listens for perception request messages
2. Checks if nodeId matches this iframe
3. Executes the perception logic:
   - ARIA: Builds accessibility tree by walking DOM
   - Styles: Uses `getComputedStyle()`
   - Bounds: Uses `getBoundingClientRect()`
   - Verify: Combines ARIA + selector checks
4. Posts result message back to parent

## Performance Considerations

- Perception requests are async and non-blocking
- ARIA tree building walks the entire DOM (can be slow for large components)
- Multiple iframes receive all requests (filter by nodeId)
- Timeout prevents stuck requests from blocking agent

## Future Improvements

1. **Instance targeting:** Use SandpackMessageBus to target specific iframes by instanceId
2. **Caching:** Cache ARIA trees that haven't changed
3. **Incremental updates:** Only report changed portions of ARIA tree
4. **Screenshot:** Add visual screenshot capability
5. **Interaction replay:** Record and replay user interactions for debugging
