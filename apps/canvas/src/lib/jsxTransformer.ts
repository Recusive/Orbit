/**
 * jsxTransformer - AST-based JSX code transformation utilities
 *
 * Provides functions for structural editing of JSX code:
 * - Parse JSX to AST
 * - Find elements by JSX path (e.g., "0.1.2" = first child > second child > third child)
 * - Reorder, add, and remove JSX elements
 * - Generate code from modified AST
 */

import generate from '@babel/generator';
import * as parser from '@babel/parser';
import * as t from '@babel/types';

// =============================================================================
// TYPES
// =============================================================================

export interface JSXPathInfo {
  /** Full path from root (e.g., "0.1.2") */
  path: string;
  /** Index within parent's children */
  index: number;
  /** Parent's path (null for root elements) */
  parentPath: string | null;
}

export interface ReorderResult {
  success: boolean;
  code: string;
  error?: string;
}

export interface AddElementResult {
  success: boolean;
  code: string;
  newElementPath?: string;
  error?: string;
}

export interface RemoveElementResult {
  success: boolean;
  code: string;
  error?: string;
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse JSX code into a Babel AST.
 * Handles both full components and JSX fragments.
 */
export function parseJSXCode(code: string): t.File {
  return parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
}

/**
 * Generate code from a Babel AST.
 * Preserves formatting as much as possible.
 */
export function generateCode(ast: t.File): string {
  const result = generate(ast, {
    retainLines: false,
    compact: false,
  });
  return result.code;
}

// =============================================================================
// JSX ELEMENT TRAVERSAL
// =============================================================================

type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXText
  | t.JSXExpressionContainer
  | t.JSXSpreadChild;

/**
 * Get only JSX element children (excluding whitespace text nodes).
 */
function getJSXElementChildren(element: t.JSXElement | t.JSXFragment): t.JSXElement[] {
  return element.children.filter((child): child is t.JSXElement => {
    if (t.isJSXElement(child)) return true;
    // Skip whitespace-only text nodes
    if (t.isJSXText(child) && child.value.trim() === '') return false;
    return false;
  });
}

/**
 * Find the return statement containing JSX in a function/component.
 */
function findJSXReturnStatement(ast: t.File): t.ReturnStatement | null {
  let returnStmt: t.ReturnStatement | null = null;

  // Look for arrow function expressions or function declarations
  for (const node of ast.program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      const decl = node.declaration;
      if (t.isArrowFunctionExpression(decl) || t.isFunctionExpression(decl)) {
        if (t.isBlockStatement(decl.body)) {
          for (const stmt of decl.body.body) {
            if (t.isReturnStatement(stmt)) {
              returnStmt = stmt;
              break;
            }
          }
        } else if (t.isJSXElement(decl.body) || t.isJSXFragment(decl.body)) {
          // Arrow function with implicit return
          return null; // Handle differently
        }
      }
    } else if (t.isFunctionDeclaration(node) || t.isExportNamedDeclaration(node)) {
      const func = t.isFunctionDeclaration(node)
        ? node
        : t.isFunctionDeclaration(node.declaration)
          ? node.declaration
          : null;
      if (func?.body) {
        for (const stmt of func.body.body) {
          if (t.isReturnStatement(stmt)) {
            returnStmt = stmt;
            break;
          }
        }
      }
    } else if (t.isVariableDeclaration(node)) {
      for (const decl of node.declarations) {
        if (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init)) {
          const func = decl.init;
          if (t.isBlockStatement(func.body)) {
            for (const stmt of func.body.body) {
              if (t.isReturnStatement(stmt)) {
                returnStmt = stmt;
                break;
              }
            }
          }
        }
      }
    }
  }

  return returnStmt;
}

/**
 * Get the root JSX element from parsed code.
 */
