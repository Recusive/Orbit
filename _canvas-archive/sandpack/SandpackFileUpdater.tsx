/**
 * SandpackFileUpdater - Syncs code changes via updateFile API
 *
 * This component lives inside SandpackProvider and uses useSandpack()
 * to update files without remounting the provider.
 */
import { useSandpack } from '@codesandbox/sandpack-react';
import { useEffect, useRef } from 'react';

export interface SandpackFileUpdaterProps {
  /** The code to sync */
  code: string;
  /** The file path to update (default: /App.tsx) */
  filePath?: string;
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
}

/**
 * Component that syncs code changes to Sandpack via updateFile
 *
 * Renders nothing - purely for side effects
 */
export function SandpackFileUpdater({
  code,
  filePath = '/App.tsx',
  debounceMs = 100,
}: SandpackFileUpdaterProps): null {
  const { sandpack } = useSandpack();
  const lastCodeRef = useRef<string>(code);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip if code hasn't changed
    if (code === lastCodeRef.current) {
      return;
    }

    // Clear any pending update
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the update to prevent rapid-fire changes
    debounceRef.current = setTimeout(() => {
      try {
        sandpack.updateFile(filePath, code);
        lastCodeRef.current = code;
      } catch {
        // updateFile can throw if provider is unmounting - safe to ignore
      }
    }, debounceMs);

    return (): void => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [code, filePath, sandpack, debounceMs]);

  // Render nothing
  return null;
}
