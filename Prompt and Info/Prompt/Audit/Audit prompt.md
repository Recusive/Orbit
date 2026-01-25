<!-- markdownlint-disable -->

I need you to perform a comprehensive code review and architectural audit of a proposed refactor plan for an extensible icon theme system. The
plan is at:  
 docs/ICON-THEME-SYSTEM.md

Context: This is for a production AI code editor (like VS Code/Cursor). The icon system renders 100+ file/folder icons in the file explorer  
 using Vite's import.meta.glob() for build-time SVG loading. We're refactoring to add a provider-based architecture that enables future custom  
 icon themes while keeping the current Material theme as default.

Please audit against these criteria:

## 1. CORRECTNESS & PROVEN PATTERNS

- Read the current implementations:
  - apps/agent/src/components/files/file-icon.tsx
  - apps/agent/src/components/files/folder-icon.tsx
  - apps/agent/src/lib/utils/iconMap.ts
- Does the proposed IconThemeProvider correctly abstract the icon resolution?
- Is React Context the right pattern for this, or would Zustand be more consistent with the codebase?
- Will icon resolution remain O(1) after the refactor?
- Any risk of breaking the existing Vite glob loading pattern?  


## 2. ARCHITECTURE & DESIGN

- Read how other providers work: apps/agent/src/providers/theme-provider.tsx
- Is the provider API surface (getFileIconUrl, getFolderIconUrl) the right abstraction?
- Should icon loading be in a provider, or a standalone hook (useIconLoader)?
- Is centralizing the glob import in icon-loader.ts better than keeping it in components?
- How does this integrate with the existing theme-provider.tsx (light/dark mode)?  


## 3. PERFORMANCE

- Current: Each component has its own eager glob import. Proposed: Single shared loader.
- Does moving glob imports to a shared module change Vite's tree-shaking behavior?
- Will useIconTheme() hook cause unnecessary re-renders in file tree rows?
- Should icon URLs be memoized at the provider level or component level?
- Any bundle size impact from the refactor?  


## 4. REACT + VITE BEST PRACTICES

- Read how other providers in apps/agent/src/providers/ are structured
- Is the proposed pattern consistent with the codebase conventions?
- Should we use React.memo() on the icon components to prevent re-renders?
- Is eager loading (current) still the right choice, or should we consider lazy loading for future themes?  


## 5. PRODUCTION READINESS (NOT MVP)

- Error handling: What if an icon doesn't exist in the theme?
- Fallback chain: file-specific → extension → default - is this robust?
- Edge cases: Empty filename, unusual extensions (e.g., .d.ts), symlinks?
- Type safety: Are all TypeScript types strict (no any)?
- What happens if the provider isn't mounted (missing context)?  


## 6. FUTURE EXTENSIBILITY

- Does the architecture support loading themes from ~/.orbit/icon-themes/ later?
- Can we add VS Code icon theme JSON format compatibility without major changes?
- Is there a clean path to add a theme picker UI in settings?
- Should we define a formal IconTheme interface/schema now for forward compatibility?  


## 7. MISSING CONSIDERATIONS

- Does the plan address the monochrome/dark mode inversion (dark:invert CSS)?
- How do custom themes handle light/dark mode variants?
- Should there be theme validation (required icons, format checks)?
- Is localStorage the right persistence for theme selection, or should it go to settings backend?  


## 8. TEST COVERAGE

- Are there existing tests for icon components to verify no regressions?
- Should we add unit tests for icon-loader.ts resolution logic?
- Should we add visual regression tests for the file explorer?
- How do we test that all 100+ icons still render correctly?  


Output format:

1. Summary verdict (APPROVE / APPROVE WITH CHANGES / NEEDS REWORK)
2. Critical issues (must fix before implementation)
3. Recommended improvements (should consider)
4. Nice-to-haves (optional enhancements)
5. Specific code suggestions with examples  


Be thorough - this is production code that renders icons for every file in the explorer. A bug here affects the entire UI. Don't rubber-stamp  
 it.
