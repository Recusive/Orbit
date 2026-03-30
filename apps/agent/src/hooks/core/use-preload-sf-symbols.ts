/**
 * SF Symbol preload — no-op hook kept for semantic clarity in App.tsx.
 *
 * The actual preload happens at module scope in sf-symbol.tsx (runs on
 * import, before any React render). This hook just imports that module
 * to guarantee the side-effect executes, and serves as a grep-able
 * marker in App.tsx for where the preload is wired up.
 */
import '@/components/shared/sf-symbol'; // Side-effect: triggers module-level preload

export function usePreloadSFSymbols(): void {
  // Intentionally empty — preload is module-scoped, not effect-scoped.
  // See sf-symbol.tsx bottom for the actual preloadSFSymbols() call.
}
