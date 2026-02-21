/**
 * EditorLayout - Thin wrapper around EditorCenter
 *
 * The editor sidebar content (Explorer / Source Control) is now provided by
 * PrimarySidebar in editor mode, and the chat panel lives in the ActivityCard
 * slot in App.tsx — so EditorLayout only needs to render the editor center.
 */
import { useEffect, useState } from 'react';

import { EditorCenter } from './EditorCenter';

import type { FC } from 'react';

export const EditorLayout: FC = () => {
  // Suppress initial visibility for two frames so nested layout instances
  // can calculate panel sizes before painting.
  // Frame 1: outer container computes EditorCenter width
  // Frame 2: inner ResizablePanelGroup (vertical) computes content/terminal heights
  const [mountReady, setMountReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        setMountReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full w-full bg-chat-area" style={{ opacity: mountReady ? 1 : 0 }}>
      <EditorCenter />
    </div>
  );
};
