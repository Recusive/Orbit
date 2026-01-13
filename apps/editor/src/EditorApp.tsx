/**
 * EditorApp - VS Code-style code editor with AI chat sidebar
 *
 * Layout:
 * - Left sidebar (260px): File Explorer + Git Source Control
 * - Center (65%): Multi-tab code editor with CodeMirror + Terminal
 * - Right panel (35%): Chat interface for AI assistance
 */
import { EditorLayout } from './components/EditorLayout';

import type { FC } from 'react';

export const EditorApp: FC = () => {
  return <EditorLayout />;
};
