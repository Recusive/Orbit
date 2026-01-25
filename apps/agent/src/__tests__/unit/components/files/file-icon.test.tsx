/**
 * FileIcon Component Tests - Specification-First Approach
 *
 * These tests verify the EXPECTED BEHAVIOR of FileIcon, not its implementation.
 * Tests are written based on what users expect, then we check if code matches.
 *
 * Expected behaviors:
 * 1. Display correct icon for known file types (by extension or exact name)
 * 2. Symlinks must be visually distinguishable from regular files
 * 3. Unknown files get a recognizable fallback (not broken/missing)
 * 4. Theme changes should update which icon set is used
 * 5. Monochrome mode should work with dark theme inversion
 *
 * @see file-icon.tsx - Component implementation
 */

import { render } from '@testing-library/react';

import { FileIcon } from '@/components/files/file-icon';
import { useIconThemeStore } from '@/stores/ui/icon-theme-store';

// =============================================================================
// Mock Setup (vi.mock is hoisted by Vitest, runs before imports)
// =============================================================================

const { mockResolveFileIconUrl, mockHasIconUrl } = vi.hoisted(() => ({
  mockResolveFileIconUrl: vi.fn<[string, string?], string>(),
  mockHasIconUrl: vi.fn<[string], boolean>(),
}));

vi.unmock('@/components/files/file-icon');

