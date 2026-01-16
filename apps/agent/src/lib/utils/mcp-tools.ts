/**
 * MCP Tool Utilities
 * Helper functions for formatting and identifying MCP (Model Context Protocol) tools
 */

/** Provider display name mappings for MCP tools */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  'orbit-browser': 'Browser',
  'claude-in-chrome': 'Browser',
  plugin_playwright_playwright: 'Playwright',
};

/**
 * Format MCP tool names for display.
 *
 * Transforms tool names like "mcp__orbit-browser__browser_open" to "Browser: Open"
 *
 * @param toolName - The raw MCP tool name
 * @returns Formatted display name, or null if not an MCP tool
 *
 * @example
 * formatMcpToolName('mcp__orbit-browser__browser_open') // "Browser: Open"
 * formatMcpToolName('mcp__claude-in-chrome__browser_navigate') // "Browser: Navigate"
 * formatMcpToolName('bash') // null (not an MCP tool)
 */
export function formatMcpToolName(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) {
    return null;
  }

  const parts = toolName.split('__');
  const provider = parts[1];
  const actionParts = parts.slice(2);

  if (!provider || actionParts.length === 0) {
    return null;
  }

  const action = actionParts.join('__'); // e.g., "browser_open"

  const displayProvider = PROVIDER_DISPLAY_NAMES[provider] ?? provider;

  // Extract action name (remove provider prefix if present)
  // e.g., "browser_open" → "open", "browser_navigate" → "navigate"
  let actionName = action;
  if (action.startsWith('browser_')) {
    actionName = action.slice(8); // Remove "browser_" prefix
  }

  // Capitalize and format action name
  // e.g., "open" → "Open", "take_screenshot" → "Take Screenshot"
  const formattedAction = actionName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `${displayProvider}: ${formattedAction}`;
}

/**
 * Check if a tool is a browser-related MCP tool.
 *
 * @param toolName - The tool name to check
 * @returns true if the tool is browser-related
 *
 * @example
 * isBrowserTool('mcp__orbit-browser__browser_open') // true
 * isBrowserTool('mcp__claude-in-chrome__navigate') // true
 * isBrowserTool('bash') // false
 */
export function isBrowserTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name.includes('browser') || name.includes('orbit-browser') || name.includes('claude-in-chrome')
  );
}

/**
 * Check if a tool name is an MCP tool (starts with "mcp__").
 *
 * @param toolName - The tool name to check
 * @returns true if it's an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}

/**
 * Extract the provider name from an MCP tool name.
 *
 * @param toolName - The MCP tool name
 * @returns The provider name, or null if not an MCP tool
 *
 * @example
 * getMcpToolProvider('mcp__orbit-browser__browser_open') // "orbit-browser"
 */
export function getMcpToolProvider(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) {
    return null;
  }

  const parts = toolName.split('__');
  return parts[1] ?? null;
}
