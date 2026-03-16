import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import { setEditorText } from '../bridge';

export function PrefillPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handlePrefill = (event: Event): void => {
      const text = (event as CustomEvent<{ text: string }>).detail.text;
      if (text.length === 0) {
        return;
      }

      setEditorText(editor, text);
      editor.focus();
    };

    window.addEventListener('prefillChatInput', handlePrefill);
    return () => {
      window.removeEventListener('prefillChatInput', handlePrefill);
    };
  }, [editor]);

  return null;
}
