import { describe, it, expect } from 'vitest';

import {
  parseJSXCode,
  findElementByPath,
  findParentByPath,
  moveElementUp,
  moveElementDown,
  duplicateJSXElement,
  removeJSXElement,
  addJSXElement,
  wrapJSXElement,
  getElementInfo,
  reorderJSXChildren,
} from './jsxTransformer';

// Sample JSX code for testing (using arrow functions which are supported by the parser)
const sampleComponent = `
const Card = () => {
  return (
    <div className="card">
      <h1>Title</h1>
      <p>Description</p>
      <button>Click me</button>
    </div>
  );
};
`;

const nestedComponent = `
const Layout = () => {
  return (
    <div className="container">
      <header>
        <h1>Logo</h1>
        <nav>Menu</nav>
      </header>
      <main>
        <section>Content</section>
      </main>
    </div>
  );
};
`;

describe('jsxTransformer', () => {
  describe('parseJSXCode', () => {
    it('should parse valid JSX code without throwing', () => {
      expect(() => parseJSXCode(sampleComponent)).not.toThrow();
    });

    it('should handle arrow function components', () => {
      const arrowComponent = `const Card = () => <div>Content</div>;`;
      expect(() => parseJSXCode(arrowComponent)).not.toThrow();
    });
  });

  describe('findElementByPath', () => {
    it('should find first child element at path "0"', () => {
      // Path "0" = first child of root div = h1
      const ast = parseJSXCode(sampleComponent);
      const element = findElementByPath(ast, '0');
      expect(element).not.toBeNull();
    });

    it('should find second child at path "1"', () => {
      // Path "1" = second child of root div = p
      const ast = parseJSXCode(sampleComponent);
      const element = findElementByPath(ast, '1');
      expect(element).not.toBeNull();
    });

    it('should return null for invalid path', () => {
      const ast = parseJSXCode(sampleComponent);
      const element = findElementByPath(ast, '99.99');
      expect(element).toBeNull();
    });
  });

  describe('findParentByPath', () => {
    it('should find parent of first child', () => {
      // Path "0" = first child, parent is root div
      const ast = parseJSXCode(sampleComponent);
      const result = findParentByPath(ast, '0');
      expect(result).not.toBeNull();
      expect(result?.childIndex).toBe(0);
    });

    it('should find parent with correct child index', () => {
      // Path "2" = third child (button), parent is root div
      const ast = parseJSXCode(sampleComponent);
      const result = findParentByPath(ast, '2');
      expect(result).not.toBeNull();
      expect(result?.childIndex).toBe(2);
    });
  });

  describe('moveElementUp', () => {
    it('should move second child to first position', () => {
      // Path "1" = p element, move up to swap with h1
      const result = moveElementUp(sampleComponent, '1');
      expect(result.success).toBe(true);
      expect(result.code).toContain('<p>Description</p>');
      // Check that p comes before h1 in the output
      const pIndex = result.code.indexOf('<p>');
      const h1Index = result.code.indexOf('<h1>');
      expect(pIndex).toBeLessThan(h1Index);
    });

    it('should fail when already at first position', () => {
      // Path "0" = h1, already first
      const result = moveElementUp(sampleComponent, '0');
      expect(result.success).toBe(false);
      expect(result.error).toContain('first position');
    });
  });

  describe('moveElementDown', () => {
    it('should move first child to second position', () => {
      // Path "0" = h1, move down to swap with p
      const result = moveElementDown(sampleComponent, '0');
      expect(result.success).toBe(true);
      // Check that p comes before h1 in the output
      const pIndex = result.code.indexOf('<p>');
      const h1Index = result.code.indexOf('<h1>');
      expect(pIndex).toBeLessThan(h1Index);
    });

    it('should fail when already at last position', () => {
      // Path "2" = button, already last
      const result = moveElementDown(sampleComponent, '2');
      expect(result.success).toBe(false);
      expect(result.error).toContain('last position');
    });
  });

  describe('duplicateJSXElement', () => {
    it('should create a copy of the element', () => {
      // Path "0" = h1
      const result = duplicateJSXElement(sampleComponent, '0');
      expect(result.success).toBe(true);
      // Should have two h1 elements now
      const h1Count = (result.code.match(/<h1>/g) ?? []).length;
      expect(h1Count).toBe(2);
    });

    it('should return new element path', () => {
      // Path "0" = h1, after duplicate, new path should be "1"
      const result = duplicateJSXElement(sampleComponent, '0');
      expect(result.success).toBe(true);
      expect(result.newElementPath).toBe('1');
    });
  });

  describe('removeJSXElement', () => {
    it('should remove the specified element', () => {
      // Path "0" = h1
      const result = removeJSXElement(sampleComponent, '0');
      expect(result.success).toBe(true);
      expect(result.code).not.toContain('<h1>');
    });

    it('should preserve other elements', () => {
      // Path "0" = h1, remove it
      const result = removeJSXElement(sampleComponent, '0');
      expect(result.success).toBe(true);
      expect(result.code).toContain('<p>');
      expect(result.code).toContain('<button>');
    });
  });

  describe('addJSXElement', () => {
    it('should add element at first position', () => {
      const newElement = '<span>New</span>';
      // Add to root container at first position
      const result = addJSXElement(sampleComponent, 'root', 'first', newElement);
      expect(result.success).toBe(true);
      expect(result.code).toContain('<span>New</span>');
      // span should come before h1
      const spanIndex = result.code.indexOf('<span>');
      const h1Index = result.code.indexOf('<h1>');
      expect(spanIndex).toBeLessThan(h1Index);
    });

    it('should add element at last position', () => {
      const newElement = '<footer>Footer</footer>';
      // Add to root container at last position
      const result = addJSXElement(sampleComponent, 'root', 'last', newElement);
      expect(result.success).toBe(true);
      expect(result.code).toContain('<footer>Footer</footer>');
      // footer should come after button
      const footerIndex = result.code.indexOf('<footer>');
      const buttonIndex = result.code.indexOf('<button>');
      expect(footerIndex).toBeGreaterThan(buttonIndex);
    });

    it('should add element at specific index', () => {
      const newElement = '<span>Inserted</span>';
      // Add to root container at index 1 (between h1 and p)
      const result = addJSXElement(sampleComponent, 'root', 1, newElement);
      expect(result.success).toBe(true);
      expect(result.code).toContain('<span>Inserted</span>');
    });

    it('should return new element path', () => {
      const newElement = '<span>New</span>';
      // Add at index 1
      const result = addJSXElement(sampleComponent, 'root', 1, newElement);
      expect(result.success).toBe(true);
      expect(result.newElementPath).toBe('1');
    });
  });

  describe('wrapJSXElement', () => {
    it('should wrap element in a div', () => {
      // Path "0" = h1, wrap it
      const result = wrapJSXElement(sampleComponent, '0');
      expect(result.success).toBe(true);
      // Should have a wrapper div containing h1
      expect(result.code).toContain('<div>');
      expect(result.code).toContain('<h1>Title</h1>');
    });

    it('should add className to wrapper', () => {
      // Path "0" = h1
      const result = wrapJSXElement(sampleComponent, '0', 'div', 'wrapper-class');
      expect(result.success).toBe(true);
      expect(result.code).toContain('className="wrapper-class"');
    });

    it('should use custom tag name', () => {
      // Path "0" = h1
      const result = wrapJSXElement(sampleComponent, '0', 'section', '');
      expect(result.success).toBe(true);
      expect(result.code).toContain('<section>');
    });

    it('should return wrapper path same as original element path', () => {
      // Path "1" = p
      const result = wrapJSXElement(sampleComponent, '1');
      expect(result.success).toBe(true);
      expect(result.wrapperPath).toBe('1');
    });
  });

  describe('getElementInfo', () => {
    it('should report first element correctly', () => {
      // Path "0" = h1 (first child)
      const info = getElementInfo(sampleComponent, '0');
      expect(info).not.toBeNull();
      expect(info?.isFirst).toBe(true);
      expect(info?.isLast).toBe(false);
    });

    it('should report last element correctly', () => {
      // Path "2" = button (last child)
      const info = getElementInfo(sampleComponent, '2');
      expect(info).not.toBeNull();
      expect(info?.isFirst).toBe(false);
      expect(info?.isLast).toBe(true);
    });

    it('should report sibling count', () => {
      // Path "0" = h1, has 2 siblings (p and button), so total 3
      const info = getElementInfo(sampleComponent, '0');
      expect(info).not.toBeNull();
      expect(info?.siblingCount).toBe(3);
    });

    it('should return null for invalid path', () => {
      const info = getElementInfo(sampleComponent, '99.99');
      expect(info).toBeNull();
    });
  });

  describe('reorderJSXChildren', () => {
    it('should swap two children', () => {
      // Swap child 0 (h1) with child 2 (button) in root
      const result = reorderJSXChildren(sampleComponent, 'root', 0, 2);
      expect(result.success).toBe(true);
      // button should now be first
      const buttonIndex = result.code.indexOf('<button>');
      const h1Index = result.code.indexOf('<h1>');
      expect(buttonIndex).toBeLessThan(h1Index);
    });

    it('should return same code when indices are equal', () => {
      const result = reorderJSXChildren(sampleComponent, 'root', 1, 1);
      expect(result.success).toBe(true);
      expect(result.code).toBe(sampleComponent);
    });
  });

  describe('nested elements', () => {
    it('should find deeply nested elements', () => {
      const ast = parseJSXCode(nestedComponent);
      // Path "0" = header, Path "0.1" = nav (second child of header)
      const element = findElementByPath(ast, '0.1');
      expect(element).not.toBeNull();
    });

    it('should move nested elements', () => {
      // Path "0.1" = nav (inside header), move up to swap with h1
      const result = moveElementUp(nestedComponent, '0.1');
      expect(result.success).toBe(true);
      // nav should come before h1 inside header
      const navIndex = result.code.indexOf('<nav>');
      const h1Index = result.code.indexOf('<h1>Logo</h1>');
      expect(navIndex).toBeLessThan(h1Index);
    });
  });
});