vi.mock('@/lib/icons', () => ({
  resolveFileIconUrl: mockResolveFileIconUrl,
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

// =============================================================================
// Test Setup
// =============================================================================

describe('FileIcon', () => {
  beforeEach(() => {
    useIconThemeStore.setState({
      currentTheme: 'material',
      currentThemeDarkMode: 'invert',
    });
    vi.clearAllMocks();
  });

  // ===========================================================================
  // SPEC: Correct icon for known file types
  // ===========================================================================

  describe('SPEC: Should display correct icon for known file types', () => {
    beforeEach(() => {
      // Simulate icon loader returning different URLs for different file types
      mockResolveFileIconUrl.mockImplementation((fileName: string) => {
        if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
          return '/icons/typescript.svg';
        }
        if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
          return '/icons/javascript.svg';
        }
        if (fileName.endsWith('.json')) {
          return '/icons/json.svg';
        }
        if (fileName.endsWith('.md')) {
          return '/icons/markdown.svg';
        }
        if (fileName === 'Dockerfile' || fileName === 'dockerfile') {
          return '/icons/docker.svg';
        }
        return '/icons/default.svg';
      });
      mockHasIconUrl.mockReturnValue(true);
    });

    it('TypeScript files (.ts, .tsx) should get TypeScript icon', () => {
      const { container: ts } = render(<FileIcon fileName="app.ts" />);
      const { container: tsx } = render(<FileIcon fileName="Component.tsx" />);

      const tsIcon = getRenderedIcon(ts);
      const tsxIcon = getRenderedIcon(tsx);

      expect(tsIcon.src).toBe('/icons/typescript.svg');
      expect(tsxIcon.src).toBe('/icons/typescript.svg');
    });

    it('JavaScript files (.js, .jsx) should get JavaScript icon', () => {
      const { container: js } = render(<FileIcon fileName="index.js" />);
      const { container: jsx } = render(<FileIcon fileName="App.jsx" />);

      expect(getRenderedIcon(js).src).toBe('/icons/javascript.svg');
      expect(getRenderedIcon(jsx).src).toBe('/icons/javascript.svg');
    });

    it('different file types should get different icons', () => {
      const { container: ts } = render(<FileIcon fileName="app.ts" />);
      const { container: json } = render(<FileIcon fileName="package.json" />);
      const { container: md } = render(<FileIcon fileName="README.md" />);

      const tsIcon = getRenderedIcon(ts);
      const jsonIcon = getRenderedIcon(json);
      const mdIcon = getRenderedIcon(md);

      // Each file type should have a distinct icon
      expect(tsIcon.src).not.toBe(jsonIcon.src);
      expect(tsIcon.src).not.toBe(mdIcon.src);
      expect(jsonIcon.src).not.toBe(mdIcon.src);
    });

    it('exact filename matches should work (e.g., Dockerfile)', () => {
      const { container } = render(<FileIcon fileName="Dockerfile" />);

      expect(getRenderedIcon(container).src).toBe('/icons/docker.svg');
    });

    it('icon resolution should receive the full filename, not just extension', () => {
      render(<FileIcon fileName="my-component.test.tsx" />);

      // The resolver should receive full filename to handle compound extensions
      expect(mockResolveFileIconUrl).toHaveBeenCalledWith(
        'my-component.test.tsx',
        expect.any(String)
      );
    });
  });

  // ===========================================================================
  // SPEC: Symlinks must be visually distinguishable
  // ===========================================================================

  describe('SPEC: Symlinks must be visually distinguishable', () => {
    beforeEach(() => {
      mockResolveFileIconUrl.mockReturnValue('/icons/typescript.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('symlink file should look different from regular file', () => {
      const { container: regular } = render(<FileIcon fileName="app.ts" isSymlink={false} />);
      const { container: symlink } = render(<FileIcon fileName="app.ts" isSymlink={true} />);

      const regularIcon = getIconElement(regular);
      const symlinkIcon = getIconElement(symlink);

      // They should have different styling
      const regularClasses = regularIcon.className;
      const symlinkClasses = symlinkIcon.className;

      expect(symlinkClasses).not.toBe(regularClasses);
    });

    it('symlink should have reduced opacity (visual indication)', () => {
      const { container } = render(<FileIcon fileName="link.ts" isSymlink={true} />);

      const icon = getIconElement(container);

      // Symlinks should be visually muted - check for opacity class
      expect(icon.className).toMatch(/opacity-\d+/);
    });

    it('non-symlink files should NOT have reduced opacity', () => {
      const { container } = render(<FileIcon fileName="regular.ts" isSymlink={false} />);

      const icon = getIconElement(container);

      // Regular files should not have the symlink opacity
      expect(icon).not.toHaveClass('opacity-60');
    });

    it('symlink distinction should work even with fallback SVG', () => {
      mockHasIconUrl.mockReturnValue(false); // Force fallback

      const { container: regular } = render(<FileIcon fileName="unknown.xyz" isSymlink={false} />);
      const { container: symlink } = render(<FileIcon fileName="unknown.xyz" isSymlink={true} />);

      const regularIcon = getIconElement(regular);
      const symlinkIcon = getIconElement(symlink);

      // Both should be SVG fallbacks, but symlink should still look different
      expect(getRenderedIcon(regular).type).toBe('svg');
      expect(getRenderedIcon(symlink).type).toBe('svg');
      expect(symlinkIcon.className).not.toBe(regularIcon.className);
    });
  });

  // ===========================================================================
  // SPEC: Unknown files get a recognizable fallback
  // ===========================================================================

  describe('SPEC: Unknown files should get a recognizable fallback', () => {
    beforeEach(() => {
      mockResolveFileIconUrl.mockReturnValue('');
      mockHasIconUrl.mockReturnValue(false);
    });

    it('unknown extension should render a fallback icon, not nothing', () => {
      const { container } = render(<FileIcon fileName="data.xyz123" />);

      const icon = getRenderedIcon(container);

      // Must render SOMETHING - either img or svg
      expect(icon.type).not.toBe('none');
      expect(icon.element).toBeInTheDocument();
    });

    it('empty filename should not crash, should show fallback', () => {
      const { container } = render(<FileIcon fileName="" />);

      const icon = getRenderedIcon(container);

      expect(icon.element).toBeInTheDocument();
    });

    it('filename with only special characters should show fallback', () => {
      const { container } = render(<FileIcon fileName="@#$%^&" />);

      const icon = getRenderedIcon(container);

      expect(icon.element).toBeInTheDocument();
    });

    it('fallback should be an inline SVG (not broken image)', () => {
      const { container } = render(<FileIcon fileName="unknown.zzz" />);

      const icon = getRenderedIcon(container);

      // Fallback should be SVG, not a broken <img> with missing src
      expect(icon.type).toBe('svg');
    });

    it('fallback SVG should have proper accessibility attributes', () => {
      const { container } = render(<FileIcon fileName="unknown.zzz" />);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();

      // SVG should have viewBox for proper scaling
      expect(svg).toHaveAttribute('viewBox');
    });
  });

  // ===========================================================================
  // SPEC: Theme changes should update icon source
  // ===========================================================================

  describe('SPEC: Theme changes should update which icon is used', () => {
    beforeEach(() => {
      // Simulate different icons per theme
      mockResolveFileIconUrl.mockImplementation((_fileName: string, themeId?: string) => {
        if (themeId === 'material') {
          return '/icons/material/typescript.svg';
        }
        if (themeId === 'none') {
          return '/icons/none/typescript.svg';
        }
        return '/icons/default.svg';
      });
      mockHasIconUrl.mockReturnValue(true);
    });

    it('icon URL should include theme identifier', () => {
      render(<FileIcon fileName="app.ts" />);

      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('app.ts', 'material');
    });

    it('changing theme should request icon from new theme', () => {
      const { rerender } = render(<FileIcon fileName="app.ts" />);

      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('app.ts', 'material');

      // Simulate theme change
      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      rerender(<FileIcon fileName="app.ts" />);

      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('app.ts', 'none');
    });

    it('icon src should actually change when theme changes', () => {
      const { container, rerender } = render(<FileIcon fileName="app.ts" />);

      const initialSrc = getRenderedIcon(container).src;
      expect(initialSrc).toBe('/icons/material/typescript.svg');

      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      rerender(<FileIcon fileName="app.ts" />);

      const newSrc = getRenderedIcon(container).src;
      expect(newSrc).toBe('/icons/none/typescript.svg');
      expect(newSrc).not.toBe(initialSrc);
    });
  });

  // ===========================================================================
  // SPEC: Monochrome mode for dark theme compatibility
  // ===========================================================================

  describe('SPEC: Monochrome mode should support dark theme inversion', () => {
    beforeEach(() => {
      mockResolveFileIconUrl.mockReturnValue('/icons/typescript.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('monochrome=true with invert theme should apply dark mode inversion', () => {
      // Theme uses 'invert' strategy
      useIconThemeStore.setState({
        currentTheme: 'material',
        currentThemeDarkMode: 'invert',
      });

      const { container } = render(<FileIcon fileName="app.ts" monochrome={true} />);

      const icon = getIconElement(container);

      // Should have dark mode inversion class
      expect(icon).toHaveClass('dark:invert');
    });

    it('monochrome=true with non-invert theme should NOT apply inversion', () => {
      // Theme uses 'none' strategy (no inversion needed)
      useIconThemeStore.setState({
        currentTheme: 'none',
        currentThemeDarkMode: 'none',
      });

      const { container } = render(<FileIcon fileName="app.ts" monochrome={true} />);

      const icon = getIconElement(container);

      // Should NOT have dark mode inversion
      expect(icon).not.toHaveClass('dark:invert');
    });

    it('monochrome=false should never apply inversion regardless of theme', () => {
      useIconThemeStore.setState({
        currentTheme: 'material',
        currentThemeDarkMode: 'invert',
      });

      const { container } = render(<FileIcon fileName="app.ts" monochrome={false} />);

      const icon = getIconElement(container);

      expect(icon).not.toHaveClass('dark:invert');
    });

    it('monochrome icons should have slightly reduced opacity for subtlety', () => {
      const { container } = render(<FileIcon fileName="app.ts" monochrome={true} />);

      const icon = getIconElement(container);

      // Monochrome icons are typically slightly muted
      expect(icon).toHaveClass('opacity-80');
    });
  });

  // ===========================================================================
  // EDGE CASES: Things that could break
  // ===========================================================================

  describe('EDGE CASES: Potential failure scenarios', () => {
    beforeEach(() => {
      mockResolveFileIconUrl.mockReturnValue('/icons/default.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('filename with spaces should not break', () => {
      const { container } = render(<FileIcon fileName="my file name.ts" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('filename with unicode characters should not break', () => {
      const { container } = render(<FileIcon fileName="文件.ts" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('very long filename should not break layout', () => {
      const longName = 'a'.repeat(500) + '.ts';
      const { container } = render(<FileIcon fileName={longName} />);

      const icon = getIconElement(container);

      expect(icon).toBeInTheDocument();
      // Should have shrink protection
      expect(icon).toHaveClass('shrink-0');
    });

    it('filename starting with dot (hidden file) should work', () => {
      const { container } = render(<FileIcon fileName=".gitignore" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('.gitignore', expect.any(String));
    });

    it('filename with multiple dots should work', () => {
      const { container } = render(<FileIcon fileName="component.test.spec.tsx" />);

      expect(getRenderedIcon(container).element).toBeInTheDocument();
    });

    it('case sensitivity: same filename different cases should be handled consistently', () => {
      // This tests whether the component handles case correctly
      // The icon loader should determine case policy, not the component
      render(<FileIcon fileName="README.md" />);
      render(<FileIcon fileName="readme.md" />);

      // Both should call the resolver (let resolver decide case handling)
      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('README.md', expect.any(String));
      expect(mockResolveFileIconUrl).toHaveBeenCalledWith('readme.md', expect.any(String));
    });
  });

  // ===========================================================================
  // ACCESSIBILITY: Must not break screen readers
  // ===========================================================================

  describe('ACCESSIBILITY: Screen reader compatibility', () => {
    beforeEach(() => {
      mockResolveFileIconUrl.mockReturnValue('/icons/typescript.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('icon should be decorative (empty alt) since filename provides context', () => {
      const { container } = render(<FileIcon fileName="app.ts" />);

      const img = container.querySelector('img');
      if (img) {
        // Decorative images should have empty alt
        expect(img).toHaveAttribute('alt', '');
      }
    });

    it('icon should not be draggable (prevents accidental drag)', () => {
      const { container } = render(<FileIcon fileName="app.ts" />);

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
      mockResolveFileIconUrl.mockReturnValue('/icons/typescript.svg');
      mockHasIconUrl.mockReturnValue(true);
    });

    it('custom className should be applied to icon', () => {
      const { container } = render(<FileIcon fileName="app.ts" className="w-6 h-6" />);

      const icon = getIconElement(container);

      expect(icon).toHaveClass('w-6');
      expect(icon).toHaveClass('h-6');
    });

    it('custom className should work with fallback SVG too', () => {
      mockHasIconUrl.mockReturnValue(false);

      const { container } = render(<FileIcon fileName="unknown.xyz" className="w-8 h-8" />);

      const icon = getIconElement(container);

      expect(icon).toHaveClass('w-8');
      expect(icon).toHaveClass('h-8');
    });
  });
});
