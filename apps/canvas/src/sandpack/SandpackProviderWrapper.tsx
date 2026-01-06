/**
 * SandpackProviderWrapper - Stable provider that doesn't remount on code changes
 *
 * This wrapper enables HMR-like behavior by:
 * - Initializing SandpackProvider once with initial files
 * - Using updateFile() for code changes instead of remounting
 * - Only remounting on explicit user refresh
 */
import { SandpackProvider } from '@codesandbox/sandpack-react';
import React, { useMemo, useRef } from 'react';

import { SandpackFileUpdater } from './SandpackFileUpdater';
import { SANDPACK_DEPENDENCIES } from './sandpackConfig';

import type { ReactNode } from 'react';

export interface SandpackProviderWrapperProps {
  /** Node ID for tracking (unused but kept for API consistency) */
  nodeId: string;
  /** Instance ID for message routing */
  instanceId: string;
  /** Current code (will be synced via updateFile) */
  code: string;
  /** Initial files to pass to SandpackProvider */
  initialFiles: Record<string, string>;
  /** Refresh counter - increment to force remount */
  refreshKey?: number;
  /** Children to render inside provider */
  children: ReactNode;
}

/**
 * Wrapper component that provides stable SandpackProvider with HMR updates
 */
export function SandpackProviderWrapper(props: SandpackProviderWrapperProps): React.JSX.Element {
  const { instanceId, code, initialFiles, refreshKey = 0, children } = props;
  // nodeId is part of the API for consistency but not used internally
  // Track the initial files - only used on mount or refresh
  const initialFilesRef = useRef(initialFiles);

  // Use refreshKey + instanceId for stable key
  // Only changes when explicitly refreshed
  const providerKey = `${instanceId}-${String(refreshKey)}`;

  // Memoize files to prevent unnecessary re-renders
  const files = useMemo(
    () => ({
      ...initialFilesRef.current,
      '/App.tsx': code, // Use current code for initial render
    }),
    [code]
  );

  return (
    <SandpackProvider
      key={providerKey}
      template="react-ts"
      theme="light"
      files={files}
      customSetup={{
        dependencies: SANDPACK_DEPENDENCIES,
      }}
      options={{
        externalResources: ['https://cdn.tailwindcss.com'],
      }}
    >
      {/* File updater handles live code sync */}
      <SandpackFileUpdater code={code} filePath="/App.tsx" />
      {children}
    </SandpackProvider>
  );
}