function getRootJSXElement(ast: t.File): t.JSXElement | t.JSXFragment | null {
  // Check for direct JSX expression
  for (const node of ast.program.body) {
    if (t.isExpressionStatement(node)) {
      if (t.isJSXElement(node.expression) || t.isJSXFragment(node.expression)) {
        return node.expression;
      }
    }
  }

  // Look in return statement
  const returnStmt = findJSXReturnStatement(ast);
  if (returnStmt?.argument) {
    if (t.isJSXElement(returnStmt.argument) || t.isJSXFragment(returnStmt.argument)) {
      return returnStmt.argument;
    }
    // Handle parenthesized JSX
    if (t.isParenthesizedExpression(returnStmt.argument)) {
      const expr = returnStmt.argument.expression;
      if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
        return expr;
      }
    }
  }

  // Check for arrow function with implicit return
  for (const node of ast.program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      const decl = node.declaration;
      if (t.isArrowFunctionExpression(decl)) {
        if (t.isJSXElement(decl.body) || t.isJSXFragment(decl.body)) {
          return decl.body;
        }
        if (t.isParenthesizedExpression(decl.body)) {
          const expr = decl.body.expression;
          if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
            return expr;
          }
        }
      }
    } else if (t.isVariableDeclaration(node)) {
      for (const decl of node.declarations) {
        if (t.isArrowFunctionExpression(decl.init)) {
          if (t.isJSXElement(decl.init.body) || t.isJSXFragment(decl.init.body)) {
            return decl.init.body;
          }
          if (t.isParenthesizedExpression(decl.init.body)) {
            const expr = decl.init.body.expression;
            if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
              return expr;
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Find a JSX element by its path (e.g., "0.1.2").
 * Path represents indices into children arrays.
 */
export function findElementByPath(ast: t.File, jsxPath: string): t.JSXElement | null {
  const root = getRootJSXElement(ast);
  if (root === null) return null;

  // Empty path means root element
  if (jsxPath === '' || jsxPath === 'root') {
    return t.isJSXElement(root) ? root : null;
  }

  const indices = jsxPath.split('.').map(Number);
  let current: t.JSXElement | t.JSXFragment = root;

  for (const index of indices) {
    const children = getJSXElementChildren(current);
    if (index < 0 || index >= children.length) {
      return null;
    }
    const child = children[index];
    if (child === undefined) return null;
    current = child;
  }

  return t.isJSXElement(current) ? current : null;
}

/**
 * Find the parent of an element by path.
 */
export function findParentByPath(
  ast: t.File,
  jsxPath: string
): { parent: t.JSXElement | t.JSXFragment; childIndex: number } | null {
  const parts = jsxPath.split('.');
  if (parts.length === 0) return null;

  const childIndex = Number(parts[parts.length - 1]);

  const root = getRootJSXElement(ast);
  if (root === null) return null;

  // If only one index, parent is root
  if (parts.length === 1) {
    return { parent: root, childIndex };
  }

  // Find parent element
  let current: t.JSXElement | t.JSXFragment = root;
  const parentIndices = parts.slice(0, -1).map(Number);

  for (const index of parentIndices) {
    const children = getJSXElementChildren(current);
    if (index < 0 || index >= children.length) {
      return null;
    }
    const child = children[index];
    if (child === undefined) return null;
    current = child;
  }

  return { parent: current, childIndex };
}

// =============================================================================
// STRUCTURAL OPERATIONS
// =============================================================================

/**
 * Reorder a JSX element within its parent.
 * Moves the element at `fromIndex` to `toIndex`.
 */
export function reorderJSXChildren(
  code: string,
  parentPath: string,
  fromIndex: number,
  toIndex: number
): ReorderResult {
  try {
    if (fromIndex === toIndex) {
      return { success: true, code };
    }

    const ast = parseJSXCode(code);
    const root = getRootJSXElement(ast);
    if (root === null) {
      return { success: false, code, error: 'No JSX root found' };
    }

    // Find parent element
    let parent: t.JSXElement | t.JSXFragment;
    if (parentPath === '' || parentPath === 'root') {
      parent = root;
    } else {
      const found = findElementByPath(ast, parentPath);
      if (found === null) {
        return { success: false, code, error: `Parent not found at path: ${parentPath}` };
      }
      parent = found;
    }

    // Get element children (excluding whitespace text)
    const elementChildren = getJSXElementChildren(parent);
    if (fromIndex < 0 || fromIndex >= elementChildren.length) {
      return { success: false, code, error: `Invalid fromIndex: ${String(fromIndex)}` };
    }
    if (toIndex < 0 || toIndex >= elementChildren.length) {
      return { success: false, code, error: `Invalid toIndex: ${String(toIndex)}` };
    }

    // Find actual indices in parent.children (which includes text nodes)
    const fromChild = elementChildren[fromIndex];
    const toChild = elementChildren[toIndex];
    if (fromChild === undefined || toChild === undefined) {
      return { success: false, code, error: 'Child element not found' };
    }

    const fromActualIndex = parent.children.indexOf(fromChild as JSXChild);
    const toActualIndex = parent.children.indexOf(toChild as JSXChild);

    if (fromActualIndex === -1 || toActualIndex === -1) {
      return { success: false, code, error: 'Could not find child in parent' };
    }

    // Remove and reinsert
    const [removed] = parent.children.splice(fromActualIndex, 1);
    if (removed === undefined) {
      return { success: false, code, error: 'Failed to remove element' };
    }

    // Adjust insertion index if needed
    const insertIndex = fromActualIndex < toActualIndex ? toActualIndex : toActualIndex;
    parent.children.splice(insertIndex, 0, removed);

    return { success: true, code: generateCode(ast) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}

/**
 * Move an element up (swap with previous sibling).
 */
export function moveElementUp(code: string, jsxPath: string): ReorderResult {
  const parts = jsxPath.split('.');
  if (parts.length === 0) {
    return { success: false, code, error: 'Invalid path' };
  }

  const currentIndex = Number(parts[parts.length - 1]);
  if (currentIndex === 0) {
    return { success: false, code, error: 'Already at first position' };
  }

  const parentPath = parts.slice(0, -1).join('.') || 'root';
  return reorderJSXChildren(code, parentPath, currentIndex, currentIndex - 1);
}

/**
 * Move an element down (swap with next sibling).
 */
export function moveElementDown(code: string, jsxPath: string): ReorderResult {
  const parts = jsxPath.split('.');
  if (parts.length === 0) {
    return { success: false, code, error: 'Invalid path' };
  }

  const currentIndex = Number(parts[parts.length - 1]);
  const parentPath = parts.slice(0, -1).join('.') || 'root';

  // Need to check if we're at the last position
  try {
    const ast = parseJSXCode(code);
    const root = getRootJSXElement(ast);
    if (root === null) {
      return { success: false, code, error: 'No JSX root found' };
    }

    let parent: t.JSXElement | t.JSXFragment;
    if (parentPath === '' || parentPath === 'root') {
      parent = root;
    } else {
      const found = findElementByPath(ast, parentPath);
      if (found === null) {
        return { success: false, code, error: 'Parent not found' };
      }
      parent = found;
    }

    const elementChildren = getJSXElementChildren(parent);
    if (currentIndex >= elementChildren.length - 1) {
      return { success: false, code, error: 'Already at last position' };
    }

    return reorderJSXChildren(code, parentPath, currentIndex, currentIndex + 1);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}

/**
 * Remove a JSX element from its parent.
 */
export function removeJSXElement(code: string, jsxPath: string): RemoveElementResult {
  try {
    const ast = parseJSXCode(code);
    const result = findParentByPath(ast, jsxPath);
    if (result === null) {
      return { success: false, code, error: 'Element not found' };
    }

    const { parent, childIndex } = result;
    const elementChildren = getJSXElementChildren(parent);
    const child = elementChildren[childIndex];
    if (child === undefined) {
      return { success: false, code, error: 'Child not found' };
    }

    const actualIndex = parent.children.indexOf(child as JSXChild);
    if (actualIndex === -1) {
      return { success: false, code, error: 'Child not in parent' };
    }

    parent.children.splice(actualIndex, 1);
    return { success: true, code: generateCode(ast) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}

/**
 * Add a new JSX element as a child.
 */
export function addJSXElement(
  code: string,
  parentPath: string,
  position: 'first' | 'last' | number,
  elementCode: string
): AddElementResult {
  try {
    const ast = parseJSXCode(code);
    const root = getRootJSXElement(ast);
    if (root === null) {
      return { success: false, code, error: 'No JSX root found' };
    }

    // Find parent element
    let parent: t.JSXElement | t.JSXFragment;
    if (parentPath === '' || parentPath === 'root') {
      parent = root;
    } else {
      const found = findElementByPath(ast, parentPath);
      if (found === null) {
        return { success: false, code, error: 'Parent not found' };
      }
      parent = found;
    }

    // Parse the new element
    const newAst = parseJSXCode(elementCode);
    const newRoot = getRootJSXElement(newAst);
    if (newRoot === null || !t.isJSXElement(newRoot)) {
      return { success: false, code, error: 'Invalid element code' };
    }

    const elementChildren = getJSXElementChildren(parent);
    let insertIndex: number;

    if (position === 'first') {
      insertIndex = 0;
    } else if (position === 'last') {
      insertIndex = parent.children.length;
    } else {
      // Find actual index for the logical position
      if (position >= elementChildren.length) {
        insertIndex = parent.children.length;
      } else {
        const refChild = elementChildren[position];
        insertIndex =
          refChild !== undefined
            ? parent.children.indexOf(refChild as JSXChild)
            : parent.children.length;
      }
    }

    parent.children.splice(insertIndex, 0, newRoot);

    const newPath =
      parentPath === '' || parentPath === 'root'
        ? String(position === 'first' ? 0 : position === 'last' ? elementChildren.length : position)
        : `${parentPath}.${String(position === 'first' ? 0 : position === 'last' ? elementChildren.length : position)}`;

    return { success: true, code: generateCode(ast), newElementPath: newPath };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}

/**
 * Duplicate a JSX element (insert copy after it).
 */
export function duplicateJSXElement(code: string, jsxPath: string): AddElementResult {
  try {
    const ast = parseJSXCode(code);
    const element = findElementByPath(ast, jsxPath);
    if (element === null) {
      return { success: false, code, error: 'Element not found' };
    }

    const result = findParentByPath(ast, jsxPath);
    if (result === null) {
      return { success: false, code, error: 'Parent not found' };
    }

    const { parent, childIndex } = result;
    const actualIndex = parent.children.indexOf(element as JSXChild);
    if (actualIndex === -1) {
      return { success: false, code, error: 'Element not in parent' };
    }

    // Deep clone the element
    const cloned = t.cloneNode(element, true);
    parent.children.splice(actualIndex + 1, 0, cloned);

    const parts = jsxPath.split('.');
    parts[parts.length - 1] = String(childIndex + 1);
    const newPath = parts.join('.');

    return { success: true, code: generateCode(ast), newElementPath: newPath };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}

/**
 * Get information about an element's position.
 */
export function getElementInfo(
  code: string,
  jsxPath: string
): { isFirst: boolean; isLast: boolean; siblingCount: number } | null {
  try {
    const ast = parseJSXCode(code);
    const parts = jsxPath.split('.');
    const currentIndex = Number(parts[parts.length - 1]);
    const parentPath = parts.slice(0, -1).join('.') || 'root';

    const root = getRootJSXElement(ast);
    if (root === null) return null;

    let parent: t.JSXElement | t.JSXFragment;
    if (parentPath === '' || parentPath === 'root') {
      parent = root;
    } else {
      const found = findElementByPath(ast, parentPath);
      if (found === null) return null;
      parent = found;
    }

    const elementChildren = getJSXElementChildren(parent);
    return {
      isFirst: currentIndex === 0,
      isLast: currentIndex === elementChildren.length - 1,
      siblingCount: elementChildren.length,
    };
  } catch {
    return null;
  }
}

export interface WrapElementResult {
  success: boolean;
  code: string;
  /** Path to the new wrapper element */
  wrapperPath?: string;
  error?: string;
}

/**
 * Wrap a JSX element in a container element.
 * The wrapper replaces the element at its current position,
 * with the original element becoming a child of the wrapper.
 */
export function wrapJSXElement(
  code: string,
  jsxPath: string,
  wrapperTag = 'div',
  wrapperClassName = ''
): WrapElementResult {
  try {
    const ast = parseJSXCode(code);
    const element = findElementByPath(ast, jsxPath);
    if (element === null) {
      return { success: false, code, error: 'Element not found' };
    }

    const parentResult = findParentByPath(ast, jsxPath);
    if (parentResult === null) {
      return { success: false, code, error: 'Parent not found' };
    }

    const { parent } = parentResult;
    const actualIndex = parent.children.indexOf(element as JSXChild);
    if (actualIndex === -1) {
      return { success: false, code, error: 'Element not in parent' };
    }

    // Build wrapper attributes
    const attributes: t.JSXAttribute[] = [];
    if (wrapperClassName) {
      attributes.push(
        t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(wrapperClassName))
      );
    }

    // Create wrapper element with the original element as child
    const wrapper = t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier(wrapperTag), attributes, false),
      t.jsxClosingElement(t.jsxIdentifier(wrapperTag)),
      [element],
      false
    );

    // Replace original element with wrapper
    parent.children.splice(actualIndex, 1, wrapper);

    // The wrapper is now at the same path as the original element
    // The original element is at path + ".0"
    return {
      success: true,
      code: generateCode(ast),
      wrapperPath: jsxPath,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, code, error: errorMsg };
  }
}
