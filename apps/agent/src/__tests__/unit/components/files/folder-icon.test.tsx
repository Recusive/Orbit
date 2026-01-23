/**
 * FolderIcon Component Tests - Specification-First Approach
 *
 * These tests verify the EXPECTED BEHAVIOR of FolderIcon, not its implementation.
 * Tests are written based on what users expect, then we check if code matches.
 *
 * Expected behaviors:
 * 1. Open and closed folders must look visually different
 * 2. Special folders (src, node_modules, .github) should have distinct icons
 * 3. Symlinked folders must be visually distinguishable
 * 4. Theme changes should update which icon set is used
 * 5. Unknown folders get a recognizable fallback
 * 6. Monochrome mode should work with dark theme inversion
 *
 * @see folder-icon.tsx - Component implementation
 */

import { render } from '@testing-library/react';

import { FolderIcon } from '@/components/files/folder-icon';
import { useIconThemeStore } from '@/stores/ui/icon-theme-store';

// =============================================================================
// Mock Setup (vi.mock is hoisted by Vitest, runs before imports)
// =============================================================================

const { mockResolveFolderIconUrl, mockHasIconUrl } = vi.hoisted(() => ({
  mockResolveFolderIconUrl: vi.fn<[string, boolean, string?], string>(),
  mockHasIconUrl: vi.fn<[string], boolean>(),
}));

vi.mock('@/lib/icons', () => ({
  resolveFolderIconUrl: mockResolveFolderIconUrl,
  hasIconUrl: mockHasIconUrl,
}));

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Helper to get the rendered icon element (img or svg)
 * Returns the element with type information for assertions
 */
function getRenderedIcon(container: HTMLElement): {
  type: 'img' | 'svg' | 'none';
  element: Element | null;
  src?: string | undefined;
} {
  const img = container.querySelector('img');
  if (img) {
    return { type: 'img', element: img, src: img.getAttribute('src') ?? undefined } as const;
  }
  const svg = container.querySelector('svg');
  if (svg) {
    return { type: 'svg', element: svg };
  }
  return { type: 'none', element: null };
}

/**
 * Helper to get element and assert it exists (for tests where we expect it)
 */
function getIconElement(container: HTMLElement): Element {
  const icon = getRenderedIcon(container);
  if (!icon.element) {
    throw new Error('Expected icon element to exist');
  }
  return icon.element;
}

/**
 * Helper to get SVG element and assert it exists
 */
function getSvgElement(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (!svg) {
    throw new Error('Expected SVG element to exist');
  }
  return svg;
}

/**
 * Helper to get src from rendered icon and assert it exists
 */
function getIconSrc(container: HTMLElement): string {
  const icon = getRenderedIcon(container);
  if (!icon.src) {
    throw new Error('Expected icon src to exist');
  }
  return icon.src;
}

// =============================================================================
// Test Setup
// =============================================================================

