import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import { clearEditor } from '../bridge';

import type { LexicalEditor } from 'lexical';

interface EditorRefPluginProps {
  readonly editorRef: React.RefObject<LexicalEditor | null>;
}

interface OrbitEditorWindow extends Window {
  __orbit_editor_clear?: (() => void) | undefined;
}

export function EditorRefPlugin({ editorRef }: EditorRefPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const orbitWindow = window as OrbitEditorWindow;
    const clear = (): void => {
      clearEditor(editor);
      editor.focus();
    };

    editorRef.current = editor;
    orbitWindow.__orbit_editor_clear = clear;

    return () => {
      editorRef.current = null;
      if (orbitWindow.__orbit_editor_clear === clear) {
        delete orbitWindow.__orbit_editor_clear;
      }
    };
  }, [editor, editorRef]);

  return null;
}