describe('FolderIcon', () => {
  beforeEach(() => {
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
    vi.clearAllMocks();
  });

  // ===========================================================================
  // SPEC: Open and closed folders must look different
  // ===========================================================================

  describe('SPEC: Open and closed folders must be visually distinct', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockImplementation((folderName: string, isOpen: boolean) => {
        const base = folderName === 'src' ? 'src' : 'folder';
        return isOpen ? `/icons/${base}-open.svg` : `/icons/${base}-closed.svg`;
      });
      mockHasIconUrl.mockReturnValue(true);
    });

    it('closed folder should have different icon than open folder', () => {
      const { container: closed } = render(<FolderIcon folderName="myFolder" isOpen={false} />);
      const { container: open } = render(<FolderIcon folderName="myFolder" isOpen={true} />);

      const closedIcon = getRenderedIcon(closed);
      const openIcon = getRenderedIcon(open);

      // Different icons for different states
      expect(closedIcon.src).not.toBe(openIcon.src);
    });

    it('same folder toggled open/closed should change icon', () => {
      const { container, rerender } = render(<FolderIcon folderName="src" isOpen={false} />);

      const closedSrc = getRenderedIcon(container).src;

      rerender(<FolderIcon folderName="src" isOpen={true} />);

      const openSrc = getRenderedIcon(container).src;

      expect(closedSrc).toContain('closed');
      expect(openSrc).toContain('open');
      expect(closedSrc).not.toBe(openSrc);
    });

    it('folder should default to closed state when isOpen not provided', () => {
      render(<FolderIcon folderName="myFolder" />);

      // Should request closed icon by default
      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('myFolder', false, expect.any(String));
    });

    it('open/closed state should work with fallback SVG too', () => {
      mockHasIconUrl.mockReturnValue(false); // Force fallback

      const { container: closed } = render(<FolderIcon folderName="unknown" isOpen={false} />);
      const { container: open } = render(<FolderIcon folderName="unknown" isOpen={true} />);

      const closedSvg = getSvgElement(closed);
      const openSvg = getSvgElement(open);

      // Fallback SVGs should be different for open vs closed
      // (compare path count or path data)
      const closedPaths = closedSvg.querySelectorAll('path').length;
      const openPaths = openSvg.querySelectorAll('path').length;

      expect(closedPaths).not.toBe(openPaths);
    });
  });

  // ===========================================================================
  // SPEC: Special folders should have distinct icons
  // ===========================================================================

  describe('SPEC: Special folders should have recognizable icons', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockImplementation((folderName: string, isOpen: boolean) => {
        const suffix = isOpen ? '-open' : '';
        switch (folderName.toLowerCase()) {
          case 'src':
            return `/icons/folder-src${suffix}.svg`;
          case 'node_modules':
            return `/icons/folder-node${suffix}.svg`;
          case '.github':
            return `/icons/folder-github${suffix}.svg`;
          case 'test':
          case 'tests':
          case '__tests__':
            return `/icons/folder-test${suffix}.svg`;
          default:
            return `/icons/folder${suffix}.svg`;
        }
      });
      mockHasIconUrl.mockReturnValue(true);
    });

    it('src folder should get src-specific icon', () => {
      const { container } = render(<FolderIcon folderName="src" />);

      expect(getRenderedIcon(container).src).toContain('folder-src');
    });

    it('node_modules folder should get node-specific icon', () => {
      const { container } = render(<FolderIcon folderName="node_modules" />);

      expect(getRenderedIcon(container).src).toContain('folder-node');
    });

    it('.github folder should get github-specific icon', () => {
      const { container } = render(<FolderIcon folderName=".github" />);

      expect(getRenderedIcon(container).src).toContain('folder-github');
    });

    it('test folders should get test-specific icon', () => {
      const { container: test } = render(<FolderIcon folderName="test" />);
      const { container: tests } = render(<FolderIcon folderName="tests" />);
      const { container: dunderTests } = render(<FolderIcon folderName="__tests__" />);

      expect(getRenderedIcon(test).src).toContain('folder-test');
      expect(getRenderedIcon(tests).src).toContain('folder-test');
      expect(getRenderedIcon(dunderTests).src).toContain('folder-test');
    });

    it('unknown folder should get generic folder icon', () => {
      const { container } = render(<FolderIcon folderName="random-folder-name" />);

      const src = getIconSrc(container);
      expect(src).toContain('folder');
      expect(src).not.toContain('folder-src');
      expect(src).not.toContain('folder-node');
    });

    it('icon resolver should receive folder name to determine icon', () => {
      render(<FolderIcon folderName="components" isOpen={true} />);

      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('components', true, expect.any(String));
    });
  });

  // ===========================================================================
  // SPEC: Symlinked folders must be visually distinguishable
  // ===========================================================================

  describe('SPEC: Symlinked folders must be visually distinguishable', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('symlinked folder should look different from regular folder', () => {
      const { container: regular } = render(<FolderIcon folderName="src" isSymlink={false} />);
      const { container: symlink } = render(<FolderIcon folderName="src" isSymlink={true} />);

      const regularIcon = getIconElement(regular);
      const symlinkIcon = getIconElement(symlink);

      expect(symlinkIcon.className).not.toBe(regularIcon.className);
    });

    it('symlink should have reduced opacity (visual indication)', () => {
      const { container } = render(<FolderIcon folderName="linked-folder" isSymlink={true} />);

      const icon = getIconElement(container);

      // Should have some form of opacity reduction
      expect(icon.className).toMatch(/opacity-\d+/);
    });

    it('non-symlink folders should NOT have reduced opacity', () => {
      const { container } = render(<FolderIcon folderName="regular" isSymlink={false} />);

      const icon = getIconElement(container);

      expect(icon).not.toHaveClass('opacity-60');
    });

    it('symlink distinction should work with fallback SVG', () => {
      mockHasIconUrl.mockReturnValue(false);

      const { container: regular } = render(<FolderIcon folderName="unknown" isSymlink={false} />);
      const { container: symlink } = render(<FolderIcon folderName="unknown" isSymlink={true} />);

      const regularSvg = getIconElement(regular);
      const symlinkSvg = getIconElement(symlink);

      expect(symlinkSvg.className).not.toBe(regularSvg.className);
    });
  });

  // ===========================================================================
  // SPEC: Theme changes should update icon source
  // ===========================================================================

  describe('SPEC: Theme changes should update which icon is used', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockImplementation(
        (_folderName: string, _isOpen: boolean, themeId?: string) => {
          return themeId === 'material' ? '/icons/material/folder.svg' : '/icons/none/folder.svg';
        }
      );
      mockHasIconUrl.mockReturnValue(true);
    });

    it('icon URL should include theme identifier', () => {
      render(<FolderIcon folderName="src" />);

      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('src', false, 'material');
    });

    it('changing theme should request icon from new theme', () => {
      const { rerender } = render(<FolderIcon folderName="src" />);

      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('src', false, 'material');

      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      rerender(<FolderIcon folderName="src" />);

      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('src', false, 'none');
    });

    it('icon src should actually change when theme changes', () => {
      const { container, rerender } = render(<FolderIcon folderName="src" />);

      const initialSrc = getRenderedIcon(container).src;

      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      rerender(<FolderIcon folderName="src" />);

      const newSrc = getRenderedIcon(container).src;
      expect(newSrc).not.toBe(initialSrc);
    });
  });

  // ===========================================================================
  // SPEC: Unknown folders get a recognizable fallback
  // ===========================================================================

  describe('SPEC: Unknown folders should get a recognizable fallback', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('');
      mockHasIconUrl.mockReturnValue(false);
    });

    it('unknown folder should render a fallback icon, not nothing', () => {
      const { container } = render(<FolderIcon folderName="xyz-unknown-folder" />);

      const icon = getRenderedIcon(container);

      expect(icon.type).not.toBe('none');
      expect(icon.element).toBeInTheDocument();
    });

    it('empty folder name should not crash, should show fallback', () => {
      const { container } = render(<FolderIcon folderName="" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('fallback should be an inline SVG (not broken image)', () => {
      const { container } = render(<FolderIcon folderName="unknown" />);

      expect(getRenderedIcon(container).type).toBe('svg');
    });

    it('fallback SVG should have proper viewBox for scaling', () => {
      const { container } = render(<FolderIcon folderName="unknown" />);

      const svg = getSvgElement(container);
      expect(svg).toHaveAttribute('viewBox');
    });
  });

  // ===========================================================================
  // SPEC: Monochrome mode for dark theme compatibility
  // ===========================================================================

  describe('SPEC: Monochrome mode should support dark theme inversion', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('monochrome=true with invert theme should apply dark mode inversion', () => {
      useIconThemeStore.setState({
        currentTheme: 'material',
        currentThemeDarkMode: 'invert',
      });

      const { container } = render(<FolderIcon folderName="src" monochrome={true} />);

      const icon = getIconElement(container);
      expect(icon).toHaveClass('dark:invert');
    });

    it('monochrome=true with non-invert theme should NOT apply inversion', () => {
      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      const { container } = render(<FolderIcon folderName="src" monochrome={true} />);

      const icon = getIconElement(container);
      expect(icon).not.toHaveClass('dark:invert');
    });

    it('monochrome=false should never apply inversion', () => {
      useIconThemeStore.setState({
        currentTheme: 'material',
        currentThemeDarkMode: 'invert',
      });

      const { container } = render(<FolderIcon folderName="src" monochrome={false} />);

      const icon = getIconElement(container);
      expect(icon).not.toHaveClass('dark:invert');
    });
  });

  // ===========================================================================
  // EDGE CASES: Things that could break
  // ===========================================================================

  describe('EDGE CASES: Potential failure scenarios', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('folder name with spaces should not break', () => {
      const { container } = render(<FolderIcon folderName="My Folder" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
      expect(mockResolveFolderIconUrl).toHaveBeenCalledWith('My Folder', false, expect.any(String));
    });

    it('folder name with special characters should not break', () => {
      const { container } = render(<FolderIcon folderName="@types" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('folder name starting with dot should work', () => {
      const { container } = render(<FolderIcon folderName=".hidden" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('very long folder name should not break layout', () => {
      const longName = 'a'.repeat(200);
      const { container } = render(<FolderIcon folderName={longName} />);

      const icon = getIconElement(container);
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('shrink-0');
    });

    it('rapid open/close toggling should not break', () => {
      const { container, rerender } = render(<FolderIcon folderName="src" isOpen={false} />);

      // Toggle rapidly
      for (let i = 0; i < 10; i++) {
        rerender(<FolderIcon folderName="src" isOpen={i % 2 === 0} />);
      }

      // Should still render correctly
      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('unicode folder names should work', () => {
      const { container } = render(<FolderIcon folderName="文件夹" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ACCESSIBILITY: Must not break screen readers
  // ===========================================================================

  describe('ACCESSIBILITY: Screen reader compatibility', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('icon should be decorative (empty alt)', () => {
      const { container } = render(<FolderIcon folderName="src" />);

      const img = container.querySelector('img');
      if (img) {
        expect(img).toHaveAttribute('alt', '');
      }
    });

    it('icon should not be draggable', () => {
      const { container } = render(<FolderIcon folderName="src" />);

      const img = container.querySelector('img');
      if (img) {
        expect(img).toHaveAttribute('draggable', 'false');
      }
    });
  });

  // ===========================================================================
  // INTEGRATION: Custom className passthrough
  // ===========================================================================

  describe('INTEGRATION: Custom styling support', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('custom className should be applied', () => {
      const { container } = render(<FolderIcon folderName="src" className="w-6 h-6" />);

      const icon = getIconElement(container);
      expect(icon).toHaveClass('w-6');
      expect(icon).toHaveClass('h-6');
    });

    it('custom className should work with fallback SVG', () => {
      mockHasIconUrl.mockReturnValue(false);

      const { container } = render(<FolderIcon folderName="unknown" className="w-8 h-8" />);

      const icon = getIconElement(container);
      expect(icon).toHaveClass('w-8');
      expect(icon).toHaveClass('h-8');
    });
  });

  // ===========================================================================
  // DESIGN QUESTION: Combined symlink + monochrome behavior
  // ===========================================================================

  describe('DESIGN QUESTION: Combined prop behavior', () => {
    beforeEach(() => {
      mockResolveFolderIconUrl.mockReturnValue('/icons/folder.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    /**
     * When a folder is both a symlink AND monochrome, what should happen?
     *
     * Option A: Both opacities apply (visually very faded)
     * Option B: Symlink opacity takes precedence (current behavior)
     * Option C: They should never be combined (throw error?)
     *
     * This test documents the CURRENT behavior, but raises the question:
     * Is this the INTENDED behavior?
     */
    it('symlink + monochrome: documents current behavior (symlink wins)', () => {
      const { container } = render(
        <FolderIcon folderName="src" isSymlink={true} monochrome={true} />
      );

      const icon = getIconElement(container);

      // Current behavior: symlink's opacity-60 wins over monochrome's opacity-80
      // because tailwind-merge deduplicates, keeping the last class
      expect(icon).toHaveClass('opacity-60');

      // Note: This test DOCUMENTS behavior but doesn't assert it's CORRECT
      // A UX review might decide symlinks should be even more faded when monochrome
    });

    it('all props combined should not crash', () => {
      const { container } = render(
        <FolderIcon
          folderName="src"
          isOpen={true}
          isSymlink={true}
          monochrome={true}
          className="custom-class"
        />
      );

      const icon = getIconElement(container);

      // Should render without crashing
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('custom-class');
      expect(icon).toHaveClass('dark:invert'); // monochrome + invert theme
    });
  });
});
